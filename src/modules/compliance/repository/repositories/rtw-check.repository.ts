import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RtwCheckEntity } from '../entities/rtw-check.entity';

@Injectable()
export class RtwCheckRepository extends DatabaseObjectIdRepositoryBase<RtwCheckEntity> {
    constructor(
        @InjectDatabaseModel(RtwCheckEntity)
        private readonly repo: Repository<RtwCheckEntity>
    ) {
        super(repo);
    }
}
