import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PayElementEntity } from '../entities/pay-element.entity';

@Injectable()
export class PayElementRepository extends DatabaseObjectIdRepositoryBase<PayElementEntity> {
    constructor(
        @InjectDatabaseModel(PayElementEntity)
        private readonly repo: Repository<PayElementEntity>
    ) {
        super(repo);
    }
}
