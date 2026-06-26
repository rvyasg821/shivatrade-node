import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ProductDoc, ProductEntity } from '../entities/product.entity';

@Injectable()
export class ProductRepository extends DatabaseObjectIdRepositoryBase<
    ProductEntity
> {
    constructor(
        @InjectDatabaseModel(ProductEntity)
        private readonly productRepository: Repository<ProductEntity>
    ) {
        super(productRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<ProductDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    /**
     * Case-insensitive code uniqueness check within a company.
     */
    async isCodeExists(
        companyId: string,
        code: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            code: ILike(code.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);

        const count = await this._repository.count({ where });
        return count > 0;
    }

    /**
     * Case-insensitive name uniqueness check within a company.
     */
    async isNameExists(
        companyId: string,
        name: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            name: ILike(name.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);

        const count = await this._repository.count({ where });
        return count > 0;
    }

    /**
     * Count products that reference a given category — used by Category delete
     * guard in a future iteration.
     */
    async countByCategoryId(categoryId: string): Promise<number> {
        return this._repository.count({
            where: { category_id: categoryId, soft_delete: false } as any,
        });
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
