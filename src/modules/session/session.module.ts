import { Module } from '@nestjs/common';
import { SessionRepositoryModule } from '@modules/session/repository/session.repository.module';
import { SessionService } from '@modules/session/services/session.service';
import { TrackingModule } from '@modules/tracking/tracking.module';

@Module({
    // TrackingModule: AuditLogService records sign-out (session revoke).
    imports: [SessionRepositoryModule, TrackingModule],
    exports: [SessionService],
    providers: [SessionService],
    controllers: [],
})
export class SessionModule {}
