import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    VendorBankAccountDoc,
    VendorBankAccountEntity,
} from '../entities/vendor-bank-account.entity';

@Injectable()
export class VendorBankAccountRepository extends DatabaseObjectIdRepositoryBase<VendorBankAccountEntity> {
    constructor(
        @InjectDatabaseModel(VendorBankAccountEntity)
        private readonly vbaRepository: Repository<VendorBankAccountEntity>
    ) {
        super(vbaRepository);
    }

    async findByVendorId(vendorId: string): Promise<VendorBankAccountDoc[]> {
        return this.findAll({ vendor_id: vendorId, soft_delete: false });
    }

    async findByVendorIds(vendorIds: string[]): Promise<VendorBankAccountDoc[]> {
        if (vendorIds.length === 0) return [];
        return this._repository.find({
            where: { vendor_id: In(vendorIds), soft_delete: false } as any,
        });
    }

    async softDeleteByVendorId(vendorId: string): Promise<void> {
        await this._repository.update(
            { vendor_id: vendorId, soft_delete: false } as any,
            { soft_delete: true } as any
        );
    }
}
