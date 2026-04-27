import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CategoryDoc, CategoryEntity } from '../entities/category.entity';

@Injectable()
export class CategoryRepository extends DatabaseObjectIdRepositoryBase<
    CategoryEntity
> {
    constructor(
        @InjectDatabaseModel(CategoryEntity)
        private readonly categoryRepository: Repository<CategoryEntity>
    ) {
        super(categoryRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<CategoryDoc[]> {
        return this.findAll(
            {
                company_id: companyId,
                soft_delete: false,
            },
            options
        );
    }

    async findActiveByCompanyId(
        companyId: string,
        options?: any
    ): Promise<CategoryDoc[]> {
        return this.findAll(
            {
                company_id: companyId,
                is_active: true,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Case-insensitive duplicate-name check within a company.
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

        if (excludeId) {
            where._id = Not(excludeId);
        }

        const count = await this._repository.count({ where });
        return count > 0;
    }

    /**
     * Count children referencing this category as parent.
     */
    async countChildren(parentId: string): Promise<number> {
        return this._repository.count({
            where: {
                parent_id: parentId,
                soft_delete: false,
            } as any,
        });
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
