import {
    Controller, Get, Post, Body, Query, HttpStatus, HttpCode, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { AttendanceService } from '../services/attendance.service';
import { AttendanceClockService } from '../services/attendance-clock.service';
import { AttendanceSettingsService } from '../services/attendance-settings.service';
import { AttendanceReportService } from '../services/attendance-report.service';
import { AttendanceClockRequestDto } from '../dtos/request/attendance-clock.request.dto';
import { ENUM_BREAK_TYPE } from '../enums/attendance.enum';
import { ShiftAssignmentService } from '@modules/shift/services/shift-assignment.service';
import { DateTime } from 'luxon';

@ApiTags('employee.attendance')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-attendance'])
@Controller({ version: '1', path: '/employee/attendance' })
export class AttendanceEmployeeController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly clockService: AttendanceClockService,
        private readonly settingsService: AttendanceSettingsService,
        private readonly reportService: AttendanceReportService,
        private readonly shiftAssignmentService: ShiftAssignmentService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/today')
    async getToday(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
    ) {
        const tz = await this.clockService.getTimezone(locationId);
        const today = DateTime.now().setZone(tz).toISODate();
        const record = await this.attendanceService.findByUserAndDate(userId, today);

        // Fetch settings so frontend knows what to require (face capture, GPS, breaks)
        const settings = await this.settingsService.getOrCreate(companyId, locationId);
        const settingsFlags = {
            face_capture_enabled: settings.face_capture_enabled,
            gps_enabled: settings.gps_enabled,
            break_tracking_enabled: settings.break_tracking_enabled,
        };

        if (!record) return { statusCode: 200, message: 'No record', data: null, timezone: tz, settings: settingsFlags };
        const breaks = await this.attendanceService.getBreaks(record._id);
        return { statusCode: 200, message: 'Success', data: { ...this.attendanceService.mapGet(record), breaks }, timezone: tz, settings: settingsFlags };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-records')
    async myRecords(
        @AuthJwtPayload('user') userId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const items = await this.attendanceService.findByUser(userId, startDate, endDate);
        return { statusCode: 200, message: 'Success', data: items.map(r => this.attendanceService.mapList(r)) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/clock-in')
    async clockIn(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
        @Body() body: AttendanceClockRequestDto,
    ) {
        // Resolve timezone from location for shift lookup
        const tz = await this.clockService.getTimezone(locationId);
        const today = DateTime.now().setZone(tz).toISODate();
        const assignment = await this.shiftAssignmentService.findByUserAndDate(userId, today);
        let shiftStartTime: string | undefined;
        if (assignment) {
            const resolved = await this.shiftAssignmentService.mapGetResolved(assignment);
            if (resolved.start_time) shiftStartTime = resolved.start_time.substring(0, 5); // HH:MM
        }

        const record = await this.clockService.clockIn(companyId, userId, locationId, {
            ...body,
            shiftStartTime,
        });
        return { statusCode: 200, message: 'Clocked in', data: this.attendanceService.mapGet(record), timezone: tz };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/clock-out')
    async clockOut(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
        @Body() body: AttendanceClockRequestDto,
    ) {
        // Resolve timezone from location for shift lookup
        const tz = await this.clockService.getTimezone(locationId);
        const today = DateTime.now().setZone(tz).toISODate();
        const assignment = await this.shiftAssignmentService.findByUserAndDate(userId, today);
        let shiftEndTime: string | undefined;
        if (assignment) {
            const resolved = await this.shiftAssignmentService.mapGetResolved(assignment);
            if (resolved.end_time) shiftEndTime = resolved.end_time.substring(0, 5); // HH:MM
        }

        const record = await this.clockService.clockOut(companyId, userId, locationId, {
            ...body,
            shiftEndTime,
        });
        return { statusCode: 200, message: 'Clocked out', data: this.attendanceService.mapGet(record), timezone: tz };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/break/start')
    async startBreak(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
        @Body('type') type?: string,
    ) {
        const tz = await this.clockService.getTimezone(locationId);
        const todayDate = DateTime.now().setZone(tz).toISODate();
        const today = await this.attendanceService.findByUserAndDate(userId, todayDate);
        if (!today) return { statusCode: 400, message: 'Not clocked in today' };
        const brk = await this.clockService.startBreak(today._id, companyId, locationId, (type as any) || ENUM_BREAK_TYPE.SHORT);
        return { statusCode: 200, message: 'Break started', data: brk };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/break/end')
    async endBreak(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') locationId: string,
    ) {
        const tz = await this.clockService.getTimezone(locationId);
        const todayDate = DateTime.now().setZone(tz).toISODate();
        const today = await this.attendanceService.findByUserAndDate(userId, todayDate);
        if (!today) return { statusCode: 400, message: 'Not clocked in today' };
        const brk = await this.clockService.endBreak(today._id, companyId, locationId);
        return { statusCode: 200, message: 'Break ended', data: brk };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/report/monthly')
    async myMonthlyReport(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Query('year') year?: number,
        @Query('month') month?: number,
    ) {
        const y = year ? +year : new Date().getFullYear();
        const m = month ? +month : new Date().getMonth() + 1;
        const data = await this.reportService.getMonthlyReport(companyId, y, m, userId);
        return { statusCode: 200, message: 'Success', data: data[0] || {
            user_id: userId, total_days: 0, present_days: 0, absent_days: 0,
            late_days: 0, early_leave_days: 0, half_day_days: 0, on_leave_days: 0,
            holiday_days: 0, total_hours: 0, overtime_hours: 0,
        }};
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/report/annual')
    async myAnnualReport(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Query('year') year?: number,
    ) {
        const y = year ? +year : new Date().getFullYear();
        const data = await this.reportService.getAnnualReport(companyId, y, userId);
        return { statusCode: 200, message: 'Success', data };
    }
}
