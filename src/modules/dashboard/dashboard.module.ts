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
import { LeadRepositoryModule } from '@modules/lead/repository/lead.repository.module';
import { QuotationRepositoryModule } from '@modules/quotation/repository/quotation.repository.module';
import { PfiRepositoryModule } from '@modules/pfi/repository/pfi.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { TrackingEventRepositoryModule } from '@modules/tracking-event/repository/tracking-event.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { DashboardExportService } from './services/dashboard-export.service';

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
        LeadRepositoryModule,
        QuotationRepositoryModule,
        PfiRepositoryModule,
        PurchaseOrderRepositoryModule,
        PoVendorRepositoryModule,
        TrackingEventRepositoryModule,
        VendorRepositoryModule,
    ],
    controllers: [DashboardAdminController, DashboardCompanyController],
    providers: [DashboardExportService],
    exports: [],
})
export class DashboardModule {}
