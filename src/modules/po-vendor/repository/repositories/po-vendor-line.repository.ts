import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PoVendorLineEntity } from '../entities/po-vendor-line.entity';

@Injectable()
export class PoVendorLineRepository extends DatabaseObjectIdRepositoryBase<PoVendorLineEntity> {
    constructor(
        @InjectDatabaseModel(PoVendorLineEntity)
        private readonly poVendorLineRepository: Repository<PoVendorLineEntity>
    ) {
        super(poVendorLineRepository);
    }

    async deleteByPoVendorId(poVendorId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('po_vendor_id = :id', { id: poVendorId })
            .execute();
    }
}
