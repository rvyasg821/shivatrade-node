import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ProductRebateDoc,
    ProductRebateEntity,
} from '../entities/product-rebate.entity';

@Injectable()
export class ProductRebateRepository extends DatabaseObjectIdRepositoryBase<ProductRebateEntity> {
    constructor(
        @InjectDatabaseModel(ProductRebateEntity)
        private readonly prRepository: Repository<ProductRebateEntity>
    ) {
        super(prRepository);
    }

    async findByProductId(productId: string): Promise<ProductRebateDoc[]> {
        return this.findAll({ product_id: productId });
    }

    async findByProductIds(productIds: string[]): Promise<ProductRebateDoc[]> {
        if (productIds.length === 0) return [];
        return this._repository.find({
            where: { product_id: In(productIds) } as any,
        });
    }

    async deleteByProductId(productId: string): Promise<void> {
        await this._repository.delete({ product_id: productId } as any);
    }

    /** Hard-delete every row for a company — used by the product purge. */
    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
