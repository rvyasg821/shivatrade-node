import { Injectable } from '@nestjs/common';
import { LeaveRequestRepository } from '../repository/repositories/leave-request.repository';
import { LeaveRequestEntity } from '../repository/entities/leave-request.entity';
import { ENUM_LEAVE_REQUEST_STATUS } from '../enums/leave.enum';

/**
 * Provides team calendar data — all approved/pending leave in a date range.
 */
@Injectable()
export class LeaveCalendarService {
    constructor(private readonly requestRepository: LeaveRequestRepository) {}

    async getCalendarData(
        companyId: string,
        startDate: string,
        endDate: string,
        locationId?: string
    ): Promise<LeaveRequestEntity[]> {
        const find: any = {
            company_id: companyId,
            soft_delete: false,
            status: { $in: [ENUM_LEAVE_REQUEST_STATUS.APPROVED, ENUM_LEAVE_REQUEST_STATUS.PENDING] },
            // Overlapping date range: start_date <= endDate AND end_date >= startDate
            start_date: { $lte: endDate },
            end_date: { $gte: startDate },
        };
        if (locationId) find.location_id = locationId;
        return this.requestRepository.findAll(find, {}) as Promise<LeaveRequestEntity[]>;
    }
}
