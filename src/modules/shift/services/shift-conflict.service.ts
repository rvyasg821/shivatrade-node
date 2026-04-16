import { Injectable } from '@nestjs/common';
import { ShiftAssignmentService } from './shift-assignment.service';

export interface ConflictResult {
    userId: string;
    date: string;
    type: 'double_booking';
    message: string;
}

@Injectable()
export class ShiftConflictService {
    constructor(private readonly assignmentService: ShiftAssignmentService) {}

    /**
     * Detect double-booking: users who already have a shift on the given dates.
     */
    async detectConflicts(
        companyId: string,
        userIds: string[],
        dates: string[],
    ): Promise<ConflictResult[]> {
        const conflicts: ConflictResult[] = [];
        if (!dates.length || !userIds.length) return conflicts;

        const startDate = dates.reduce((a, b) => (a < b ? a : b));
        const endDate = dates.reduce((a, b) => (a > b ? a : b));

        const existing = await this.assignmentService.findByDateRange(companyId, startDate, endDate);
        const existingSet = new Set(existing.map(a => `${a.user_id}::${a.date}`));

        for (const userId of userIds) {
            for (const date of dates) {
                if (existingSet.has(`${userId}::${date}`)) {
                    conflicts.push({
                        userId,
                        date,
                        type: 'double_booking',
                        message: `User ${userId} already has a shift on ${date}`,
                    });
                }
            }
        }
        return conflicts;
    }
}
