import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ComplianceEventEntity } from '../entities/compliance-event.entity';

@Injectable()
export class ComplianceEventRepository extends DatabaseObjectIdRepositoryBase<ComplianceEventEntity> {
    constructor(
        @InjectDatabaseModel(ComplianceEventEntity)
        private readonly repo: Repository<ComplianceEventEntity>
    ) {
        super(repo);
    }
}
