import { Injectable } from '@nestjs/common';
import {
    Repository,
    LessThanOrEqual,
    MoreThanOrEqual,
    IsNull,
    In,
} from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PriceListDoc, PriceListEntity } from '../entities/price-list.entity';

@Injectable()
export class PriceListRepository extends DatabaseObjectIdRepositoryBase<PriceListEntity> {
    constructor(
        @InjectDatabaseModel(PriceListEntity)
        private readonly priceListRepository: Repository<PriceListEntity>
    ) {
        super(priceListRepository);
    }

    /**
     * Most-recent active price for (vendor, product) as of `asOfDate`
     * (defaults to today). Future-dated rows are ignored. Rows with an
     * explicit `valid_until` earlier than `asOfDate` are excluded.
     * Optional currency filter; otherwise picks newest across any currency.
     */
    async findCurrentPrice(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId?: string,
        asOfDate?: string
    ): Promise<PriceListDoc | null> {
        const today = asOfDate || new Date().toISOString().slice(0, 10);
        const baseWhere: any = {
            company_id: companyId,
            vendor_id: vendorId,
            product_id: productId,
            effective_date: LessThanOrEqual(today),
        };
        if (currencyId) baseWhere.currency_id = currencyId;

        // Match rows where valid_until is null OR valid_until >= today.
        const rows = await this._repository.find({
            where: [
                { ...baseWhere, valid_until: IsNull() },
                { ...baseWhere, valid_until: MoreThanOrEqual(today) },
            ],
            order: { effective_date: 'DESC', createdAt: 'DESC' },
            take: 1,
        });
        return rows[0] || null;
    }

    /**
     * Primary vendor row for a product — Costing Sheet / fresh PO defaults.
     */
    async findPrimaryForProduct(
        companyId: string,
        productId: string,
        asOfDate?: string
    ): Promise<PriceListDoc | null> {
        const today = asOfDate || new Date().toISOString().slice(0, 10);
        const baseWhere: any = {
            company_id: companyId,
            product_id: productId,
            is_primary: true,
            effective_date: LessThanOrEqual(today),
        };
        const rows = await this._repository.find({
            where: [
                { ...baseWhere, valid_until: IsNull() },
                { ...baseWhere, valid_until: MoreThanOrEqual(today) },
            ],
            order: { effective_date: 'DESC', createdAt: 'DESC' },
            take: 1,
        });
        return rows[0] || null;
    }

    /**
     * Find primary rows for the given (company, product), regardless of date.
     * Used by the service to clear other primaries when toggling on.
     */
    async findPrimaryRows(
        companyId: string,
        productId: string
    ): Promise<PriceListDoc[]> {
        return this._repository.find({
            where: {
                company_id: companyId,
                product_id: productId,
                is_primary: true,
            } as any,
        });
    }

    /**
     * Find the next-effective row after a given (vendor, product, date) — used
     * to derive `effective_until` when no explicit `valid_until` was set.
     */
    async findNextRowsAfter(
        companyId: string,
        pairs: { vendor_id: string; product_id: string; effective_date: string }[]
    ): Promise<PriceListDoc[]> {
        if (pairs.length === 0) return [];
        const productIds = Array.from(new Set(pairs.map((p) => p.product_id)));
        const vendorIds = Array.from(new Set(pairs.map((p) => p.vendor_id)));
        return this._repository.find({
            where: {
                company_id: companyId,
                vendor_id: In(vendorIds),
                product_id: In(productIds),
            } as any,
            order: { effective_date: 'ASC', createdAt: 'ASC' },
        });
    }

    async deleteByVendorId(vendorId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('vendor_id = :id', { id: vendorId })
            .execute();
    }

    async deleteByProductId(productId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('product_id = :id', { id: productId })
            .execute();
    }
}
