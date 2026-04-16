import { Module, forwardRef } from '@nestjs/common';
import { EmployeeRepositoryModule } from './repository/employee.repository.module';
import { EmployeeService } from './services/employee.service';
import { EmployeeValidationService } from './services/employee.validation.service';
import { EmployeeImportExportService } from './services/employee.import-export.service';
import { EmployeeAdminController } from './controllers/employee.admin.controller';
import { LocationModule } from '@modules/location/location.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AttendanceModule } from '@modules/attendance/attendance.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { EmailModule } from '@modules/email/email.module';
import { CompanyLookupModule } from '@modules/company-lookup/company-lookup.module';
import { DocumentModule } from '@modules/document/document.module';
import { ContractModule } from '@modules/contract/contract.module';
import { CompanyModule } from '@modules/company/company.module';
import { SessionModule } from '@modules/session/session.module';
import { ComplianceModule } from '@modules/compliance/compliance.module';

@Module({
    imports: [
        EmployeeRepositoryModule,
        forwardRef(() => LocationModule),
        forwardRef(() => SubscriptionModule),
        forwardRef(() => UserModule),
        forwardRef(() => RoleModule),
        forwardRef(() => AuthModule),
        forwardRef(() => AttendanceModule),
        CompanySettingsModule,
        EmailModule,
        CompanyLookupModule,
        forwardRef(() => DocumentModule),
        forwardRef(() => ContractModule),
        forwardRef(() => CompanyModule),
        SessionModule,
        forwardRef(() => ComplianceModule),
    ],
    providers: [
        EmployeeService,
        EmployeeValidationService,
        EmployeeImportExportService,
    ],
    exports: [
        EmployeeRepositoryModule,
        EmployeeService,
        EmployeeValidationService,
        EmployeeImportExportService,
    ],
    controllers: [
        EmployeeAdminController,
    ],
})
export class EmployeeModule {}
