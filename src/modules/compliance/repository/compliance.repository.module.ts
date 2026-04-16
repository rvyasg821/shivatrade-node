import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ImmigrationRecordEntity } from './entities/immigration-record.entity';
import { RtwCheckEntity } from './entities/rtw-check.entity';
import { ComplianceEventEntity } from './entities/compliance-event.entity';
import { ComplianceAuditLogEntity } from './entities/compliance-audit-log.entity';
import { ComplianceNotificationLogEntity } from './entities/compliance-notification-log.entity';
import { ImmigrationRecordRepository } from './repositories/immigration-record.repository';
import { RtwCheckRepository } from './repositories/rtw-check.repository';
import { ComplianceEventRepository } from './repositories/compliance-event.repository';
import { ComplianceAuditLogRepository } from './repositories/compliance-audit-log.repository';
import { ComplianceNotificationLogRepository } from './repositories/compliance-notification-log.repository';

@Module({
    providers: [
        ImmigrationRecordRepository,
        RtwCheckRepository,
        ComplianceEventRepository,
        ComplianceAuditLogRepository,
        ComplianceNotificationLogRepository,
    ],
    exports: [
        ImmigrationRecordRepository,
        RtwCheckRepository,
        ComplianceEventRepository,
        ComplianceAuditLogRepository,
        ComplianceNotificationLogRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                ImmigrationRecordEntity,
                RtwCheckEntity,
                ComplianceEventEntity,
                ComplianceAuditLogEntity,
                ComplianceNotificationLogEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ComplianceRepositoryModule {}
