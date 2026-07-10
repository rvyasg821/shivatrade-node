import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ApiCallLogEntity } from './entities/api-call-log.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { ApiCallLogRepository } from './repositories/api-call-log.repository';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { UsageDailyRollupEntity } from './entities/usage-daily-rollup.entity';
import { UsageDailyRollupRepository } from './repositories/usage-daily-rollup.repository';

@Module({
    providers: [
        ApiCallLogRepository,
        AuditLogRepository,
        UsageDailyRollupRepository,
    ],
    exports: [
        ApiCallLogRepository,
        AuditLogRepository,
        UsageDailyRollupRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [ApiCallLogEntity, AuditLogEntity, UsageDailyRollupEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class TrackingRepositoryModule {}
