import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    VendorAddressDoc,
    VendorAddressEntity,
} from '../entities/vendor-address.entity';

@Injectable()
export class VendorAddressRepository extends DatabaseObjectIdRepositoryBase<VendorAddressEntity> {
    constructor(
        @InjectDatabaseModel(VendorAddressEntity)
        private readonly vaRepository: Repository<VendorAddressEntity>
    ) {
        super(vaRepository);
    }

    async findByVendorId(vendorId: string): Promise<VendorAddressDoc[]> {
        return this.findAll({ vendor_id: vendorId, soft_delete: false });
    }

    async findByVendorIds(vendorIds: string[]): Promise<VendorAddressDoc[]> {
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
