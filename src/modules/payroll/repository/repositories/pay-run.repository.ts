import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PayRunEntity } from '../entities/pay-run.entity';

@Injectable()
export class PayRunRepository extends DatabaseObjectIdRepositoryBase<PayRunEntity> {
    constructor(
        @InjectDatabaseModel(PayRunEntity)
        private readonly repo: Repository<PayRunEntity>
    ) {
        super(repo);
    }
}
