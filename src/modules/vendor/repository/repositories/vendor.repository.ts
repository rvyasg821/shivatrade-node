import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { VendorDoc, VendorEntity } from '../entities/vendor.entity';

@Injectable()
export class VendorRepository extends DatabaseObjectIdRepositoryBase<VendorEntity> {
    constructor(
        @InjectDatabaseModel(VendorEntity)
        private readonly vendorRepository: Repository<VendorEntity>
    ) {
        super(vendorRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<VendorDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    async isCompanyNameExists(
        companyId: string,
        name: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            company_name: ILike(name.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    /**
     * Case-insensitive vendor_code uniqueness check within a company.
     * Returns false for empty/null codes (vendor_code is optional). Excludes
     * soft-deleted rows so a code can be reused after a vendor is deleted.
     */
    async isVendorCodeExists(
        companyId: string,
        vendorCode: string,
        excludeId?: string
    ): Promise<boolean> {
        if (!vendorCode || !vendorCode.trim()) return false;
        const where: any = {
            company_id: companyId,
            vendor_code: ILike(vendorCode.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
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
