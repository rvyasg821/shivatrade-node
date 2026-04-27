import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    VendorCategoryDoc,
    VendorCategoryEntity,
} from '../entities/vendor-category.entity';

@Injectable()
export class VendorCategoryRepository extends DatabaseObjectIdRepositoryBase<VendorCategoryEntity> {
    constructor(
        @InjectDatabaseModel(VendorCategoryEntity)
        private readonly vcRepository: Repository<VendorCategoryEntity>
    ) {
        super(vcRepository);
    }

    async findByVendorId(vendorId: string): Promise<VendorCategoryDoc[]> {
        return this.findAll({ vendor_id: vendorId });
    }

    async findByVendorIds(vendorIds: string[]): Promise<VendorCategoryDoc[]> {
        if (vendorIds.length === 0) return [];
        return this._repository.find({
            where: { vendor_id: In(vendorIds) } as any,
        });
    }

    async findVendorIdsByCategoryId(
        companyId: string,
        categoryId: string
    ): Promise<string[]> {
        const rows = await this._repository.find({
            where: { company_id: companyId, category_id: categoryId } as any,
            select: ['vendor_id'] as any,
        });
        return rows.map((r) => r.vendor_id.toString());
    }

    /**
     * Hard-delete every link for a vendor (used on update + soft-delete vendor).
     */
    async deleteByVendorId(vendorId: string): Promise<void> {
        await this._repository.delete({ vendor_id: vendorId } as any);
    }
}
