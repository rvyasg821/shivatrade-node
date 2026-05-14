import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { ProductService } from '../services/product.service';
import { ProductRepository } from '../repository/repositories/product.repository';
import { ProductRebateRepository } from '../repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '../repository/repositories/product-expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { ProductCreateRequestDto } from '../dtos/request/product.create.request.dto';
import { ProductUpdateRequestDto } from '../dtos/request/product.update.request.dto';
import { ProductGetResponseDto } from '../dtos/response/product.get.response.dto';
import { ProductListResponseDto } from '../dtos/response/product.list.response.dto';

@ApiTags('admin.product')
@Controller({
    version: '1',
    path: '/admin/product',
})
export class ProductAdminController {
    constructor(
        private readonly productService: ProductService,
        private readonly productRepository: ProductRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository
    ) {}

    @Response('product.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ProductCreateRequestDto
    ): Promise<IResponse<ProductGetResponseDto>> {
        const product = await this.productService.create(companyId, body, userId);
        const data = await this.productService.mapGetWithCategory(product);
        return { data };
    }

    @ResponsePaging('product.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('category_id') categoryId?: string
    ): Promise<IResponsePaging<ProductListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        if (categoryId) find.category_id = categoryId;

        if (_search) {
            find.$or = [
                { code: { $regex: _search, $options: 'i' } },
                { name: { $regex: _search, $options: 'i' } },
                { hsn_code: { $regex: _search, $options: 'i' } },
            ];
        }

        const products = await this.productRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.productRepository.getTotal(find);
        const data = await this.productService.mapListWithCategory(products);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('product.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<
        IResponse<
            Array<{
                _id: string;
                code: string;
                name: string;
                unit_of_measure?: string;
                category_id?: string;
                selling_price?: string;
                margin_pct?: string;
                tax_pct?: string;
                currency_id?: string;
                product_rebates?: Array<{
                    rebate_id: string;
                    code?: string;
                    name?: string;
                    pct: string;
                }>;
                product_expenses?: Array<{
                    expense_id: string;
                    code?: string;
                    name?: string;
                    type: string;
                    value: string;
                }>;
            }>
        >
    > {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;

        const products = await this.productRepository.findAll(find, {
            order: { name: 'asc' as any },
        });
        const productIds = products.map((p) => p._id.toString());

        // Fetch all rebate/expense links + their masters in parallel.
        const [rebateLinks, expenseLinks] = await Promise.all([
            productIds.length
                ? this.productRebateRepository.findAll({
                      product_id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
            productIds.length
                ? this.productExpenseRepository.findAll({
                      product_id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const rebateMasterIds = Array.from(
            new Set(rebateLinks.map((l: any) => l.rebate_id?.toString()).filter(Boolean))
        );
        const expenseMasterIds = Array.from(
            new Set(expenseLinks.map((l: any) => l.expense_id?.toString()).filter(Boolean))
        );
        const [rebateMasters, expenseMasters] = await Promise.all([
            rebateMasterIds.length
                ? this.rebateRepository.findAll({
                      _id: { $in: rebateMasterIds },
                  } as any)
                : Promise.resolve([] as any[]),
            expenseMasterIds.length
                ? this.expenseRepository.findAll({
                      _id: { $in: expenseMasterIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const rmMap = new Map(
            rebateMasters.map((m: any) => [m._id.toString(), m])
        );
        const emMap = new Map(
            expenseMasters.map((m: any) => [m._id.toString(), m])
        );
        const rebatesByProduct = new Map<string, any[]>();
        for (const l of rebateLinks as any[]) {
            const m: any = rmMap.get(l.rebate_id?.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            (
                rebatesByProduct.get(pid) ||
                rebatesByProduct.set(pid, []).get(pid)!
            ).push({
                rebate_id: l.rebate_id.toString(),
                code: m.code,
                name: m.name,
                pct: l.pct != null ? String(l.pct) : String(m.pct),
            });
        }
        const expensesByProduct = new Map<string, any[]>();
        for (const l of expenseLinks as any[]) {
            const m: any = emMap.get(l.expense_id?.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            (
                expensesByProduct.get(pid) ||
                expensesByProduct.set(pid, []).get(pid)!
            ).push({
                expense_id: l.expense_id.toString(),
                code: m.code,
                name: m.name,
                type: m.type,
                value: l.value != null ? String(l.value) : String(m.value),
            });
        }

        return {
            data: products.map((p) => ({
                _id: p._id.toString(),
                code: p.code,
                name: p.name,
                unit_of_measure: p.unit_of_measure,
                category_id: p.category_id ? p.category_id.toString() : undefined,
                selling_price: p.selling_price,
                margin_pct: p.margin_pct,
                tax_pct: p.tax_pct,
                currency_id: p.currency_id ? p.currency_id.toString() : undefined,
                product_rebates: rebatesByProduct.get(p._id.toString()) || [],
                product_expenses:
                    expensesByProduct.get(p._id.toString()) || [],
            })),
        };
    }

    @Response('product.get')
    @AuthJwtAccessProtected()
    @Get('/get/:productId')
    async get(
        @Param('productId') productId: string
    ): Promise<IResponse<ProductGetResponseDto>> {
        const product = await this.productService.findOneById(productId);
        const data = await this.productService.mapGetWithCategory(product);
        return { data };
    }

    @Response('product.update')
    @AuthJwtAccessProtected()
    @Put('/update/:productId')
    async update(
        @Param('productId') productId: string,
        @Body() body: ProductUpdateRequestDto
    ): Promise<IResponse<ProductGetResponseDto>> {
        const product = await this.productService.findOneById(productId);
        const updated = await this.productService.update(product, body);
        const data = await this.productService.mapGetWithCategory(updated);
        return { data };
    }

    @Response('product.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:productId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('productId') productId: string
    ): Promise<void> {
        const product = await this.productService.findOneById(productId);
        await this.productService.softDelete(product, userId);
    }

    @Response('product.checkCode')
    @AuthJwtAccessProtected()
    @Post('/check-code')
    async checkCode(
        @AuthJwtPayload('companyId') companyId: string,
        @Body('code') code: string,
        @Body('productId') productId?: string
    ): Promise<IResponse<{ exists: boolean }>> {
        if (!code || !code.trim()) {
            return { data: { exists: false } };
        }
        const exists = await this.productRepository.isCodeExists(
            companyId,
            code,
            productId
        );
        return { data: { exists } };
    }
}
