import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecordRepository } from '../repository/repositories/attendance-record.repository';
import { AttendanceBreakRepository } from '../repository/repositories/attendance-break.repository';
import { AttendanceRecordEntity } from '../repository/entities/attendance-record.entity';
import { AttendanceBreakEntity } from '../repository/entities/attendance-break.entity';
import { ENUM_ATTENDANCE_STATUS, ENUM_ATTENDANCE_SOURCE } from '../enums/attendance.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { DateTime } from 'luxon';

@Injectable()
export class AttendanceService {
    constructor(
        private readonly recordRepository: AttendanceRecordRepository,
        private readonly breakRepository: AttendanceBreakRepository,
    ) {}

    async findAll(
        companyId: string,
        limit = 20,
        offset = 0,
        filters: any = {}
    ): Promise<AttendanceRecordEntity[]> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.recordRepository.findAll(find, {
            paging: { limit, offset },
            order: { date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<AttendanceRecordEntity[]>;
    }

    async getTotal(companyId: string, filters: any = {}): Promise<number> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.recordRepository.getTotal(find);
    }

    async findByUser(userId: string, startDate?: string, endDate?: string): Promise<AttendanceRecordEntity[]> {
        const find: any = { user_id: userId, soft_delete: false };
        if (startDate) find.date = { $gte: startDate };
        if (endDate) find.date = { ...(find.date || {}), $lte: endDate };
        return this.recordRepository.findAll(find, {
            order: { date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<AttendanceRecordEntity[]>;
    }

    async findOneById(id: string): Promise<AttendanceRecordEntity> {
        const item = await this.recordRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Attendance record not found');
        return item as AttendanceRecordEntity;
    }

    async findTodayByUser(userId: string, timezone?: string): Promise<AttendanceRecordEntity | null> {
        const today = timezone
            ? DateTime.now().setZone(timezone).toISODate()
            : new Date().toISOString().split('T')[0];
        const item = await this.recordRepository.findOne({ user_id: userId, date: today, soft_delete: false });
        return item as AttendanceRecordEntity | null;
    }

    async findByUserAndDate(userId: string, date: string): Promise<AttendanceRecordEntity | null> {
        const item = await this.recordRepository.findOne({ user_id: userId, date, soft_delete: false });
        return item as AttendanceRecordEntity | null;
    }

    async manualCreate(
        companyId: string,
        userId: string,
        data: {
            date: string;
            clock_in?: Date;
            clock_out?: Date;
            location_id?: string;
            status?: string;
            notes?: string;
            break_minutes?: number;
            is_late?: boolean;
        }
    ): Promise<AttendanceRecordEntity> {
        const existing = await this.recordRepository.findOne({ user_id: userId, date: data.date });

        const breakMinutes = data.break_minutes || 0;
        let totalHours = 0;
        if (data.clock_in && data.clock_out) {
            const grossMs = new Date(data.clock_out).getTime() - new Date(data.clock_in).getTime();
            const breakMs = breakMinutes * 60000;
            totalHours = Math.max(0, (grossMs - breakMs) / 3600000);
        }

        if (existing) {
            return this.recordRepository.update(existing as AttendanceRecordEntity, {
                ...data,
                break_minutes: breakMinutes,
                is_late: data.is_late || false,
                total_hours: Math.round(totalHours * 100) / 100,
                regular_hours: Math.round(totalHours * 100) / 100,
                source: ENUM_ATTENDANCE_SOURCE.MANUAL,
                soft_delete: false,
            }) as Promise<AttendanceRecordEntity>;
        }

        return this.recordRepository.create({
            company_id: companyId,
            user_id: userId,
            location_id: data.location_id || null,
            date: data.date,
            clock_in: data.clock_in || null,
            clock_out: data.clock_out || null,
            total_hours: Math.round(totalHours * 100) / 100,
            regular_hours: Math.round(totalHours * 100) / 100,
            overtime_hours: 0,
            break_minutes: breakMinutes,
            is_late: data.is_late || false,
            status: (data.status as any) || ENUM_ATTENDANCE_STATUS.PRESENT,
            source: ENUM_ATTENDANCE_SOURCE.MANUAL,
            notes: data.notes || null,
            soft_delete: false,
        });
    }

    /** Called from Leave approval flow to auto-create on_leave records */
    async markLeave(
        companyId: string,
        userId: string,
        startDate: string,
        endDate: string,
        locationId?: string
    ): Promise<void> {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const current = new Date(start);

        while (current <= end) {
            const day = current.getDay();
            // Skip weekends
            if (day !== 0 && day !== 6) {
                const dateStr = current.toISOString().split('T')[0];
                const existing = await this.recordRepository.findOne({ user_id: userId, date: dateStr, soft_delete: false });
                if (!existing) {
                    await this.recordRepository.create({
                        company_id: companyId,
                        user_id: userId,
                        location_id: locationId || null,
                        date: dateStr,
                        status: ENUM_ATTENDANCE_STATUS.ON_LEAVE,
                        source: ENUM_ATTENDANCE_SOURCE.AUTO,
                        total_hours: 0,
                        regular_hours: 0,
                        overtime_hours: 0,
                        break_minutes: 0,
                        soft_delete: false,
                    });
                }
            }
            current.setDate(current.getDate() + 1);
        }
    }

    async update(id: string, data: Partial<AttendanceRecordEntity>): Promise<AttendanceRecordEntity> {
        const item = await this.findOneById(id);
        return this.recordRepository.update(item, data) as Promise<AttendanceRecordEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        // Hard delete to avoid unique constraint issues on (user_id, date)
        await this.recordRepository.delete(item);
    }

    async getBreaks(attendanceId: string): Promise<AttendanceBreakEntity[]> {
        return this.breakRepository.findAll(
            { attendance_id: attendanceId },
            { order: { start_time: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<AttendanceBreakEntity[]>;
    }

    mapGet(r: AttendanceRecordEntity) {
        return {
            _id: r._id,
            company_id: r.company_id,
            user_id: r.user_id,
            location_id: r.location_id,
            date: r.date,
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            clock_in_gps: r.clock_in_gps,
            clock_out_gps: r.clock_out_gps,
            total_hours: r.total_hours,
            regular_hours: r.regular_hours,
            overtime_hours: r.overtime_hours,
            break_minutes: r.break_minutes,
            status: r.status,
            is_late: r.is_late,
            is_early_leave: r.is_early_leave,
            source: r.source,
            notes: r.notes,
            createdAt: r.createdAt,
        };
    }

    mapList(r: AttendanceRecordEntity) {
        return {
            _id: r._id,
            user_id: r.user_id,
            date: r.date,
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            total_hours: r.total_hours,
            status: r.status,
            is_late: r.is_late,
        };
    }
}
