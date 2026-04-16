import { Module, forwardRef } from '@nestjs/common';
import { PayrollRepositoryModule } from './repository/payroll.repository.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { EmployeeRepositoryModule } from '@modules/employee/repository/employee.repository.module';
import { LeaveRepositoryModule } from '@modules/leave/repository/leave.repository.module';
import { AttendanceRepositoryModule } from '@modules/attendance/repository/attendance.repository.module';
import { CompanyModule } from '@modules/company/company.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';

import { PayScheduleService } from './services/pay-schedule.service';
import { PayElementService } from './services/pay-element.service';
import { PayRunService } from './services/pay-run.service';
import { PayslipService } from './services/payslip.service';
import { PayrollCalculationService } from './services/payroll-calculation.service';
import { PayslipPdfService } from './services/payslip-pdf.service';
import { PaymentFileService } from './services/payment-file.service';

@Module({
    imports: [
        PayrollRepositoryModule,
        UserRepositoryModule,
        EmployeeRepositoryModule,
        LeaveRepositoryModule,
        AttendanceRepositoryModule,
        CompanyModule,
        forwardRef(() => SubscriptionModule),
    ],
    providers: [
        PayScheduleService,
        PayElementService,
        PayRunService,
        PayslipService,
        PayrollCalculationService,
        PayslipPdfService,
        PaymentFileService,
    ],
    exports: [
        PayScheduleService,
        PayElementService,
        PayRunService,
        PayslipService,
        PayrollCalculationService,
        PayslipPdfService,
        PaymentFileService,
    ],
})
export class PayrollModule {}
