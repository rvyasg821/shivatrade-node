import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ComplianceNotificationLogEntity } from '../entities/compliance-notification-log.entity';

@Injectable()
export class ComplianceNotificationLogRepository extends DatabaseObjectIdRepositoryBase<ComplianceNotificationLogEntity> {
    constructor(
        @InjectDatabaseModel(ComplianceNotificationLogEntity)
        private readonly repo: Repository<ComplianceNotificationLogEntity>
    ) {
        super(repo);
    }
}
