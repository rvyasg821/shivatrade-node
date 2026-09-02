import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ActivityModule } from '@modules/activity/activity.module';

import { AuthModule } from '@modules/auth/auth.module';
import { SessionModule } from '@modules/session/session.module';
import { UserModule } from '@modules/user/user.module';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { ToolsModule } from '@modules/tools/tools.module';
import { CompanyModule } from '@modules/company/company.module';
import { ContractModule } from '@modules/contract/contract.module';
import { ContractEmployeeController } from '@modules/contract/controllers/contract.employee.controller';
import { LeaveModule } from '@modules/leave/leave.module';
import { LeaveEmployeeController } from '@modules/leave/controllers/leave.employee.controller';
import { AttendanceModule } from '@modules/attendance/attendance.module';
import { AttendanceEmployeeController } from '@modules/attendance/controllers/attendance.employee.controller';
import { ShiftModule } from '@modules/shift/shift.module';
import { ShiftEmployeeController } from '@modules/shift/controllers/shift.employee.controller';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { PayrollModule } from '@modules/payroll/payroll.module';
// Payroll hidden (client request) — controller un-registered, hide-only.
// import { PayrollEmployeeController } from '@modules/payroll/controllers/payroll.employee.controller';

// User routes module - Tenant-specific endpoints removed
// All user management now handled through central database via admin/shared routes
@Module({
    controllers: [
        ContractEmployeeController,
        // Hidden (routes disabled):
        LeaveEmployeeController,
        AttendanceEmployeeController,
        ShiftEmployeeController,
        // PayrollEmployeeController, — hidden (client request)
    ],
    providers: [],
    exports: [],
    imports: [
        UserModule,
        AuthModule,
        ActivityModule,
        SessionModule,
        forwardRef(() => ToolsModule),
        forwardRef(() => CompanyModule),
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.EMAIL_QUEUE,
        }),
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.SMS_QUEUE,
        }),
        ContractModule,
        LeaveModule,
        AttendanceModule,
        ShiftModule,
        SubscriptionModule,
        PayrollModule,
    ],
})
export class RoutesUserModule {}
