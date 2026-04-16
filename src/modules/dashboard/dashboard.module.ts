import { Module, forwardRef } from '@nestjs/common';
import { DashboardAdminController } from './controllers/dashboard.admin.controller';
import { DashboardCompanyController } from './controllers/dashboard.company.controller';
import { CompanyModule } from '@modules/company/company.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { PaymentModule } from '@modules/payment/payment.module';
import { UserModule } from '@modules/user/user.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { AttendanceModule } from '@modules/attendance/attendance.module';
import { AttendanceRepositoryModule } from '@modules/attendance/repository/attendance.repository.module';
import { LeaveModule } from '@modules/leave/leave.module';
import { LocationModule } from '@modules/location/location.module';
import { RoleModule } from '@modules/role/role.module';
import { EmployeeModule } from '@modules/employee/employee.module';
import { DocumentModule } from '@modules/document/document.module';
import { ContractModule } from '@modules/contract/contract.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { ShiftModule } from '@modules/shift/shift.module';

@Module({
    imports: [
        CompanyModule,
        SubscriptionModule,
        PaymentModule,
        UserModule,
        UserRepositoryModule,
        AttendanceModule,
        AttendanceRepositoryModule,
        LeaveModule,
        LocationModule,
        RoleModule,
        forwardRef(() => EmployeeModule),
        forwardRef(() => DocumentModule),
        forwardRef(() => ContractModule),
        CompanySettingsModule,
        ShiftModule,
    ],
    controllers: [DashboardAdminController, DashboardCompanyController],
    providers: [],
    exports: [],
})
export class DashboardModule {}
