import {
    Controller, Get, Post, Put, Delete,
    Body, Param, Query, HttpStatus, HttpCode, UseGuards,
    UploadedFile, Res, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { Response as ExpressResponse } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';

import { In } from 'typeorm';
import { DateTime } from 'luxon';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { LocationService } from '@modules/location/services/location.service';
import { AttendanceService } from '../services/attendance.service';
import { AttendanceSettingsService } from '../services/attendance-settings.service';
import { AttendanceReportService } from '../services/attendance-report.service';
import { AttendanceClockService } from '../services/attendance-clock.service';
import { FaceRecognitionService } from '../services/face-recognition.service';
import { AttendanceManualRequestDto } from '../dtos/request/attendance-manual.request.dto';
import { AttendanceSettingsRequestDto } from '../dtos/request/attendance-settings.request.dto';
import { AttendanceImportExportService } from '../services/attendance.import-export.service';
import { ENUM_ATTENDANCE_SOURCE, ENUM_BREAK_TYPE } from '../enums/attendance.enum';

@ApiTags('admin.attendance')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-attendance'])
@Controller({ version: '1', path: '/attendance' })
export class AttendanceAdminController {
    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly settingsService: AttendanceSettingsService,
        private readonly reportService: AttendanceReportService,
        private readonly userRepository: UserRepository,
        private readonly locationService: LocationService,
        private readonly importExportService: AttendanceImportExportService,
        private readonly clockService: AttendanceClockService,
        private readonly faceRecognitionService: FaceRecognitionService,
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-csv')
    async downloadSampleCsv(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleCsv();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="attendance-import-sample.csv"');
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    async exportCsv(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
        @Query('location_id') locationId?: string,
        @Res() res?: ExpressResponse,
    ) {
        let locationIds: string[] | undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            locationIds = assignedLocations?.length > 0 ? assignedLocations : (jwtLocationId ? [jwtLocationId] : undefined);
            if (locationId && locationIds?.includes(locationId)) locationIds = [locationId];
        } else if (locationId) {
            locationIds = [locationId];
        }

        const buffer = await this.importExportService.exportAttendance(companyId, { startDate, endDate, locationIds });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendance-${startDate || 'all'}-${endDate || 'all'}.csv"`);
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    async importCsv(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @UploadedFile() file: Express.Multer.File,
        @Query('preview') preview?: string,
    ) {
        if (!file) throw new BadRequestException('No file provided');

        try {
            let allowedLocationIds: string[] | undefined;
            if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
                allowedLocationIds = assignedLocations?.length > 0 ? assignedLocations : (jwtLocationId ? [jwtLocationId] : undefined);
            }

            const { summary, rows } = await this.importExportService.parseAndValidate(file.buffer, companyId, allowedLocationIds);

            if (preview === 'true') {
                return { statusCode: 200, message: 'Preview', data: { summary, rows } };
            }

            const validRows = rows.filter((r) => r.status !== 'error');
            if (validRows.length === 0) {
                return { statusCode: 200, message: 'No valid rows to import', data: { summary, created: 0, updated: 0, errors: [] } };
            }

            const result = await this.importExportService.importAttendance(validRows, companyId);

            return {
                statusCode: 200,
                message: `Import complete: ${result.created} created, ${result.updated} updated`,
                data: { summary, ...result },
            };
        } catch (err) {
            console.error('[Attendance Import] Error:', err.message, err.stack);
            throw new BadRequestException(err.message || 'Import failed');
        }
    }

    // ============ SETTINGS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/settings')
    async getSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId?: string,
    ) {
        const s = await this.settingsService.getOrCreate(companyId, locationId);
        const result: any = { statusCode: 200, message: 'Success', data: this.settingsService.mapGet(s) };

        // When viewing location-specific settings, also include company defaults for reference
        if (locationId) {
            const companyDefaults = await this.settingsService.getCompanyDefaults(companyId);
            result.companyDefaults = this.settingsService.mapGet(companyDefaults);
        }

        return result;
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/settings')
    async updateSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId: string,
        @Body() body: AttendanceSettingsRequestDto,
    ) {
        const s = await this.settingsService.update(companyId, body as any, locationId);
        return { statusCode: 200, message: 'Settings updated', data: this.settingsService.mapGet(s) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/settings')
    async deleteLocationSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId: string,
    ) {
        const defaults = await this.settingsService.deleteLocationOverride(companyId, locationId);
        return { statusCode: 200, message: 'Location settings reset to company defaults', data: this.settingsService.mapGet(defaults) };
    }

    // ============ RECORDS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/list')
    async listRecords(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('_limit') limit?: number,
        @Query('_offset') offset?: number,
        @Query('_userId') userId?: string,
        @Query('_status') status?: string,
        @Query('_date') date?: string,
        @Query('_startDate') startDate?: string,
        @Query('_endDate') endDate?: string,
        @Query('_locationId') queryLocationId?: string,
    ) {
        const filters: any = {};
        if (userId) filters.user_id = userId;
        if (status) filters.status = status;
        if (date) filters.date = date;
        if (startDate || endDate) {
            filters.date = {};
            if (startDate) filters.date.$gte = startDate;
            if (endDate) filters.date.$lte = endDate;
        }

        // Location filtering
        let filterLocationId = queryLocationId || undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            // Allow Location Admin to select from their assigned locations
            // If query param provided, use it (frontend sends from navbar selector)
            // Otherwise default to primary location from JWT
            if (queryLocationId) {
                filterLocationId = queryLocationId;
            } else {
                filterLocationId = jwtLocationId;
            }
        }

        if (filterLocationId) {
            const locationUsers = await this.userRepository.findAll({ companyId, location_id: filterLocationId });
            const userIds = locationUsers.map(u => (u as any)._id);
            if (!userIds.length) {
                return { statusCode: 200, message: 'Success', data: [], _metadata: { total: 0, limit: limit ? +limit : 20, offset: offset ? +offset : 0 } };
            }
            if (!filters.user_id) filters.user_id = In(userIds);
        }

        const [items, total] = await Promise.all([
            this.attendanceService.findAll(companyId, limit ? +limit : 20, offset ? +offset : 0, filters),
            this.attendanceService.getTotal(companyId, filters),
        ]);

        // Enrich with user names
        const mapped = items.map(r => this.attendanceService.mapGet(r));
        const userIdSet = new Set<string>();
        mapped.forEach(r => { if (r.user_id) userIdSet.add(r.user_id); });
        const userMap = new Map<string, { name: string; email: string }>();
        if (userIdSet.size) {
            const users = await this.userRepository.findAll({ _id: In([...userIdSet]) });
            for (const u of users) {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                userMap.set((u as any)._id, { name, email: u.email || '' });
            }
        }
        // Resolve timezone from location
        const effectiveLocationId = filterLocationId || null;
        let timezone: string | null = null;
        if (effectiveLocationId) {
            try {
                const location = await this.locationService.findOneById(effectiveLocationId);
                if (location?.timezone) timezone = location.timezone;
            } catch (_) { /* ignore */ }
        }

        const enriched = mapped.map(r => ({
            ...r,
            user_name: userMap.get(r.user_id)?.name || null,
            user_email: userMap.get(r.user_id)?.email || null,
        }));

        return {
            statusCode: 200, message: 'Success',
            data: enriched,
            timezone,
            _metadata: { total, limit: limit ? +limit : 20, offset: offset ? +offset : 0 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/get/:id')
    async getRecord(@Param('id') id: string) {
        const item = await this.attendanceService.findOneById(id);
        const breaks = await this.attendanceService.getBreaks(id);
        return { statusCode: 200, message: 'Success', data: { ...this.attendanceService.mapGet(item), breaks } };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/manual')
    async manualEntry(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: AttendanceManualRequestDto,
    ) {
        // Resolve timezone from user's location
        let tz = 'UTC';
        if (body.location_id) {
            try {
                const loc = await this.locationService.findOneById(body.location_id);
                if (loc?.timezone) tz = loc.timezone;
            } catch {}
        } else if (body.user_id) {
            try {
                const user = await this.userRepository.findOneById(body.user_id);
                if (user?.location_id) {
                    const loc = await this.locationService.findOneById(user.location_id);
                    if (loc?.timezone) tz = loc.timezone;
                }
            } catch {}
        }

        // Parse clock_in/clock_out with timezone context
        let clockIn: Date | undefined;
        let clockOut: Date | undefined;
        const recordDate = body.date || DateTime.now().setZone(tz).toISODate();

        if (body.clock_in) {
            // If time string like "09:00", combine with date in location timezone
            if (body.clock_in.match(/^\d{2}:\d{2}$/)) {
                const [h, m] = body.clock_in.split(':').map(Number);
                clockIn = DateTime.fromObject({ year: +recordDate.split('-')[0], month: +recordDate.split('-')[1], day: +recordDate.split('-')[2], hour: h, minute: m }, { zone: tz }).toJSDate();
            } else {
                clockIn = new Date(body.clock_in);
            }
        }
        if (body.clock_out) {
            if (body.clock_out.match(/^\d{2}:\d{2}$/)) {
                const [h, m] = body.clock_out.split(':').map(Number);
                clockOut = DateTime.fromObject({ year: +recordDate.split('-')[0], month: +recordDate.split('-')[1], day: +recordDate.split('-')[2], hour: h, minute: m }, { zone: tz }).toJSDate();
            } else {
                clockOut = new Date(body.clock_out);
            }
        }

        const item = await this.attendanceService.manualCreate(companyId, body.user_id, {
            ...body,
            date: recordDate,
            clock_in: clockIn,
            clock_out: clockOut,
        });
        return { statusCode: 200, message: 'Record saved', data: this.attendanceService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update/:id')
    async updateRecord(
        @Param('id') id: string,
        @Body() body: any,
    ) {
        const existing = await this.attendanceService.findOneById(id);
        const recordDate = existing?.date || DateTime.now().toISODate();

        // Resolve timezone from location
        let tz = 'UTC';
        if (existing?.location_id) {
            try {
                const loc = await this.locationService.findOneById(existing.location_id);
                if (loc?.timezone) tz = loc.timezone;
            } catch {}
        }

        const updateData: any = { ...body };
        const [yr, mo, dy] = recordDate.split('-').map(Number);

        // Parse time strings using location timezone
        if (body.clock_in && typeof body.clock_in === 'string' && body.clock_in.match(/^\d{2}:\d{2}$/)) {
            const [h, m] = body.clock_in.split(':').map(Number);
            updateData.clock_in = DateTime.fromObject({ year: yr, month: mo, day: dy, hour: h, minute: m }, { zone: tz }).toJSDate();
        }
        if (body.clock_out && typeof body.clock_out === 'string' && body.clock_out.match(/^\d{2}:\d{2}$/)) {
            const [h, m] = body.clock_out.split(':').map(Number);
            updateData.clock_out = DateTime.fromObject({ year: yr, month: mo, day: dy, hour: h, minute: m }, { zone: tz }).toJSDate();
        }

        // Recalculate total_hours if clock times changed
        const clockIn = updateData.clock_in || existing?.clock_in;
        const clockOut = updateData.clock_out || existing?.clock_out;
        if (clockIn && clockOut) {
            const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
            const breakMins = updateData.break_minutes ?? existing?.break_minutes ?? 0;
            updateData.total_hours = Math.round((diff - breakMins / 60) * 100) / 100;
        }

        const item = await this.attendanceService.update(id, updateData);
        return { statusCode: 200, message: 'Record updated', data: this.attendanceService.mapGet(item) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/delete/:id')
    async deleteRecord(@Param('id') id: string) {
        await this.attendanceService.softDelete(id);
        return { statusCode: 200, message: 'Record deleted' };
    }

    // ============ REPORTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/report/monthly')
    async monthlyReport(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('year') year?: number,
        @Query('month') month?: number,
        @Query('userId') userId?: string,
        @Query('locationId') locationId?: string,
    ) {
        const y = year ? +year : new Date().getFullYear();
        const m = month ? +month : new Date().getMonth() + 1;

        let filterLocationId = locationId || undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            // Allow Location Admin to select from their assigned locations
            // If query param provided, use it (frontend sends from navbar selector)
            // Otherwise default to primary location from JWT
            if (locationId) {
                filterLocationId = locationId;
            } else {
                filterLocationId = jwtLocationId;
            }
        }

        // If location filter, restrict to users at that location
        let filterUserId = userId;
        if (!filterUserId && filterLocationId) {
            const locationUsers = await this.userRepository.findAll({ companyId, location_id: filterLocationId });
            const userIds = locationUsers.map(u => (u as any)._id);
            if (!userIds.length) return { statusCode: 200, message: 'Success', data: [] };

            const allData = await this.reportService.getMonthlyReport(companyId, y, m);
            const filtered = allData.filter((d: any) => userIds.includes(d.user_id));

            // Build user map from location users
            const userMap = new Map<string, { name: string; email: string }>();
            for (const u of locationUsers) {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                userMap.set((u as any)._id, { name, email: u.email || '' });
            }

            // Start with employees that have records
            const reportUserIds = new Set(filtered.map((d: any) => d.user_id));
            const result = filtered.map((r: any) => ({
                ...r,
                user_name: userMap.get(r.user_id)?.name || null,
                user_email: userMap.get(r.user_id)?.email || null,
            }));

            // Add location employees with zero records
            for (const u of locationUsers) {
                const uid = (u as any)._id?.toString();
                if (!reportUserIds.has(uid)) {
                    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                    result.push({
                        user_id: uid, user_name: name, user_email: u.email || '',
                        total_days: 0, present_days: 0, absent_days: 0, late_days: 0,
                        early_leave_days: 0, half_day_days: 0, on_leave_days: 0, holiday_days: 0,
                        total_hours: 0, overtime_hours: 0,
                    });
                }
            }

            return { statusCode: 200, message: 'Success', data: result };
        }

        const data = await this.reportService.getMonthlyReport(companyId, y, m, filterUserId);

        // Enrich with user names
        const userMap = new Map<string, { name: string; email: string }>();
        const reportUserIds = new Set(data.map((r: any) => r.user_id));

        if (reportUserIds.size) {
            const users = await this.userRepository.findAll({ _id: In([...reportUserIds]) });
            for (const u of users) {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                userMap.set((u as any)._id, { name, email: u.email || '' });
            }
        }

        const result = data.map((r: any) => ({
            ...r,
            user_name: userMap.get(r.user_id)?.name || null,
            user_email: userMap.get(r.user_id)?.email || null,
        }));

        return { statusCode: 200, message: 'Success', data: result };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/report/annual')
    async annualReport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('year') year?: number,
        @Query('userId') userId?: string,
    ) {
        if (!userId) {
            return { statusCode: 400, message: 'Employee is required for annual report', data: [] };
        }
        const y = year ? +year : new Date().getFullYear();
        const data = await this.reportService.getAnnualReport(companyId, y, userId);

        // Get user name
        const user = await this.userRepository.findOneById(userId);
        const userName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';

        return {
            statusCode: 200,
            message: 'Success',
            data: data.map((r: any) => ({ ...r, user_name: userName, user_email: user?.email || '' })),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/report/daily')
    async dailyReport(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Query('date') date?: string,
        @Query('locationId') locationId?: string,
    ) {
        // Use location/company timezone for "today" fallback
        let reportTz = 'UTC';
        const effectiveLocId = locationId || jwtLocationId;
        if (effectiveLocId) {
            try { const loc = await this.locationService.findOneById(effectiveLocId); if (loc?.timezone) reportTz = loc.timezone; } catch {}
        }
        const d = date || DateTime.now().setZone(reportTz).toISODate();
        let filterLocationId = locationId || undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            // Allow Location Admin to select from their assigned locations
            // If query param provided, use it (frontend sends from navbar selector)
            // Otherwise default to primary location from JWT
            if (locationId) {
                filterLocationId = locationId;
            } else {
                filterLocationId = jwtLocationId;
            }
        }

        // Fetch all daily records (without location filter on the record)
        const data = await this.reportService.getDailyReport(companyId, d);
        let mapped = data.map((r: any) => this.attendanceService.mapGet(r));

        // Filter by users at the location (location is on user, not on record)
        let userMap = new Map<string, { name: string; email: string }>();
        if (filterLocationId) {
            const locationUsers = await this.userRepository.findAll({ companyId, location_id: filterLocationId });
            const userIds = locationUsers.map(u => (u as any)._id);
            if (!userIds.length) return { statusCode: 200, message: 'Success', data: [] };
            mapped = mapped.filter((r: any) => userIds.includes(r.user_id));
            for (const u of locationUsers) {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                userMap.set((u as any)._id, { name, email: u.email || '' });
            }
        } else {
            // Enrich with user names
            const userIdSet = new Set<string>();
            mapped.forEach((r: any) => { if (r.user_id) userIdSet.add(r.user_id); });
            if (userIdSet.size) {
                const users = await this.userRepository.findAll({ _id: In([...userIdSet]) });
                for (const u of users) {
                    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '';
                    userMap.set((u as any)._id, { name, email: u.email || '' });
                }
            }
        }

        const enriched = mapped.map((r: any) => ({
            ...r,
            user_name: userMap.get(r.user_id)?.name || null,
            user_email: userMap.get(r.user_id)?.email || null,
        }));

        // Resolve timezone from location
        let timezone: string | null = null;
        if (filterLocationId) {
            try {
                const location = await this.locationService.findOneById(filterLocationId);
                if (location?.timezone) timezone = location.timezone;
            } catch (_) { /* ignore */ }
        }

        return { statusCode: 200, message: 'Success', data: enriched, timezone };
    }

    // ============ FACE-RECOGNITION KIOSK ============

    /**
     * Resolve which location_id this kiosk request is operating against and
     * verify the logged-in admin is authorised to use it.
     * - Location Admin → must be their primary or one of their assignedLocations
     * - Company Admin → any location within their company
     */
    private async resolveKioskLocation(
        companyId: string,
        roleName: string,
        jwtLocationId: string | undefined,
        assignedLocations: string[] | undefined,
        requestedLocationId: string | undefined,
    ): Promise<string> {
        // If a specific location was requested (Company Admin / multi-loc Location Admin), validate it
        if (requestedLocationId) {
            // Verify it belongs to the company.
            // NOTE: Location entity uses snake_case `company_id` (NOT camelCase).
            const loc = await this.locationService.findOneById(requestedLocationId).catch(() => null);
            if (!loc || (loc as any).company_id !== companyId) {
                throw new BadRequestException('Invalid location for this device');
            }
            // For Location Admins, restrict to their assigned set
            if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
                const allowed = assignedLocations?.length ? assignedLocations : (jwtLocationId ? [jwtLocationId] : []);
                if (!allowed.includes(requestedLocationId)) {
                    throw new BadRequestException('You are not assigned to this location');
                }
            }
            return requestedLocationId;
        }

        // No requested location → fall back to JWT primary
        if (jwtLocationId) return jwtLocationId;

        throw new BadRequestException(
            'No location selected for this kiosk device. Please choose a location first.',
        );
    }

    /**
     * Returns the list of enrolled employees (with face descriptors) for the
     * kiosk's location. Used by the React side only to show enrollment counts
     * and to populate fallback search if face recognition fails.
     * The descriptors themselves are NOT returned — matching happens on the server.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/face-roster')
    async getFaceRoster(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Query('location_id') requestedLocationId?: string,
    ) {
        const locationId = await this.resolveKioskLocation(
            companyId, roleName, jwtLocationId, assignedLocations, requestedLocationId,
        );

        const users = await this.userRepository.findAll({
            companyId,
            location_id: locationId,
            deleted: false,
        }) as any[];

        const enrolled = users
            .filter(u => Array.isArray(u.face_descriptor) && u.face_descriptor.length > 0)
            .map(u => ({
                user_id: u._id,
                name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || '',
                employee_code: u.employee_code || null,
                photo: u.face_reference_photo || u.photo || null,
            }));

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                location_id: locationId,
                total_employees: users.length,
                enrolled_count: enrolled.length,
                employees: enrolled,
            },
        };
    }

    /**
     * Receives a base64 image from the kiosk camera, runs face matching against
     * the location's enrolled employees, and returns the matched employee + their
     * current attendance state + valid next actions.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/face-identify')
    async faceIdentify(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Body() body: { image: string; location_id?: string },
    ) {
        if (!body?.image) {
            throw new BadRequestException('No image provided');
        }

        const locationId = await this.resolveKioskLocation(
            companyId, roleName, jwtLocationId, assignedLocations, body.location_id,
        );

        // Build the roster: enrolled employees at this location
        const users = await this.userRepository.findAll({
            companyId,
            location_id: locationId,
            deleted: false,
        }) as any[];

        const roster = users
            .filter(u => Array.isArray(u.face_descriptor) && u.face_descriptor.length > 0)
            .map(u => ({ user_id: u._id, descriptor: u.face_descriptor }));

        if (roster.length === 0) {
            throw new BadRequestException(
                'No enrolled employees at this location. Please enrol employee faces first.',
            );
        }

        // Resolve the threshold from settings (per location > company > default 0.5).
        // Use ?? not || so an explicit 0 doesn't fall back silently.
        const settings = await this.settingsService.getOrCreate(companyId, locationId);
        const threshold = (settings as any).face_match_threshold ?? 0.5;

        // Run face matching (returns a discriminated union — see service for shape)
        const result = await this.faceRecognitionService.identifyFromImage(
            body.image, roster, threshold,
        );

        if (result.matched === false) {
            // Different reasons → different user-facing messages
            const messages: Record<string, string> = {
                no_roster: 'No enrolled employees at this location. Please enrol employee faces first.',
                no_match: 'Face not recognised. Please try again.',
                low_confidence: 'Match confidence is too low. Please look directly at the camera in good lighting and try again.',
            };
            const reasonCode = result.reason;
            return {
                statusCode: 200,
                message: 'No match',
                data: {
                    matched: false,
                    reason: messages[reasonCode] || 'Face not recognised. Please try again.',
                    reason_code: reasonCode,
                },
            };
        }

        // From here on, TS narrows result to { matched: true, user_id, distance, runnerUpDistance }
        // Look up the matched user and their current attendance state
        const matchedUser = users.find(u => u._id === result.user_id);
        const state = await this.clockService.getCurrentState(result.user_id, locationId);

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                matched: true,
                confidence: Math.max(0, 1 - result.distance / threshold), // 0..1 score
                distance: result.distance,
                runner_up_distance: result.runnerUpDistance,
                employee: {
                    user_id: matchedUser._id,
                    name: [matchedUser.first_name, matchedUser.last_name].filter(Boolean).join(' ') || matchedUser.name || '',
                    employee_code: matchedUser.employee_code || null,
                    photo: matchedUser.face_reference_photo || matchedUser.photo || null,
                },
                state: {
                    is_clocked_in: state.is_clocked_in,
                    is_clocked_out: state.is_clocked_out,
                    on_break: state.on_break,
                    valid_actions: state.valid_actions,
                    record_id: state.record?._id || null,
                    clock_in: state.record?.clock_in || null,
                    clock_out: state.record?.clock_out || null,
                },
            },
        };
    }

    /**
     * Records an attendance action (clock_in/clock_out/break_in/break_out) on
     * behalf of an employee identified via the kiosk. Validates that the action
     * is valid against the current state.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/face-clock')
    async faceClock(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Body() body: {
            user_id: string;
            action: 'clock_in' | 'clock_out' | 'break_in' | 'break_out';
            location_id?: string;
            face_image?: string; // optional captured frame for the audit trail
        },
    ) {
        if (!body?.user_id || !body?.action) {
            throw new BadRequestException('user_id and action are required');
        }

        const locationId = await this.resolveKioskLocation(
            companyId, roleName, jwtLocationId, assignedLocations, body.location_id,
        );

        // Verify the user actually belongs to this location (defence in depth)
        const user = await this.userRepository.findOne({
            _id: body.user_id,
            companyId,
            location_id: locationId,
            deleted: false,
        }) as any;
        if (!user) {
            throw new BadRequestException('Employee not found at this location');
        }

        // Re-check the current state and confirm the action is valid
        const state = await this.clockService.getCurrentState(body.user_id, locationId);
        if (!state.valid_actions.includes(body.action)) {
            throw new BadRequestException(
                `Action '${body.action}' is not valid in the current state. Allowed: ${state.valid_actions.join(', ') || 'none'}`,
            );
        }

        const faceData = body.face_image ? { image: body.face_image, capturedAt: new Date().toISOString() } : null;

        // Dispatch to the appropriate clock service method
        switch (body.action) {
            case 'clock_in': {
                const record = await this.clockService.clockIn(companyId, body.user_id, locationId, {
                    faceDescriptor: faceData,
                    source: ENUM_ATTENDANCE_SOURCE.KIOSK,
                });
                return { statusCode: 200, message: 'Clocked in', data: { action: 'clock_in', record } };
            }
            case 'clock_out': {
                const record = await this.clockService.clockOut(companyId, body.user_id, locationId, {
                    faceDescriptor: faceData,
                    source: ENUM_ATTENDANCE_SOURCE.KIOSK,
                });
                return { statusCode: 200, message: 'Clocked out', data: { action: 'clock_out', record } };
            }
            case 'break_in': {
                if (!state.record?._id) {
                    throw new BadRequestException('No active attendance record to start a break against');
                }
                const breakRow = await this.clockService.startBreak(
                    state.record._id, companyId, locationId, ENUM_BREAK_TYPE.SHORT,
                );
                return { statusCode: 200, message: 'Break started', data: { action: 'break_in', break: breakRow } };
            }
            case 'break_out': {
                if (!state.record?._id) {
                    throw new BadRequestException('No active attendance record to end a break against');
                }
                const breakRow = await this.clockService.endBreak(
                    state.record._id, companyId, locationId,
                );
                return { statusCode: 200, message: 'Break ended', data: { action: 'break_out', break: breakRow } };
            }
            default:
                throw new BadRequestException('Unknown action');
        }
    }
}
