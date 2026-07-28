import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    VendorCategoryMasterDoc,
    VendorCategoryMasterEntity,
} from '../entities/vendor-category.entity';

@Injectable()
export class VendorCategoryMasterRepository extends DatabaseObjectIdRepositoryBase<VendorCategoryMasterEntity> {
    constructor(
        @InjectDatabaseModel(VendorCategoryMasterEntity)
        private readonly vendorCategoryRepository: Repository<VendorCategoryMasterEntity>
    ) {
        super(vendorCategoryRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<VendorCategoryMasterDoc[]> {
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
    ): Promise<VendorCategoryMasterDoc[]> {
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
     * Case-insensitive duplicate-code check within a company.
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

        if (excludeId) {
            where._id = Not(excludeId);
        }

        const count = await this._repository.count({ where });
        return count > 0;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
