import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PayScheduleEntity } from '../entities/pay-schedule.entity';

@Injectable()
export class PayScheduleRepository extends DatabaseObjectIdRepositoryBase<PayScheduleEntity> {
    constructor(
        @InjectDatabaseModel(PayScheduleEntity)
        private readonly repo: Repository<PayScheduleEntity>
    ) {
        super(repo);
    }
}
