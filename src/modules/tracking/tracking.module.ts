import { Module } from '@nestjs/common';
import { TrackingRepositoryModule } from './repository/tracking.repository.module';
import { ApiCallLogService } from './services/api-call-log.service';
import { AuditLogService } from './services/audit-log.service';
import { TrackingCronService } from './services/tracking-cron.service';
import { ApiCallLogMiddleware } from './middlewares/api-call-log.middleware';
import { AuditSubscriber } from './subscribers/audit.subscriber';
import { ActivityPresenterService } from './services/activity-presenter.service';
import { TrackingQueryService } from './services/tracking-query.service';
import { TrackingAdminController } from './controllers/tracking.admin.controller';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { RequestContextService } from '@common/request/services/request-context.service';
import { RequestContextMiddleware } from '@common/request/middlewares/request-context.middleware';

/**
 * ERP Tracking (ERP_TRACKING_SYSTEM_PLAN §15).
 *
 *   Phase 1 ✅ API-call telemetry — middleware + buffered writer + prune cron.
 *   Phase 2 ✅ Audit trail — AsyncLocalStorage actor + TypeORM subscriber.
 *   Phase 3–5    activity feed, usage metering, SUPER_ADMIN console.
 *
 * Purely additive. Touches no existing entity, DTO, service or controller. The
 * two middlewares are exported so `AppMiddlewareModule` can wire them into the
 * global chain with DI intact.
 */
@Module({
    // UserRepositoryModule: resolves actor names for the activity feed.
    imports: [TrackingRepositoryModule, UserRepositoryModule],
    providers: [
        RequestContextService,
        RequestContextMiddleware,
        ApiCallLogService,
        AuditLogService,
        TrackingCronService,
        TrackingQueryService,
        ActivityPresenterService,
        ApiCallLogMiddleware,
        // Self-registers on the DataSource in its constructor. Must be
        // instantiated eagerly, which being a provider guarantees.
        AuditSubscriber,
    ],
    exports: [
        TrackingRepositoryModule,
        RequestContextService,
        RequestContextMiddleware,
        ApiCallLogService,
        AuditLogService,
        TrackingCronService,
        TrackingQueryService,
        ApiCallLogMiddleware,
    ],
    controllers: [TrackingAdminController],
})
export class TrackingModule {}
