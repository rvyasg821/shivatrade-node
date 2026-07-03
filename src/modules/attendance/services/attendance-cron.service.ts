import { Injectable, Logger } from '@nestjs/common';
// HR tools (Attendance/Leave/Holiday) disabled — attendance crons stopped.
import { Cron } from '@nestjs/schedule';
import { AttendanceSettingsRepository } from '../repository/repositories/attendance-settings.repository';
import { AttendanceRecordRepository } from '../repository/repositories/attendance-record.repository';
import { LocationService } from '@modules/location/services/location.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { HolidayService } from '@modules/holiday-calendar/services/holiday.service';
import { ENUM_ATTENDANCE_STATUS, ENUM_ATTENDANCE_SOURCE } from '../enums/attendance.enum';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { AttendanceRecordEntity } from '../repository/entities/attendance-record.entity';
import { DateTime } from 'luxon';

@Injectable()
export class AttendanceCronService {
    private shouldRunCron(): boolean {
        if (process.env.CRON_ENABLED === 'false') return false;
        const instance = process.env.NODE_APP_INSTANCE;
        if (instance !== undefined && instance !== '0') return false;
        return true;
    }
    private readonly logger = new Logger(AttendanceCronService.name);

    constructor(
        private readonly settingsRepository: AttendanceSettingsRepository,
        private readonly recordRepository: AttendanceRecordRepository,
        private readonly locationService: LocationService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly holidayService: HolidayService,
    ) {}

    /**
     * Every 5 minutes — auto clock-out employees whose auto_clock_out_time has passed.
     */
    @Cron('*/5 * * * *')
    async autoClockOut(): Promise<void> {
        if (!this.shouldRunCron()) return;
        try {
            const allSettings = await this.settingsRepository.findAll(
                { auto_clock_out_enabled: true },
                {},
            ) as any[];

            if (!allSettings.length) return;

            for (const settings of allSettings) {
                if (!settings.auto_clock_out_time) continue;

                try {
                    if (settings.location_id) {
                        await this.processForLocation(settings, settings.location_id);
                    } else {
                        await this.processCompanyWide(settings);
                    }
                } catch (err) {
                    this.logger.error(
                        `Auto clock-out failed for company=${settings.company_id} location=${settings.location_id || 'all'}: ${err.message}`,
                    );
                }
            }
        } catch (err) {
            this.logger.error(`Auto clock-out cron error: ${err.message}`);
        }
    }

    /**
     * Company-wide setting (no location_id) — iterate all locations,
     * skip locations that already have their own override setting,
     * resolve timezone from each location, and process.
     */
    private async processCompanyWide(settings: any): Promise<void> {
        const companyId = settings.company_id;

        let locations: any[] = [];
        try {
            locations = await this.locationService.findAll(companyId);
        } catch (_) {
            this.logger.warn(`Could not fetch locations for company ${companyId}`);
            return;
        }

        if (!locations.length) {
            await this.processForLocation(settings, null);
            return;
        }

        // Check which locations already have their own override
        const allCompanySettings = await this.settingsRepository.findAll(
            { company_id: companyId },
            {},
        ) as any[];
        const overriddenLocationIds = new Set(
            allCompanySettings
                .filter(s => s.location_id && s._id !== settings._id)
                .map(s => s.location_id),
        );

        for (const location of locations) {
            if (overriddenLocationIds.has(location._id)) continue;

            try {
                await this.processForLocation(settings, location._id, location.timezone);
            } catch (err) {
                this.logger.error(
                    `Auto clock-out failed for company=${companyId} location=${location._id}: ${err.message}`,
                );
            }
        }

        // Also process records that have no location_id (edge case)
        await this.processForLocation(settings, null);
    }

    /**
     * Process auto clock-out for a specific location (or null for no-location records).
     */
    private async processForLocation(
        settings: any,
        locationId: string | null,
        knownTimezone?: string,
    ): Promise<void> {
        // Resolve timezone
        let tz = 'UTC';
        if (knownTimezone) {
            tz = knownTimezone;
        } else if (locationId) {
            try {
                const location = await this.locationService.findOneById(locationId);
                if (location?.timezone) tz = location.timezone;
            } catch (_) { /* fall through to UTC */ }
        }

        const nowInTz = DateTime.now().setZone(tz);
        const today = nowInTz.toISODate();

        // Parse auto_clock_out_time (HH:MM or HH:MM:SS from PostgreSQL time column)
        const timeStr = String(settings.auto_clock_out_time);
        const timeParts = timeStr.split(':').map(Number);

        const autoClockOutMoment = nowInTz.set({
            hour: timeParts[0],
            minute: timeParts[1] || 0,
            second: 0,
            millisecond: 0,
        });

        // Only proceed if current time has passed the auto clock-out time
        if (nowInTz < autoClockOutMoment) return;

        // Don't run if we're more than 30 minutes past the threshold (avoid re-processing)
        const minutesPast = nowInTz.diff(autoClockOutMoment, 'minutes').minutes;
        if (minutesPast > 30) return;

        // Build query for active records (clocked in, not clocked out) for today
        const findQuery: any = {
            date: today,
            soft_delete: false,
            company_id: settings.company_id,
        };

        if (locationId) {
            findQuery.location_id = locationId;
        }

        const activeRecords = await this.recordRepository.findAll(findQuery, {}) as AttendanceRecordEntity[];
        const needsClockOut = activeRecords.filter(r => r.clock_in && !r.clock_out);

        if (!needsClockOut.length) return;

        this.logger.log(
            `Auto clock-out: ${needsClockOut.length} records for company=${settings.company_id} ` +
            `location=${locationId || 'none'} tz=${tz} time=${timeStr}`,
        );

        const clockOutTime = autoClockOutMoment.toJSDate();

        for (const record of needsClockOut) {
            try {
                const clockIn = new Date(record.clock_in);
                const totalMs = clockOutTime.getTime() - clockIn.getTime();
                const breakMs = (record.break_minutes || 0) * 60000;
                const workedMs = totalMs - breakMs;
                const totalHours = Math.max(0, workedMs / 3600000);

                let regularHours = totalHours;
                let overtimeHours = 0;
                if (settings.overtime_enabled && totalHours > settings.overtime_threshold_hours) {
                    regularHours = settings.overtime_threshold_hours;
                    overtimeHours = totalHours - settings.overtime_threshold_hours;
                }

                await this.recordRepository.update(record, {
                    clock_out: clockOutTime,
                    total_hours: Math.round(totalHours * 100) / 100,
                    regular_hours: Math.round(regularHours * 100) / 100,
                    overtime_hours: Math.round(overtimeHours * 100) / 100,
                    source: ENUM_ATTENDANCE_SOURCE.AUTO,
                });
            } catch (err) {
                this.logger.error(`Auto clock-out failed for record ${record._id}: ${err.message}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Daily Holiday Marking — runs at 00:15 every day
    // Creates 'holiday' attendance records for all employees at locations
    // where today is a holiday
    // ─────────────────────────────────────────────────────────────────────
    @Cron('15 0 * * *')
    async markHolidays(): Promise<void> {
        if (!this.shouldRunCron()) return;
        try {
            // Get all companies that have attendance settings
            const allSettings = await this.settingsRepository.findAll({}, {}) as any[];
            const companyIds = [...new Set(allSettings.map(s => s.company_id).filter(Boolean))];

            for (const companyId of companyIds) {
                try {
                    const today = DateTime.now().toISODate(); // YYYY-MM-DD
                    const holidays = await this.holidayService.findByDateRange(companyId, today, today);

                    if (!holidays.length) continue;

                    // Allowed roles for attendance: legacy Employee + custom roles
                    const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
                        companyId
                    );

                    // Get all employees for this company
                    const employees = await this.userService.findAll(
                        { companyId, role: { $in: allowedRoleIds } },
                        {}
                    );

                    let created = 0;
                    for (const emp of employees) {
                        const existing = await this.recordRepository.findOne({
                            user_id: emp._id?.toString(),
                            date: today,
                            soft_delete: false,
                        });
                        if (existing) continue; // Already has a record

                        await this.recordRepository.create({
                            company_id: companyId,
                            user_id: emp._id?.toString(),
                            location_id: (emp as any).location_id || null,
                            date: today,
                            status: ENUM_ATTENDANCE_STATUS.HOLIDAY,
                            source: ENUM_ATTENDANCE_SOURCE.AUTO,
                            total_hours: 0,
                            regular_hours: 0,
                            overtime_hours: 0,
                            break_minutes: 0,
                            notes: holidays.map(h => h.name).join(', '),
                            soft_delete: false,
                        });
                        created++;
                    }

                    if (created > 0) {
                        this.logger.log(`Holiday marking: created ${created} holiday records for company ${companyId}`);
                    }
                } catch (err) {
                    this.logger.error(`Holiday marking failed for company ${companyId}: ${err.message}`);
                }
            }
        } catch (err) {
            this.logger.error(`Holiday marking cron error: ${err.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Daily Absent Marking — runs at 23:50 every day
    // Creates 'absent' attendance records for employees who didn't clock in
    // and don't have any record (leave, holiday, manual) for today
    // ─────────────────────────────────────────────────────────────────────
    @Cron('50 23 * * *')
    async markAbsent(): Promise<void> {
        if (!this.shouldRunCron()) return;
        try {
            const allSettings = await this.settingsRepository.findAll({}, {}) as any[];
            const companyIds = [...new Set(allSettings.map(s => s.company_id).filter(Boolean))];

            for (const companyId of companyIds) {
                try {
                    const today = DateTime.now().toISODate();

                    // Skip weekends (Saturday=6, Sunday=7 in luxon)
                    const dayOfWeek = DateTime.now().weekday;
                    if (dayOfWeek === 6 || dayOfWeek === 7) continue;

                    // Allowed roles: legacy Employee + custom roles
                    const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
                        companyId
                    );

                    const employees = await this.userService.findAll(
                        { companyId, role: { $in: allowedRoleIds } },
                        {}
                    );

                    let created = 0;
                    for (const emp of employees) {
                        const existing = await this.recordRepository.findOne({
                            user_id: emp._id?.toString(),
                            date: today,
                            soft_delete: false,
                        });
                        if (existing) continue; // Already has a record (present, leave, holiday, etc.)

                        await this.recordRepository.create({
                            company_id: companyId,
                            user_id: emp._id?.toString(),
                            location_id: (emp as any).location_id || null,
                            date: today,
                            status: ENUM_ATTENDANCE_STATUS.ABSENT,
                            source: ENUM_ATTENDANCE_SOURCE.AUTO,
                            total_hours: 0,
                            regular_hours: 0,
                            overtime_hours: 0,
                            break_minutes: 0,
                            soft_delete: false,
                        });
                        created++;
                    }

                    if (created > 0) {
                        this.logger.log(`Absent marking: created ${created} absent records for company ${companyId}`);
                    }
                } catch (err) {
                    this.logger.error(`Absent marking failed for company ${companyId}: ${err.message}`);
                }
            }
        } catch (err) {
            this.logger.error(`Absent marking cron error: ${err.message}`);
        }
    }
}
