import { Module, forwardRef } from '@nestjs/common';
import { LeaveRepositoryModule } from './repository/leave.repository.module';
import { HolidayCalendarModule } from '@modules/holiday-calendar/holiday-calendar.module';
import { LocationModule } from '@modules/location/location.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AttendanceModule } from '@modules/attendance/attendance.module';
import { LeaveTypeService } from './services/leave-type.service';
import { LeavePolicyService } from './services/leave-policy.service';
import { LeaveEntitlementService } from './services/leave-entitlement.service';
import { LeaveRequestService } from './services/leave-request.service';
import { BradfordFactorService } from './services/bradford-factor.service';
import { LeaveCalendarService } from './services/leave-calendar.service';
import { LeaveNotificationService } from './services/leave-notification.service';

@Module({
    imports: [LeaveRepositoryModule, HolidayCalendarModule, LocationModule, UserModule, RoleModule, forwardRef(() => AttendanceModule)],
    providers: [
        LeaveTypeService,
        LeavePolicyService,
        LeaveEntitlementService,
        LeaveRequestService,
        BradfordFactorService,
        LeaveCalendarService,
        LeaveNotificationService,
    ],
    exports: [
        LeaveTypeService,
        LeavePolicyService,
        LeaveEntitlementService,
        LeaveRequestService,
        BradfordFactorService,
        LeaveCalendarService,
        LeaveNotificationService,
    ],
})
export class LeaveModule {}
