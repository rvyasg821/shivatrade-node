import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LeaveRequestRepository } from '../repository/repositories/leave-request.repository';
import { LeaveRequestEntity } from '../repository/entities/leave-request.entity';
import { LeaveEntitlementService } from './leave-entitlement.service';
import { LeavePolicyService } from './leave-policy.service';
import { LeaveTypeService } from './leave-type.service';
import { HolidayService } from '@modules/holiday-calendar/services/holiday.service';
import { LocationService } from '@modules/location/services/location.service';
import { ENUM_LEAVE_REQUEST_STATUS, ENUM_LEAVE_HALF_DAY } from '../enums/leave.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class LeaveRequestService {
    constructor(
        private readonly requestRepository: LeaveRequestRepository,
        private readonly entitlementService: LeaveEntitlementService,
        private readonly policyService: LeavePolicyService,
        private readonly leaveTypeService: LeaveTypeService,
        private readonly holidayService: HolidayService,
        private readonly locationService: LocationService,
    ) {}

    /**
     * Get the day-of-week (0=Sun..6=Sat) for a Date in a specific timezone.
     */
    private getDayInTz(date: Date, tz: string): number {
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
        const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return map[weekday] ?? date.getDay();
    }

    /**
     * Get YYYY-MM-DD string for a Date in a specific timezone.
     */
    private getDateStrInTz(date: Date, tz: string): string {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    }

    /**
     * Calculate working days between start and end date (inclusive),
     * excluding weekends and public holidays in the range.
     * Adjusts for half-days on start/end.
     * Uses location timezone for accurate day-of-week calculations.
     */
    async calculateWorkingDays(
        companyId: string,
        startDate: string,
        endDate: string,
        startHalf: string,
        endHalf: string,
        locationId?: string
    ): Promise<number> {
        // Resolve timezone from location
        let tz = 'UTC';
        if (locationId) {
            try {
                const location = await this.locationService.findOneById(locationId);
                if (location?.timezone) tz = location.timezone;
            } catch {
                // Location not found — fall back to UTC
            }
        }

        const policy = await this.policyService.getOrCreate(companyId);

        // Parse dates at noon UTC to avoid DST edge cases
        const start = new Date(`${startDate}T12:00:00Z`);
        const end = new Date(`${endDate}T12:00:00Z`);

        // Fetch holidays in range if policy includes bank holidays
        let holidayDates: Set<string> = new Set();
        if (policy.include_bank_holidays) {
            const holidays = await this.holidayService.findByDateRange(
                companyId,
                startDate,
                endDate
            );
            holidays.forEach((h) => holidayDates.add(h.date));
        }

        let days = 0;
        const current = new Date(start);
        while (current <= end) {
            const day = this.getDayInTz(current, tz);
            const dateStr = this.getDateStrInTz(current, tz);
            // Exclude weekends and holidays
            if (day !== 0 && day !== 6 && !holidayDates.has(dateStr)) {
                days += 1;
            }
            current.setDate(current.getDate() + 1);
        }

        // Adjust for half-days
        if (days > 0) {
            const startDay = this.getDayInTz(start, tz);
            const endDay = this.getDayInTz(end, tz);
            const startDayIsWeekday = startDay !== 0 && startDay !== 6;
            const endDayIsWeekday = endDay !== 0 && endDay !== 6;
            const startIsHoliday = holidayDates.has(startDate);
            const endIsHoliday = holidayDates.has(endDate);

            if (startDate === endDate) {
                // Single day — check if half
                if (startHalf === ENUM_LEAVE_HALF_DAY.AM || startHalf === ENUM_LEAVE_HALF_DAY.PM) {
                    days = 0.5;
                }
            } else {
                if (!startIsHoliday && startDayIsWeekday &&
                    (startHalf === ENUM_LEAVE_HALF_DAY.AM || startHalf === ENUM_LEAVE_HALF_DAY.PM)) {
                    days -= 0.5;
                }
                if (!endIsHoliday && endDayIsWeekday &&
                    (endHalf === ENUM_LEAVE_HALF_DAY.AM || endHalf === ENUM_LEAVE_HALF_DAY.PM)) {
                    days -= 0.5;
                }
            }
        }

        return Math.max(0, days);
    }

    async create(
        companyId: string,
        userId: string,
        data: {
            leave_type_id: string;
            start_date: string;
            end_date: string;
            start_half?: string;
            end_half?: string;
            reason?: string;
            location_id?: string;
            created_by?: string;
            auto_approve?: boolean;
        }
    ): Promise<LeaveRequestEntity> {
        const startHalf = data.start_half || ENUM_LEAVE_HALF_DAY.FULL;
        const endHalf = data.end_half || ENUM_LEAVE_HALF_DAY.FULL;

        // Validate date order
        if (new Date(data.start_date) > new Date(data.end_date)) {
            throw new BadRequestException('Start date must be before or equal to end date');
        }

        const totalDays = await this.calculateWorkingDays(
            companyId,
            data.start_date,
            data.end_date,
            startHalf,
            endHalf,
            data.location_id
        );

        if (totalDays <= 0) {
            throw new BadRequestException('No working days in the selected date range');
        }

        const leaveType = await this.leaveTypeService.findOneById(data.leave_type_id);
        const policy = await this.policyService.getOrCreate(companyId);

        // Check balance
        const year = new Date(data.start_date).getFullYear();
        const entitlement = await this.entitlementService.getOrCreate(
            companyId,
            userId,
            data.leave_type_id,
            year,
            policy.default_annual_entitlement
        );

        if (entitlement.balance < totalDays) {
            throw new BadRequestException(`Insufficient leave balance. Available: ${entitlement.balance} days, Requested: ${totalDays} days`);
        }

        // Determine status: admin auto-approve override > policy auto-approve > pending
        let status: string;
        let approvedBy: string | null = null;
        let approvedAt: Date | null = null;

        if (data.auto_approve && data.created_by) {
            // Admin explicitly chose to auto-approve
            status = ENUM_LEAVE_REQUEST_STATUS.APPROVED;
            approvedBy = data.created_by;
            approvedAt = new Date();
        } else if (policy.auto_approve_enabled && !leaveType.requires_approval) {
            status = ENUM_LEAVE_REQUEST_STATUS.APPROVED;
        } else {
            status = ENUM_LEAVE_REQUEST_STATUS.PENDING;
        }

        const request = await this.requestRepository.create({
            company_id: companyId,
            user_id: userId,
            leave_type_id: data.leave_type_id,
            location_id: data.location_id || null,
            start_date: data.start_date,
            end_date: data.end_date,
            start_half: startHalf,
            end_half: endHalf,
            total_days: totalDays,
            reason: data.reason || null,
            status,
            approved_by: approvedBy,
            approved_at: approvedAt,
            created_by: data.created_by || null,
            soft_delete: false,
        });

        // Update entitlement — add to pending
        await this.entitlementService.updateBalance(userId, data.leave_type_id, year, {
            pending: totalDays,
        });

        // If auto-approved, move from pending to used
        if (status === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            await this.entitlementService.updateBalance(userId, data.leave_type_id, year, {
                pending: -totalDays,
                used: totalDays,
            });
        }

        return request;
    }

    async approve(id: string, approvedBy: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.status !== ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            throw new BadRequestException('Only pending requests can be approved');
        }

        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.APPROVED,
            approved_by: approvedBy,
            approved_at: new Date(),
        }) as LeaveRequestEntity;

        // Move from pending to used
        const year = new Date(request.start_date).getFullYear();
        await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
            pending: -request.total_days,
            used: request.total_days,
        });

        return updated;
    }

    async reject(id: string, rejectedBy: string, reason: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.status !== ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            throw new BadRequestException('Only pending requests can be rejected');
        }

        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.REJECTED,
            approved_by: rejectedBy,
            approved_at: new Date(),
            rejection_reason: reason,
        }) as LeaveRequestEntity;

        // Release pending
        const year = new Date(request.start_date).getFullYear();
        await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
            pending: -request.total_days,
        });

        return updated;
    }

    /**
     * Force approve — works from any status (admin status change).
     * Adjusts balance based on previous status.
     */
    async forceApprove(id: string, approvedBy: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            throw new BadRequestException('Request is already approved');
        }

        const prevStatus = request.status;
        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.APPROVED,
            approved_by: approvedBy,
            approved_at: new Date(),
        }) as LeaveRequestEntity;

        const year = new Date(request.start_date).getFullYear();
        if (prevStatus === ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            // Move from pending to used
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                pending: -request.total_days,
                used: request.total_days,
            });
        } else if (prevStatus === ENUM_LEAVE_REQUEST_STATUS.REJECTED || prevStatus === ENUM_LEAVE_REQUEST_STATUS.CANCELLED) {
            // Re-approve: add to used
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                used: request.total_days,
            });
        }

        return updated;
    }

    /**
     * Force reject — works from any status (admin status change).
     * Adjusts balance based on previous status.
     */
    async forceReject(id: string, rejectedBy: string, reason: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.REJECTED) {
            throw new BadRequestException('Request is already rejected');
        }

        const prevStatus = request.status;
        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.REJECTED,
            approved_by: rejectedBy,
            approved_at: new Date(),
            rejection_reason: reason,
        }) as LeaveRequestEntity;

        const year = new Date(request.start_date).getFullYear();
        if (prevStatus === ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            // Release pending
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                pending: -request.total_days,
            });
        } else if (prevStatus === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            // Revoke approval: release used
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                used: -request.total_days,
            });
        }

        return updated;
    }

    async cancel(id: string, userId: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.user_id !== userId) {
            throw new BadRequestException('You can only cancel your own requests');
        }
        if (![ENUM_LEAVE_REQUEST_STATUS.PENDING, ENUM_LEAVE_REQUEST_STATUS.APPROVED].includes(request.status as any)) {
            throw new BadRequestException('This request cannot be cancelled');
        }

        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.CANCELLED,
            cancelled_at: new Date(),
        }) as LeaveRequestEntity;

        const year = new Date(request.start_date).getFullYear();
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                pending: -request.total_days,
            });
        } else if (request.status === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                used: -request.total_days,
            });
        }

        return updated;
    }

    async adminCancel(id: string, adminId: string): Promise<LeaveRequestEntity> {
        const request = await this.findOneById(id);
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.CANCELLED) {
            throw new BadRequestException('Request is already cancelled');
        }

        const updated = await this.requestRepository.update(request, {
            status: ENUM_LEAVE_REQUEST_STATUS.CANCELLED,
            cancelled_at: new Date(),
            approved_by: adminId,
        }) as LeaveRequestEntity;

        const year = new Date(request.start_date).getFullYear();
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                pending: -request.total_days,
            });
        } else if (request.status === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                used: -request.total_days,
            });
        }

        return updated;
    }

    async adminDelete(id: string): Promise<void> {
        const request = await this.findOneById(id);
        const year = new Date(request.start_date).getFullYear();

        // Release balance based on current status
        if (request.status === ENUM_LEAVE_REQUEST_STATUS.PENDING) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                pending: -request.total_days,
            });
        } else if (request.status === ENUM_LEAVE_REQUEST_STATUS.APPROVED) {
            await this.entitlementService.updateBalance(request.user_id, request.leave_type_id, year, {
                used: -request.total_days,
            });
        }

        await this.requestRepository.update(request, { soft_delete: true });
    }

    async findAll(
        companyId: string,
        limit = 20,
        offset = 0,
        filters: any = {}
    ): Promise<LeaveRequestEntity[]> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.requestRepository.findAll(find, {
            paging: { limit, offset },
            order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<LeaveRequestEntity[]>;
    }

    async getTotal(companyId: string, filters: any = {}): Promise<number> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.requestRepository.getTotal(find);
    }

    async findByUser(userId: string, year?: number): Promise<LeaveRequestEntity[]> {
        const find: any = { user_id: userId, soft_delete: false };
        if (year) {
            const start = `${year}-01-01`;
            const end = `${year}-12-31`;
            find.start_date = { $gte: start, $lte: end };
        }
        return this.requestRepository.findAll(find, {
            order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
        }) as Promise<LeaveRequestEntity[]>;
    }

    async findOneById(id: string): Promise<LeaveRequestEntity> {
        const item = await this.requestRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Leave request not found');
        return item as LeaveRequestEntity;
    }

    mapGet(req: LeaveRequestEntity) {
        return {
            _id: req._id,
            company_id: req.company_id,
            user_id: req.user_id,
            leave_type_id: req.leave_type_id,
            location_id: req.location_id,
            start_date: req.start_date,
            end_date: req.end_date,
            start_half: req.start_half,
            end_half: req.end_half,
            total_days: req.total_days,
            reason: req.reason,
            status: req.status,
            approved_by: req.approved_by,
            approved_at: req.approved_at,
            rejection_reason: req.rejection_reason,
            cancelled_at: req.cancelled_at,
            supporting_doc_id: req.supporting_doc_id,
            created_by: req.created_by,
            createdAt: req.createdAt,
        };
    }
}
