import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    VendorContactDoc,
    VendorContactEntity,
} from '../entities/vendor-contact.entity';

@Injectable()
export class VendorContactRepository extends DatabaseObjectIdRepositoryBase<VendorContactEntity> {
    constructor(
        @InjectDatabaseModel(VendorContactEntity)
        private readonly contactRepository: Repository<VendorContactEntity>
    ) {
        super(contactRepository);
    }

    async findByVendorId(vendorId: string): Promise<VendorContactDoc[]> {
        return this.findAll({ vendor_id: vendorId, soft_delete: false });
    }

    /**
     * Email must be unique among non-deleted vendor contacts within the same
     * company (per spec the constraint is across the users table, but for the
     * separate-table approach we scope it to the company tenant boundary).
     */
    async isEmailExists(
        companyId: string,
        email: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            email: ILike(email.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async softDeleteByVendorId(vendorId: string): Promise<void> {
        await this._repository.update(
            { vendor_id: vendorId, soft_delete: false } as any,
            { soft_delete: true } as any
        );
    }
}
