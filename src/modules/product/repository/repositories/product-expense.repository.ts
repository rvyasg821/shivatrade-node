import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ProductExpenseDoc,
    ProductExpenseEntity,
} from '../entities/product-expense.entity';

@Injectable()
export class ProductExpenseRepository extends DatabaseObjectIdRepositoryBase<ProductExpenseEntity> {
    constructor(
        @InjectDatabaseModel(ProductExpenseEntity)
        private readonly peRepository: Repository<ProductExpenseEntity>
    ) {
        super(peRepository);
    }

    async findByProductId(productId: string): Promise<ProductExpenseDoc[]> {
        return this.findAll({ product_id: productId });
    }

    async findByProductIds(productIds: string[]): Promise<ProductExpenseDoc[]> {
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
