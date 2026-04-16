import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ComplianceAuditLogEntity } from '../entities/compliance-audit-log.entity';

@Injectable()
export class ComplianceAuditLogRepository extends DatabaseObjectIdRepositoryBase<ComplianceAuditLogEntity> {
    constructor(
        @InjectDatabaseModel(ComplianceAuditLogEntity)
        private readonly repo: Repository<ComplianceAuditLogEntity>
    ) {
        super(repo);
    }
}
