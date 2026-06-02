import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RfqVendorDoc, RfqVendorEntity } from '../entities/rfq-vendor.entity';

@Injectable()
export class RfqVendorRepository extends DatabaseObjectIdRepositoryBase<RfqVendorEntity> {
    constructor(
        @InjectDatabaseModel(RfqVendorEntity)
        private readonly rfqVendorRepository: Repository<RfqVendorEntity>
    ) {
        super(rfqVendorRepository);
    }

    async findByRfqId(rfqId: string): Promise<RfqVendorDoc[]> {
        return this._repository.find({
            where: { rfq_id: rfqId, soft_delete: false } as any,
            order: { createdAt: 'ASC' },
        });
    }

    async deleteByRfqId(rfqId: string): Promise<void> {
        await this._repository.delete({ rfq_id: rfqId } as any);
    }
}
