import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { PriceListDoc } from '../repository/entities/price-list.entity';
import { PriceListCreateRequestDto } from '../dtos/request/price-list.create.request.dto';
import { PriceListUpdateRequestDto } from '../dtos/request/price-list.update.request.dto';
import { PriceListGetResponseDto } from '../dtos/response/price-list.get.response.dto';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';

@Injectable()
export class PriceListService {
    private readonly logger = new Logger(PriceListService.name);

    constructor(
        private readonly priceListRepository: PriceListRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly productRepository: ProductRepository,
        private readonly currencyRepository: CurrencyRepository
    ) {}

    private async assertReferences(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId: string
    ): Promise<void> {
        const vendor = await this.vendorRepository.findOne({
            _id: vendorId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!vendor) throw new BadRequestException('Vendor not found');

        const product = await this.productRepository.findOne({
            _id: productId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!product) throw new BadRequestException('Product not found');

        const currency = await this.currencyRepository.findOne({
            _id: currencyId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!currency) throw new BadRequestException('Currency not found');
    }

    async create(
        companyId: string,
        data: PriceListCreateRequestDto,
        createdBy: string
    ): Promise<PriceListDoc> {
        await this.assertReferences(
            companyId,
            data.vendor_id,
            data.product_id,
            data.currency_id
        );

        const row = await this.priceListRepository.create({
            ...data,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        this.logger.log(
            `Price list entry created: ${row._id} (vendor ${data.vendor_id}, product ${data.product_id})`
        );
        return row;
    }

    async findOneById(id: string): Promise<PriceListDoc> {
        const row = await this.priceListRepository.findOneById(id);
        if (!row) throw new NotFoundException('Price list entry not found');
        return row;
    }

    async update(
        row: PriceListDoc,
        data: PriceListUpdateRequestDto
    ): Promise<PriceListDoc> {
        const companyId = row.company_id.toString();

        if (data.vendor_id || data.product_id || data.currency_id) {
            await this.assertReferences(
                companyId,
                data.vendor_id || row.vendor_id.toString(),
                data.product_id || row.product_id.toString(),
                data.currency_id || row.currency_id.toString()
            );
        }

        Object.assign(row, data);
        const updated = await this.priceListRepository.save(row);

        this.logger.log(`Price list entry updated: ${row._id}`);
        return updated;
    }

    async hardDelete(row: PriceListDoc): Promise<void> {
        await this.priceListRepository.deleteMany({ _id: row._id.toString() } as any);
        this.logger.log(`Price list entry deleted: ${row._id}`);
    }

    async getCurrentPrice(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId?: string
    ): Promise<PriceListDoc | null> {
        return this.priceListRepository.findCurrentPrice(
            companyId,
            vendorId,
            productId,
            currencyId
        );
    }

    // ─── Mapping ────────────────────────────────────────────────────────

    async mapList(rows: PriceListDoc[]): Promise<PriceListGetResponseDto[]> {
        if (!rows.length) return [];

        const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id.toString())));
        const productIds = Array.from(new Set(rows.map((r) => r.product_id.toString())));
        const currencyIds = Array.from(new Set(rows.map((r) => r.currency_id.toString())));

        const [vendors, products, currencies] = await Promise.all([
            this.vendorRepository.findAll({ _id: { $in: vendorIds } } as any),
            this.productRepository.findAll({ _id: { $in: productIds } } as any),
            this.currencyRepository.findAll({ _id: { $in: currencyIds } } as any),
        ]);

        const vendorMap: Record<string, any> = {};
        vendors.forEach((v: any) => (vendorMap[v._id.toString()] = v));

        const productMap: Record<string, any> = {};
        products.forEach((p: any) => (productMap[p._id.toString()] = p));

        const currencyMap: Record<string, any> = {};
        currencies.forEach((c: any) => (currencyMap[c._id.toString()] = c));

        // Build a lookup of effective_dates per (vendor, product) for derived
        // valid_until calculation. We only need rows in the same set (same
        // company already, since list endpoint filtered).
        const companyId = rows[0].company_id.toString();
        const allForDerivation =
            await this.priceListRepository.findNextRowsAfter(
                companyId,
                rows.map((r) => ({
                    vendor_id: r.vendor_id.toString(),
                    product_id: r.product_id.toString(),
                    effective_date: r.effective_date,
                }))
            );
        const datesByPair: Record<string, string[]> = {};
        for (const r of allForDerivation) {
            const key = `${r.vendor_id}|${r.product_id}`;
            (datesByPair[key] ||= []).push(r.effective_date);
        }
        Object.values(datesByPair).forEach((arr) => arr.sort());

        const minusOneDay = (iso: string): string => {
            const d = new Date(iso);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
        };

        return rows.map((r) => {
            const dto = plainToInstance(PriceListGetResponseDto, r);
            const v = vendorMap[r.vendor_id.toString()];
            const p = productMap[r.product_id.toString()];
            const c = currencyMap[r.currency_id.toString()];
            dto.vendor_name = v?.company_name;
            dto.vendor_code = v?.vendor_code;
            dto.product_code = p?.code;
            dto.product_name = p?.name;
            dto.currency_code = c?.code;
            dto.currency_symbol = c?.symbol;

            // Derive effective_until: explicit valid_until wins; otherwise
            // (next row's effective_date − 1 day) for same (vendor, product).
            if (r.valid_until) {
                dto.effective_until = r.valid_until;
            } else {
                const key = `${r.vendor_id}|${r.product_id}`;
                const dates = datesByPair[key] || [];
                const next = dates.find((d) => d > r.effective_date);
                dto.effective_until = next ? minusOneDay(next) : undefined;
            }
            return dto;
        });
    }

    async mapGet(row: PriceListDoc): Promise<PriceListGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }
}
