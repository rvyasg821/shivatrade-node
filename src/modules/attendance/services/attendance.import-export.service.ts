import { Injectable, Logger } from '@nestjs/common';
import { utils, read } from 'xlsx';
import { AttendanceService } from './attendance.service';
import { UserService } from '@modules/user/services/user.service';
import { LocationService } from '@modules/location/services/location.service';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_ATTENDANCE_STATUS } from '../enums/attendance.enum';
import { DateTime } from 'luxon';

const CSV_HEADERS = [
    'employee_code', 'date', 'clock_in', 'clock_out', 'status', 'break_minutes', 'notes',
];

const SAMPLE_ROWS = [
    { employee_code: 'EMP001', date: '2026-03-24', clock_in: '09:00', clock_out: '17:30', status: 'present', break_minutes: 30, notes: '' },
    { employee_code: 'EMP002', date: '2026-03-24', clock_in: '09:15', clock_out: '17:00', status: 'present', break_minutes: 30, notes: 'Arrived late - traffic delay' },
    { employee_code: 'EMP003', date: '2026-03-24', clock_in: '', clock_out: '', status: 'absent', break_minutes: '', notes: 'No show' },
    { employee_code: 'EMP004', date: '2026-03-24', clock_in: '09:00', clock_out: '13:00', status: 'half_day', break_minutes: 15, notes: '' },
];

const VALID_STATUSES = Object.values(ENUM_ATTENDANCE_STATUS);

export interface AttendanceImportRow {
    rowNum: number;
    data: Record<string, any>;
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
}

@Injectable()
export class AttendanceImportExportService {
    private readonly logger = new Logger(AttendanceImportExportService.name);

    constructor(
        private readonly attendanceService: AttendanceService,
        private readonly userService: UserService,
        private readonly locationService: LocationService,
        private readonly roleService: RoleService,
    ) {}

    generateSampleCsv(): Buffer {
        const ws = utils.json_to_sheet(SAMPLE_ROWS, { header: CSV_HEADERS });
        const csv = utils.sheet_to_csv(ws);
        return Buffer.from(csv, 'utf8');
    }

    async exportAttendance(
        companyId: string,
        filters: { startDate?: string; endDate?: string; locationIds?: string[] },
    ): Promise<Buffer> {
        const find: any = {};
        if (filters.startDate) find.date = { $gte: filters.startDate };
        if (filters.endDate) find.date = { ...(find.date || {}), $lte: filters.endDate };
        if (filters.locationIds?.length) find.location_id = { $in: filters.locationIds };

        const records = await this.attendanceService.findAll(companyId, 10000, 0, find);

        // Build user map (id -> employee_code + name). Includes legacy
        // Employee role + every active custom role for this company so
        // custom-role employees aren't silently excluded from exports.
        const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
            companyId
        );
        const users = await this.userService.findAll(
            { companyId, role: { $in: allowedRoleIds } },
            {}
        );
        const userMap: Record<string, any> = {};
        for (const u of users) {
            userMap[u._id?.toString()] = u;
        }

        // Build location map (id -> { name, timezone })
        const locations = await this.locationService.findAll(companyId) as any[];
        const locMap: Record<string, string> = {};
        const locationMap: Record<string, any> = {};
        for (const loc of locations) {
            const lid = loc._id?.toString();
            locMap[lid] = loc.location_name;
            locationMap[lid] = { location_name: loc.location_name, timezone: loc.timezone };
        }

        const rows = records.map((r: any) => {
            const user = userMap[r.user_id] || {};
            return {
                employee_code: user.employee_code || '',
                employee_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                email: user.email || '',
                date: r.date || '',
                clock_in: r.clock_in ? (() => {
                    const locTz = r.location_id ? locationMap[r.location_id]?.timezone : null;
                    return locTz
                        ? DateTime.fromJSDate(new Date(r.clock_in)).setZone(locTz).toFormat('HH:mm')
                        : new Date(r.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                })() : '',
                clock_out: r.clock_out ? (() => {
                    const locTz = r.location_id ? locationMap[r.location_id]?.timezone : null;
                    return locTz
                        ? DateTime.fromJSDate(new Date(r.clock_out)).setZone(locTz).toFormat('HH:mm')
                        : new Date(r.clock_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                })() : '',
                break_minutes: r.break_minutes || 0,
                total_hours: r.total_hours || 0,
                regular_hours: r.regular_hours || 0,
                overtime_hours: r.overtime_hours || 0,
                status: r.status || '',
                is_late: r.is_late ? 'Yes' : 'No',
                is_early_leave: r.is_early_leave ? 'Yes' : 'No',
                location: r.location_id ? (locMap[r.location_id] || '') : '',
                notes: r.notes || '',
            };
        });

        const exportHeaders = [
            'employee_code', 'employee_name', 'email', 'date',
            'clock_in', 'clock_out', 'break_minutes',
            'total_hours', 'regular_hours', 'overtime_hours',
            'status', 'is_late', 'is_early_leave', 'location', 'notes',
        ];
        const ws = utils.json_to_sheet(rows, { header: exportHeaders });
        const csv = utils.sheet_to_csv(ws);
        return Buffer.from(csv, 'utf8');
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string,
        allowedLocationIds?: string[],
    ): Promise<{ summary: any; rows: AttendanceImportRow[] }> {
        const workbook = read(fileBuffer, { type: 'buffer', raw: true });
        const sheetName = workbook.SheetNames[0];
        const rawRows: Record<string, any>[] = utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });

        if (rawRows.length === 0) {
            return { summary: { total: 0, valid_new: 0, valid_update: 0, errors: 0 }, rows: [] };
        }

        // Build employee lookup (code -> user, email -> user). Includes
        // legacy Employee role + every active custom role for this company
        // so custom-role employee codes are recognised during CSV import.
        const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
            companyId
        );
        const users = await this.userService.findAll(
            { companyId, role: { $in: allowedRoleIds } },
            {}
        );
        const codeMap: Record<string, any> = {};
        const emailMap: Record<string, any> = {};
        for (const u of users) {
            if (u.employee_code) codeMap[u.employee_code.toUpperCase()] = u;
            if (u.email) emailMap[u.email.toLowerCase()] = u;
        }

        const result: AttendanceImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2;
            const errors: string[] = [];

            const empCode = String(raw.employee_code || '').trim().toUpperCase();
            const email = String(raw.email || '').trim().toLowerCase();
            const date = String(raw.date || '').trim();
            const clockIn = String(raw.clock_in || '').trim();
            const clockOut = String(raw.clock_out || '').trim();
            let status = String(raw.status || 'present').trim().toLowerCase();
            const breakMinutes = raw.break_minutes !== undefined && raw.break_minutes !== '' ? parseInt(String(raw.break_minutes), 10) : 0;
            const notes = String(raw.notes || '').trim();

            // Backward compat: convert 'late' to 'present' (late is a flag, not a status)
            let isLateFromCsv = false;
            if (status === 'late') {
                status = 'present';
                isLateFromCsv = true;
            }

            // Validate required
            if (!empCode && !email) errors.push('employee_code or email is required');
            if (!date) errors.push('Date is required');
            else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Date must be YYYY-MM-DD format');

            // Validate status
            if (status && !VALID_STATUSES.includes(status as any)) {
                errors.push(`Invalid status "${status}". Valid: ${VALID_STATUSES.join(', ')}`);
            }
            // Block system-managed statuses for today/future — allow for past dates (back-dated import)
            const SYSTEM_ONLY = ['on_leave', 'holiday'];
            if (SYSTEM_ONLY.includes(status) && date >= new Date().toISOString().split('T')[0]) {
                errors.push(`Status "${status}" can only be imported for past dates. For today/future, use the Leave or Holiday Calendar module.`);
            }

            // Find employee
            let user: any = null;
            if (empCode) user = codeMap[empCode];
            if (!user && email) user = emailMap[email];
            if (!user && !errors.length) errors.push(`Employee not found (code: ${empCode || '—'}, email: ${email || '—'})`);

            // Check location access for Location Admin
            if (user && allowedLocationIds && user.location_id) {
                if (!allowedLocationIds.includes(user.location_id?.toString())) {
                    errors.push('Employee is not in your assigned locations');
                }
            }

            // Check existing record
            let existingId: string | undefined;
            let rowStatus: 'valid_new' | 'valid_update' | 'error' = 'valid_new';

            if (errors.length === 0 && user && date) {
                const existing = await this.attendanceService.findByUserAndDate(user._id?.toString(), date);
                if (existing) {
                    existingId = existing._id?.toString();
                    rowStatus = 'valid_update';
                }
            }

            if (errors.length > 0) rowStatus = 'error';

            result.push({
                rowNum,
                data: {
                    employee_code: empCode,
                    email: user?.email || email,
                    employee_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '',
                    user_id: user?._id?.toString() || null,
                    location_id: user?.location_id?.toString() || null,
                    date,
                    clock_in: clockIn,
                    clock_out: clockOut,
                    status,
                    is_late: isLateFromCsv,
                    break_minutes: isNaN(breakMinutes) ? 0 : breakMinutes,
                    notes,
                },
                status: rowStatus,
                existingId,
                errors,
            });
        }

        return {
            summary: {
                total: result.length,
                valid_new: result.filter((r) => r.status === 'valid_new').length,
                valid_update: result.filter((r) => r.status === 'valid_update').length,
                errors: result.filter((r) => r.status === 'error').length,
            },
            rows: result,
        };
    }

    async importAttendance(
        rows: AttendanceImportRow[],
        companyId: string,
    ): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        // Resolve location timezone for time parsing
        const timezoneCache: Record<string, string> = {};
        const getTimezone = async (locationId: string | null): Promise<string | undefined> => {
            if (!locationId) return undefined;
            if (timezoneCache[locationId]) return timezoneCache[locationId];
            try {
                const loc = await this.locationService.findOneById(locationId);
                if (loc?.timezone) {
                    timezoneCache[locationId] = loc.timezone;
                    return loc.timezone;
                }
            } catch { }
            return undefined;
        };

        for (const row of rows) {
            if (row.status === 'error' || !row.data.user_id) continue;

            try {
                // Get location timezone for correct time parsing
                const tz = await getTimezone(row.data.location_id);

                let clockIn: Date | undefined;
                let clockOut: Date | undefined;

                if (row.data.clock_in) {
                    clockIn = this.parseTime(row.data.date, row.data.clock_in, tz);
                }
                if (row.data.clock_out) {
                    clockOut = this.parseTime(row.data.date, row.data.clock_out, tz);
                }

                await this.attendanceService.manualCreate(companyId, row.data.user_id, {
                    date: row.data.date,
                    clock_in: clockIn,
                    clock_out: clockOut,
                    location_id: row.data.location_id || undefined,
                    status: row.data.status || ENUM_ATTENDANCE_STATUS.PRESENT,
                    is_late: row.data.is_late || false,
                    break_minutes: row.data.break_minutes || 0,
                    notes: row.data.notes || undefined,
                });

                if (row.status === 'valid_update') updated++;
                else created++;
            } catch (err) {
                this.logger.error(`Attendance import row ${row.rowNum} failed: ${err.message}`);
                errors.push({ row: row.rowNum, message: err.message });
            }
        }

        return { created, updated, errors };
    }

    private parseTime(dateStr: string, timeStr: string, timezone?: string): Date {
        // Supports "09:00", "09:00:00", "9:00"
        // Times in CSV are in location's local timezone
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0] || '0', 10);
        const minutes = parseInt(parts[1] || '0', 10);
        const seconds = parseInt(parts[2] || '0', 10);

        if (timezone) {
            // Use luxon to parse in the correct timezone
            const { DateTime } = require('luxon');
            const dt = DateTime.fromObject(
                { year: parseInt(dateStr.split('-')[0]), month: parseInt(dateStr.split('-')[1]), day: parseInt(dateStr.split('-')[2]), hour: hours, minute: minutes, second: seconds },
                { zone: timezone }
            );
            return dt.toJSDate();
        }

        // Fallback: treat as UTC
        const d = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000Z`);
        return d;
    }
}
