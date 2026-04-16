import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ImmigrationRecordEntity } from '../entities/immigration-record.entity';

@Injectable()
export class ImmigrationRecordRepository extends DatabaseObjectIdRepositoryBase<ImmigrationRecordEntity> {
    constructor(
        @InjectDatabaseModel(ImmigrationRecordEntity)
        private readonly repo: Repository<ImmigrationRecordEntity>
    ) {
        super(repo);
    }
}
