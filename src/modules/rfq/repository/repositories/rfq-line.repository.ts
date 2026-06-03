import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RfqLineDoc, RfqLineEntity } from '../entities/rfq-line.entity';

@Injectable()
export class RfqLineRepository extends DatabaseObjectIdRepositoryBase<RfqLineEntity> {
    constructor(
        @InjectDatabaseModel(RfqLineEntity)
        private readonly rfqLineRepository: Repository<RfqLineEntity>
    ) {
        super(rfqLineRepository);
    }

    async findByRfqId(rfqId: string): Promise<RfqLineDoc[]> {
        return this._repository.find({
            where: { rfq_id: rfqId, soft_delete: false } as any,
            order: { seq: 'ASC' },
        });
    }

    async deleteByRfqId(rfqId: string): Promise<void> {
        await this._repository.delete({ rfq_id: rfqId } as any);
    }
}
