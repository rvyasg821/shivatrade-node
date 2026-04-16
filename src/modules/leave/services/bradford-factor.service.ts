import { Injectable } from '@nestjs/common';
import { LeaveRequestRepository } from '../repository/repositories/leave-request.repository';
import { ENUM_LEAVE_REQUEST_STATUS } from '../enums/leave.enum';

/**
 * Bradford Factor = S x S x D
 * S = number of separate absence spells in the period
 * D = total number of days absent in the period
 */
@Injectable()
export class BradfordFactorService {
    constructor(private readonly requestRepository: LeaveRequestRepository) {}

    async calculate(userId: string, year: number): Promise<{ score: number; spells: number; days: number }> {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const requests = await this.requestRepository.findAll(
            {
                user_id: userId,
                soft_delete: false,
                status: ENUM_LEAVE_REQUEST_STATUS.APPROVED,
                start_date: { $gte: startDate, $lte: endDate },
            },
            {}
        ) as any[];

        const spells = requests.length; // S — each approved leave = 1 spell
        const days = requests.reduce((sum: number, r: any) => sum + (r.total_days || 0), 0); // D
        const score = spells * spells * days; // S x S x D

        return { score, spells, days };
    }

    async calculateForCompany(
        companyId: string,
        year: number
    ): Promise<Array<{ user_id: string; score: number; spells: number; days: number }>> {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const requests = await this.requestRepository.findAll(
            {
                company_id: companyId,
                soft_delete: false,
                status: ENUM_LEAVE_REQUEST_STATUS.APPROVED,
                start_date: { $gte: startDate, $lte: endDate },
            },
            {}
        ) as any[];

        // Group by user_id
        const byUser: Record<string, { spells: number; days: number }> = {};
        for (const req of requests) {
            if (!byUser[req.user_id]) byUser[req.user_id] = { spells: 0, days: 0 };
            byUser[req.user_id].spells += 1;
            byUser[req.user_id].days += req.total_days || 0;
        }

        return Object.entries(byUser).map(([user_id, { spells, days }]) => ({
            user_id,
            score: spells * spells * days,
            spells,
            days,
        }));
    }
}
