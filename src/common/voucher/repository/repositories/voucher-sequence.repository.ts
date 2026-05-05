import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { VoucherSequenceEntity } from '../entities/voucher-sequence.entity';

@Injectable()
export class VoucherSequenceRepository extends DatabaseObjectIdRepositoryBase<VoucherSequenceEntity> {
    constructor(
        @InjectDatabaseModel(VoucherSequenceEntity)
        private readonly voucherSequenceRepository: Repository<VoucherSequenceEntity>
    ) {
        super(voucherSequenceRepository);
    }
}
