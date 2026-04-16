import { Module, forwardRef } from '@nestjs/common';
import { ComplianceRepositoryModule } from './repository/compliance.repository.module';
import { NotificationModule } from '@modules/notification/notification.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { LocationModule } from '@modules/location/location.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { ImmigrationService } from './services/immigration.service';
import { RtwCheckService } from './services/rtw-check.service';
import { ComplianceEventService } from './services/compliance-event.service';
import { ComplianceAuditService } from './services/compliance-audit.service';
import { ComplianceCronService } from './services/compliance-cron.service';

@Module({
    imports: [
        ComplianceRepositoryModule,
        forwardRef(() => NotificationModule),
        forwardRef(() => UserModule),
        forwardRef(() => RoleModule),
        forwardRef(() => LocationModule),
        CompanySettingsModule,
    ],
    providers: [
        ImmigrationService,
        RtwCheckService,
        ComplianceEventService,
        ComplianceAuditService,
        ComplianceCronService,
    ],
    exports: [
        ComplianceRepositoryModule, // re-export so repositories are available to importing modules
        ImmigrationService,
        RtwCheckService,
        ComplianceEventService,
        ComplianceAuditService,
        ComplianceCronService,
    ],
})
export class ComplianceModule {}
