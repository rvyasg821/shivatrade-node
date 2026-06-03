import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    RfqVendorPriceDoc,
    RfqVendorPriceEntity,
} from '../entities/rfq-vendor-price.entity';

@Injectable()
export class RfqVendorPriceRepository extends DatabaseObjectIdRepositoryBase<RfqVendorPriceEntity> {
    constructor(
        @InjectDatabaseModel(RfqVendorPriceEntity)
        private readonly rfqVendorPriceRepository: Repository<RfqVendorPriceEntity>
    ) {
        super(rfqVendorPriceRepository);
    }

    async findByRfqId(rfqId: string): Promise<RfqVendorPriceDoc[]> {
        return this._repository.find({
            where: { rfq_id: rfqId, soft_delete: false } as any,
        });
    }

    async deleteByRfqId(rfqId: string): Promise<void> {
        await this._repository.delete({ rfq_id: rfqId } as any);
    }
}
