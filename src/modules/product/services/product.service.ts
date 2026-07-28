import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ProductRepository } from '../repository/repositories/product.repository';
import { ProductRebateRepository } from '../repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '../repository/repositories/product-expense.repository';
import { ProductDoc } from '../repository/entities/product.entity';
import {
    ProductCreateRequestDto,
    ProductRebateLinkDto,
    ProductExpenseLinkDto,
} from '../dtos/request/product.create.request.dto';
import { ProductUpdateRequestDto } from '../dtos/request/product.update.request.dto';
import {
    ProductExpenseLinkResponseDto,
    ProductGetResponseDto,
    ProductRebateLinkResponseDto,
} from '../dtos/response/product.get.response.dto';
import { ProductListResponseDto } from '../dtos/response/product.list.response.dto';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { UomService } from '@modules/uom/services/uom.service';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class ProductService {
    private readonly logger = new Logger(ProductService.name);

    constructor(
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly companySettingsService: CompanySettingsService,
        private readonly uomService: UomService
    ) {}

    /**
     * Resolve the product code: use the supplied one, or auto-generate the
     * next sequential code (PRD-0001) from company settings.
     */
    async resolveProductCode(
        companyId: string,
        supplied?: string
    ): Promise<string> {
        const code = (supplied || '').trim();
        if (code) return code;
        const existing = (await this.productRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const existingCodes = existing.map(p => p.code).filter(Boolean);
        return this.companySettingsService.generateProductCode(
            companyId,
            existingCodes
        );
    }

    async create(
        companyId: string,
        data: ProductCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<ProductDoc> {
        // Code is auto-generated (PRD-0001) when not supplied.
        const code = await this.resolveProductCode(companyId, data.code);

        const codeExists = await this.productRepository.isCodeExists(companyId, code);
        if (codeExists) {
            throw new BadRequestException(
                `Product code '${code}' already exists for this company`
            );
        }

        const nameExists = await this.productRepository.isNameExists(
            companyId,
            data.name
        );
        if (nameExists) {
            throw new BadRequestException(
                `Product name '${data.name.trim()}' already exists for this company`
            );
        }

        // Validate the unit against the UOM master. This replaces the old
        // `@IsEnum(ENUM_PRODUCT_UOM)` on the DTO — the enum could not know about
        // units the client added themselves. resolveCode() throws on an unknown
        // or inactive unit and returns the canonical spelling, so a case-variant
        // ("kg") from the Excel import still stores "KG".
        if (data.unit_of_measure) {
            data.unit_of_measure = await this.uomService.resolveCode(
                data.unit_of_measure
            );
        }

        if (data.category_id) {
            await this.assertCategoryValid(companyId, data.category_id);
        }
        await this.assertCurrencyForPrice(companyId, data.selling_price, data.currency_id);
        this.assertWeightConsistent(data.net_weight_per_unit, data.gross_weight_per_unit);
        await this.assertRebatesValid(companyId, data.rebates);
        await this.assertExpensesValid(companyId, data.expenses);

        const { rebates, expenses, ...scalar } = data;

        const product = await this.productRepository.create(
            {
                ...scalar,
                code,
                name: data.name.trim(),
                company_id: companyId,
                created_by: createdBy,
            } as any,
            options
        );

        await this.replaceRebateLinks(companyId, product._id.toString(), rebates);
        await this.replaceExpenseLinks(companyId, product._id.toString(), expenses);

        this.logger.log(`Product created: ${product._id} for company: ${companyId}`);
        return product;
    }

    async findOneById(
        productId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ProductDoc> {
        const product = await this.productRepository.findOneById(productId, options);
        if (!product) {
            throw new NotFoundException('Product not found');
        }
        return product;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<ProductDoc[]> {
        return this.productRepository.findByCompanyId(companyId, options);
    }

    async update(
        product: ProductDoc,
        data: ProductUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<ProductDoc> {
        const companyId = product.company_id.toString();

        // Same master check as create(). Only when the caller actually sends a
        // unit — a partial update that omits it must not touch it.
        if (data.unit_of_measure) {
            data.unit_of_measure = await this.uomService.resolveCode(
                data.unit_of_measure
            );
        }

        if (data.code && data.code.trim() !== product.code) {
            const codeExists = await this.productRepository.isCodeExists(
                companyId,
                data.code.trim(),
                product._id.toString()
            );
            if (codeExists) {
                throw new BadRequestException(
                    `Product code '${data.code.trim()}' already exists for this company`
                );
            }
            data.code = data.code.trim();
        }

        if (data.name) {
            data.name = data.name.trim();
            if (data.name.toLowerCase() !== (product.name || '').trim().toLowerCase()) {
                const nameExists = await this.productRepository.isNameExists(
                    companyId,
                    data.name,
                    product._id.toString()
                );
                if (nameExists) {
                    throw new BadRequestException(
                        `Product name '${data.name}' already exists for this company`
                    );
                }
            }
        }

        if (data.category_id) {
            await this.assertCategoryValid(companyId, data.category_id);
        }

        // Cross-validate the post-update price/currency state. A field that is
        // `undefined` is unchanged (keep the stored value); `null` means the
        // user cleared it, so the new state reflects the clear.
        const nextPrice =
            data.selling_price === undefined
                ? product.selling_price
                : data.selling_price;
        const nextCurrencyId =
            data.currency_id === undefined
                ? product.currency_id
                : data.currency_id;
        if (data.selling_price !== undefined || data.currency_id !== undefined) {
            await this.assertCurrencyForPrice(
                companyId,
                nextPrice as any,
                nextCurrencyId as any
            );
        }
        this.assertWeightConsistent(
            data.net_weight_per_unit === undefined
                ? product.net_weight_per_unit
                : data.net_weight_per_unit,
            data.gross_weight_per_unit === undefined
                ? product.gross_weight_per_unit
                : data.gross_weight_per_unit
        );

        if (data.rebates !== undefined) {
            await this.assertRebatesValid(companyId, data.rebates);
        }
        if (data.expenses !== undefined) {
            await this.assertExpensesValid(companyId, data.expenses);
        }

        const { rebates, expenses, ...scalar } = data;
        Object.assign(product, scalar);
        const updated = await this.productRepository.save(product, options);

        if (rebates !== undefined) {
            await this.replaceRebateLinks(companyId, product._id.toString(), rebates);
        }
        if (expenses !== undefined) {
            await this.replaceExpenseLinks(companyId, product._id.toString(), expenses);
        }

        this.logger.log(`Product updated: ${product._id}`);
        return updated;
    }

    async softDelete(
        product: ProductDoc,
        deletedBy?: string,
        options?: IDatabaseSaveOptions
    ): Promise<ProductDoc> {
        product.soft_delete = true;
        product.is_active = false;
        (product as any).deleted = true;
        (product as any).deletedAt = new Date();
        if (deletedBy) (product as any).deletedBy = deletedBy;

        const updated = await this.productRepository.save(product, options);

        this.logger.log(`Product soft deleted: ${product._id}`);
        return updated;
    }

    /**
     * Bulk soft-delete. Loops the SAME guarded single-delete (findOneById +
     * softDelete) so a product that cannot be deleted is skipped, not
     * force-deleted. Returns the ids actually deleted and the ones skipped
     * with a reason.
     */
    async deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                const product = await this.findOneById(id);
                await this.softDelete(product, deletedBy);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.productRepository.deleteAllByCompanyId(companyId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Validation helpers
    // ─────────────────────────────────────────────────────────────────────

    private async assertCategoryValid(companyId: string, categoryId: string): Promise<void> {
        const category = await this.categoryRepository.findOne({
            _id: categoryId,
            company_id: companyId,
            soft_delete: false,
        });
        if (!category) {
            throw new BadRequestException('Category not found');
        }
    }

    private async assertCurrencyForPrice(
        companyId: string,
        sellingPrice: number | string | undefined | null,
        currencyId: string | undefined | null
    ): Promise<void> {
        const hasPrice =
            sellingPrice !== undefined &&
            sellingPrice !== null &&
            Number(sellingPrice) > 0;
        if (!hasPrice) return;
        if (!currencyId) {
            throw new BadRequestException(
                'Currency is required when a selling price is set'
            );
        }
        const currency = await this.currencyRepository.findOne({
            _id: currencyId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!currency) {
            throw new BadRequestException('Selected currency is invalid');
        }
    }

    private assertWeightConsistent(
        net: number | string | undefined | null,
        gross: number | string | undefined | null
    ): void {
        const n = net == null || net === '' ? NaN : Number(net);
        const g = gross == null || gross === '' ? NaN : Number(gross);
        if (Number.isFinite(n) && Number.isFinite(g) && g < n) {
            throw new BadRequestException(
                'Gross weight must be greater than or equal to net weight'
            );
        }
    }

    private async assertRebatesValid(
        companyId: string,
        links: ProductRebateLinkDto[] | undefined
    ): Promise<void> {
        if (!links || links.length === 0) return;
        const ids = Array.from(new Set(links.map((l) => l.rebate_id)));
        if (ids.length !== links.length) {
            throw new BadRequestException('Duplicate rebate selected');
        }
        const found = await this.rebateRepository.findAll({
            _id: { $in: ids },
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (found.length !== ids.length) {
            throw new BadRequestException('One or more rebates are invalid');
        }
    }

    private async assertExpensesValid(
        companyId: string,
        links: ProductExpenseLinkDto[] | undefined
    ): Promise<void> {
        if (!links || links.length === 0) return;
        const ids = Array.from(new Set(links.map((l) => l.expense_id)));
        if (ids.length !== links.length) {
            throw new BadRequestException('Duplicate expense selected');
        }
        const found = await this.expenseRepository.findAll({
            _id: { $in: ids },
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (found.length !== ids.length) {
            throw new BadRequestException('One or more expenses are invalid');
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Link CRUD (replace-on-update pattern)
    // ─────────────────────────────────────────────────────────────────────

    private async replaceRebateLinks(
        companyId: string,
        productId: string,
        links: ProductRebateLinkDto[] | undefined
    ): Promise<void> {
        await this.productRebateRepository.deleteByProductId(productId);
        if (!links || links.length === 0) return;
        for (const l of links) {
            await this.productRebateRepository.create({
                product_id: productId,
                rebate_id: l.rebate_id,
                company_id: companyId,
                type: l.type ?? null,
                pct: l.pct ?? null,
            } as any);
        }
    }

    private async replaceExpenseLinks(
        companyId: string,
        productId: string,
        links: ProductExpenseLinkDto[] | undefined
    ): Promise<void> {
        await this.productExpenseRepository.deleteByProductId(productId);
        if (!links || links.length === 0) return;
        for (const l of links) {
            await this.productExpenseRepository.create({
                product_id: productId,
                expense_id: l.expense_id,
                company_id: companyId,
                type: l.type ?? null,
                value: l.value ?? null,
            } as any);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Hydration
    // ─────────────────────────────────────────────────────────────────────

    private async buildCategoryNameMap(
        products: ProductDoc[]
    ): Promise<Record<string, string>> {
        const ids = Array.from(
            new Set(
                products
                    .map((p) => (p.category_id ? p.category_id.toString() : null))
                    .filter(Boolean) as string[]
            )
        );
        if (ids.length === 0) return {};

        const cats = await this.categoryRepository.findAll({
            _id: { $in: ids },
            soft_delete: false,
        } as any);

        const map: Record<string, string> = {};
        for (const c of cats) {
            map[c._id.toString()] = c.name;
        }
        return map;
    }

    private async buildCurrencyCodeMap(
        products: ProductDoc[]
    ): Promise<Record<string, string>> {
        const ids = Array.from(
            new Set(
                products
                    .map((p) => (p.currency_id ? p.currency_id.toString() : null))
                    .filter(Boolean) as string[]
            )
        );
        if (ids.length === 0) return {};
        const rows = await this.currencyRepository.findAll({
            _id: { $in: ids },
        } as any);
        const map: Record<string, string> = {};
        for (const r of rows) map[r._id.toString()] = r.code;
        return map;
    }

    /**
     * Hydrate one product with category name, currency code and the
     * effective rebate/expense link rows (deactivated masters are filtered out).
     */
    async mapGetWithRelations(product: ProductDoc): Promise<ProductGetResponseDto> {
        const dto = plainToInstance(ProductGetResponseDto, product);

        if (product.category_id) {
            const cat = await this.categoryRepository.findOneById(
                product.category_id.toString()
            );
            dto.category_name = cat?.name;
        }
        if (product.currency_id) {
            const cur = await this.currencyRepository.findOneById(
                product.currency_id.toString()
            );
            dto.currency_code = cur?.code;
        }

        const [rebateLinks, expenseLinks] = await Promise.all([
            this.productRebateRepository.findByProductId(product._id.toString()),
            this.productExpenseRepository.findByProductId(product._id.toString()),
        ]);

        const rebateIds = Array.from(new Set(rebateLinks.map((l) => l.rebate_id.toString())));
        const expenseIds = Array.from(new Set(expenseLinks.map((l) => l.expense_id.toString())));

        const [rebateMasters, expenseMasters] = await Promise.all([
            rebateIds.length
                ? this.rebateRepository.findAll({
                      _id: { $in: rebateIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : [],
            expenseIds.length
                ? this.expenseRepository.findAll({
                      _id: { $in: expenseIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : [],
        ]);

        const rebateMap = new Map(
            rebateMasters.map((r) => [r._id.toString(), r] as const)
        );
        const expenseMap = new Map(
            expenseMasters.map((e) => [e._id.toString(), e] as const)
        );

        dto.rebates = rebateLinks
            .map((l): ProductRebateLinkResponseDto | null => {
                const m = rebateMap.get(l.rebate_id.toString());
                if (!m) return null; // master inactive — silently drop
                return {
                    _id: l._id.toString(),
                    rebate_id: l.rebate_id.toString(),
                    code: m.code,
                    name: m.name,
                    type: (l as any).type ?? (m as any).type,
                    pct: l.pct != null ? l.pct.toString() : m.pct.toString(),
                    is_override: l.pct != null || (l as any).type != null,
                };
            })
            .filter((x): x is ProductRebateLinkResponseDto => x !== null);

        dto.expenses = expenseLinks
            .map((l): ProductExpenseLinkResponseDto | null => {
                const m = expenseMap.get(l.expense_id.toString());
                if (!m) return null;
                return {
                    _id: l._id.toString(),
                    expense_id: l.expense_id.toString(),
                    code: m.code,
                    name: m.name,
                    type: (l as any).type ?? m.type,
                    value: l.value != null ? l.value.toString() : m.value.toString(),
                    is_override: l.value != null || (l as any).type != null,
                };
            })
            .filter((x): x is ProductExpenseLinkResponseDto => x !== null);

        return dto;
    }

    async mapListWithRelations(
        products: ProductDoc[]
    ): Promise<ProductListResponseDto[]> {
        if (products.length === 0) return [];
        const productIds = products.map((p) => p._id.toString());

        const [catMap, curMap, allRebateLinks, allExpenseLinks] = await Promise.all([
            this.buildCategoryNameMap(products),
            this.buildCurrencyCodeMap(products),
            this.productRebateRepository.findByProductIds(productIds),
            this.productExpenseRepository.findByProductIds(productIds),
        ]);

        const rebateIds = Array.from(
            new Set(allRebateLinks.map((l) => l.rebate_id.toString()))
        );
        const expenseIds = Array.from(
            new Set(allExpenseLinks.map((l) => l.expense_id.toString()))
        );

        const [rebateMasters, expenseMasters] = await Promise.all([
            rebateIds.length
                ? this.rebateRepository.findAll({
                      _id: { $in: rebateIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : [],
            expenseIds.length
                ? this.expenseRepository.findAll({
                      _id: { $in: expenseIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : [],
        ]);
        const rebateMap = new Map(
            rebateMasters.map((r) => [r._id.toString(), r] as const)
        );
        const expenseMap = new Map(
            expenseMasters.map((e) => [e._id.toString(), e] as const)
        );

        const rebatesByProduct: Record<string, ProductRebateLinkResponseDto[]> = {};
        for (const l of allRebateLinks) {
            const m = rebateMap.get(l.rebate_id.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            (rebatesByProduct[pid] ||= []).push({
                _id: l._id.toString(),
                rebate_id: l.rebate_id.toString(),
                code: m.code,
                name: m.name,
                type: (l as any).type ?? (m as any).type,
                pct: l.pct != null ? l.pct.toString() : m.pct.toString(),
                is_override: l.pct != null || (l as any).type != null,
            });
        }

        const expensesByProduct: Record<string, ProductExpenseLinkResponseDto[]> = {};
        for (const l of allExpenseLinks) {
            const m = expenseMap.get(l.expense_id.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            (expensesByProduct[pid] ||= []).push({
                _id: l._id.toString(),
                expense_id: l.expense_id.toString(),
                code: m.code,
                name: m.name,
                type: (l as any).type ?? m.type,
                value: l.value != null ? l.value.toString() : m.value.toString(),
                is_override: l.value != null || (l as any).type != null,
            });
        }

        return products.map((p) => {
            const dto = plainToInstance(ProductListResponseDto, p);
            if (p.category_id) {
                dto.category_name = catMap[p.category_id.toString()];
            }
            if (p.currency_id) {
                dto.currency_code = curMap[p.currency_id.toString()];
            }
            dto.rebates = rebatesByProduct[p._id.toString()] || [];
            dto.expenses = expensesByProduct[p._id.toString()] || [];
            return dto;
        });
    }

    // Backward-compat aliases (existing controller callsites still use these names).
    async mapGetWithCategory(product: ProductDoc): Promise<ProductGetResponseDto> {
        return this.mapGetWithRelations(product);
    }
    async mapListWithCategory(products: ProductDoc[]): Promise<ProductListResponseDto[]> {
        return this.mapListWithRelations(products);
    }
}
