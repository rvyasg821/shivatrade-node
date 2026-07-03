import { Module, forwardRef } from '@nestjs/common';
import { AttendanceRepositoryModule } from './repository/attendance.repository.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { EmployeeRepositoryModule } from '@modules/employee/repository/employee.repository.module';
import { ShiftModule } from '@modules/shift/shift.module';
import { LocationModule } from '@modules/location/location.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { HolidayCalendarModule } from '@modules/holiday-calendar/holiday-calendar.module';
import { AttendanceSettingsService } from './services/attendance-settings.service';
import { AttendanceClockService } from './services/attendance-clock.service';
import { AttendanceService } from './services/attendance.service';
import { AttendanceReportService } from './services/attendance-report.service';
import { AttendanceCronService } from './services/attendance-cron.service';
import { AttendanceImportExportService } from './services/attendance.import-export.service';

@Module({
    imports: [
        AttendanceRepositoryModule,
        UserRepositoryModule,
        EmployeeRepositoryModule,
        ShiftModule,
        LocationModule,
        forwardRef(() => UserModule),
        forwardRef(() => RoleModule),
        HolidayCalendarModule,
    ],
    providers: [
        AttendanceSettingsService,
        AttendanceClockService,
        AttendanceService,
        AttendanceReportService,
        AttendanceCronService,
        AttendanceImportExportService,
    ],
    exports: [
        AttendanceSettingsService,
        AttendanceClockService,
        AttendanceService,
        AttendanceReportService,
        AttendanceCronService,
        AttendanceImportExportService,
    ],
})
export class AttendanceModule {}
