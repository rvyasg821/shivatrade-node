import { Injectable } from '@nestjs/common';
import { Between } from 'typeorm';
import { AttendanceRecordRepository } from '../repository/repositories/attendance-record.repository';
import { ENUM_ATTENDANCE_STATUS } from '../enums/attendance.enum';

export interface AttendanceSummary {
    user_id: string;
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    early_leave_days: number;
    half_day_days: number;
    on_leave_days: number;
    holiday_days: number;
    total_hours: number;
    overtime_hours: number;
}

@Injectable()
export class AttendanceReportService {
    constructor(private readonly recordRepository: AttendanceRecordRepository) {}

    async getMonthlyReport(
        companyId: string,
        year: number,
        month: number,
        userId?: string
    ): Promise<AttendanceSummary[]> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Use TypeORM's Between operator directly. The Mongo-style { $gte, $lte }
        // path in the base repository's translateMongoFilter uses Raw() with
        // named params which doesn't reliably bind when mixed with plain fields,
        // causing the date filter to silently drop and return all records.
        // Between() is a TypeORM FindOperator and passes through translateValue
        // unchanged (see the `instanceof FindOperator` guard).
        const find: any = {
            company_id: companyId,
            soft_delete: false,
            date: Between(startDate, endDate),
        };
        if (userId) find.user_id = userId;

        const records = await this.recordRepository.findAll(find, {}) as any[];

        // Group by user
        const byUser: Record<string, any[]> = {};
        for (const r of records) {
            if (!byUser[r.user_id]) byUser[r.user_id] = [];
            byUser[r.user_id].push(r);
        }

        return Object.entries(byUser).map(([uid, recs]) => ({
            user_id: uid,
            total_days: recs.length,
            present_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.PRESENT).length,
            absent_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.ABSENT).length,
            late_days: recs.filter(r => r.is_late).length,
            early_leave_days: recs.filter(r => r.is_early_leave).length,
            half_day_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.HALF_DAY).length,
            on_leave_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.ON_LEAVE).length,
            holiday_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.HOLIDAY).length,
            total_hours: Math.round(recs.reduce((s: number, r: any) => s + (r.total_hours || 0), 0) * 100) / 100,
            overtime_hours: Math.round(recs.reduce((s: number, r: any) => s + (r.overtime_hours || 0), 0) * 100) / 100,
        }));
    }

    async getAnnualReport(
        companyId: string,
        year: number,
        userId: string
    ): Promise<({ month: number; month_name: string } & AttendanceSummary)[]> {
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // Same fix as getMonthlyReport — use Between() directly, not $gte/$lte
        // (which goes through the Raw-based Mongo translator and silently drops).
        const find: any = {
            company_id: companyId,
            user_id: userId,
            soft_delete: false,
            date: Between(startDate, endDate),
        };

        const records = await this.recordRepository.findAll(find, {}) as any[];

        // Group by month
        const byMonth: Record<number, any[]> = {};
        for (let m = 1; m <= 12; m++) byMonth[m] = [];
        for (const r of records) {
            const month = parseInt(r.date?.split('-')[1], 10);
            if (month >= 1 && month <= 12) byMonth[month].push(r);
        }

        return Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            const recs = byMonth[m];
            return {
                month: m,
                month_name: MONTHS[i],
                user_id: userId,
                total_days: recs.length,
                present_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.PRESENT).length,
                absent_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.ABSENT).length,
                late_days: recs.filter(r => r.is_late).length,
                early_leave_days: recs.filter(r => r.is_early_leave).length,
                half_day_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.HALF_DAY).length,
                on_leave_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.ON_LEAVE).length,
                holiday_days: recs.filter(r => r.status === ENUM_ATTENDANCE_STATUS.HOLIDAY).length,
                total_hours: Math.round(recs.reduce((s: number, r: any) => s + (r.total_hours || 0), 0) * 100) / 100,
                overtime_hours: Math.round(recs.reduce((s: number, r: any) => s + (r.overtime_hours || 0), 0) * 100) / 100,
            };
        });
    }

    async getDailyReport(companyId: string, date: string, locationId?: string): Promise<any[]> {
        const find: any = { company_id: companyId, date, soft_delete: false };
        if (locationId) find.location_id = locationId;
        return this.recordRepository.findAll(find, {}) as Promise<any[]>;
    }
}
