import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
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
     * Most-recent price for (vendor, product) — used by quotations / PO.
     * Optional currency filter; otherwise picks newest across any currency.
     */
    async findCurrentPrice(
        companyId: string,
        vendorId: string,
        productId: string,
        currencyId?: string
    ): Promise<PriceListDoc | null> {
        const where: any = {
            company_id: companyId,
            vendor_id: vendorId,
            product_id: productId,
        };
        if (currencyId) where.currency_id = currencyId;

        const row = await this._repository.findOne({
            where,
            order: { effective_date: 'DESC', createdAt: 'DESC' },
        });
        return row || null;
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
