import { Injectable } from '@nestjs/common';
import { ShiftAssignmentService } from './shift-assignment.service';
import { ShiftTemplateService } from './shift-template.service';

@Injectable()
export class ShiftRotaBuilderService {
    constructor(
        private readonly assignmentService: ShiftAssignmentService,
        private readonly templateService: ShiftTemplateService,
    ) {}

    /**
     * Copy-week: duplicate assignments from a source week into a target week.
     * Source/target are ISO date strings for Monday of each week.
     * excludeDates: array of ISO date strings to skip (e.g. holidays).
     */
    async copyWeek(
        companyId: string,
        sourceMonday: string,
        targetMonday: string,
        locationId?: string,
        excludeDates: string[] = [],
    ): Promise<{ created: number; skipped: number }> {
        const sourceDates = this.getWeekDates(sourceMonday);
        const targetDates = this.getWeekDates(targetMonday);
        const excludeSet = new Set(excludeDates);

        const sourceAssignments = await this.assignmentService.findByDateRange(
            companyId,
            sourceDates[0],
            sourceDates[6],
            locationId,
        );

        const toBulkCreate = sourceAssignments
            .map((a) => {
                const dayIndex = sourceDates.indexOf(a.date);
                const targetDate = targetDates[dayIndex >= 0 ? dayIndex : 0];
                return {
                    user_id: a.user_id,
                    date: targetDate,
                    shift_template_id: a.shift_template_id,
                    location_id: a.location_id,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    notes: a.notes,
                };
            })
            .filter((a) => !excludeSet.has(a.date));

        return this.assignmentService.bulkCreate(companyId, toBulkCreate);
    }

    /**
     * Pattern-week: assign a template to a list of users for a week (all weekdays).
     * excludeDates: array of ISO date strings to skip (e.g. holidays).
     */
    async assignWeekPattern(
        companyId: string,
        userIds: string[],
        monday: string,
        templateId: string,
        locationId?: string,
        includeDays: number[] = [0, 1, 2, 3, 4], // Mon-Fri (0=Mon..6=Sun)
        excludeDates: string[] = [],
    ): Promise<{ created: number; skipped: number }> {
        const weekDates = this.getWeekDates(monday);
        const excludeSet = new Set(excludeDates);

        // Resolve template times so assignments display correct start/end
        const template = await this.templateService.findOneById(templateId);
        const templateStartTime = template?.start_time ?? null;
        const templateEndTime = template?.end_time ?? null;

        const toBulkCreate: Array<{ user_id: string; date: string; shift_template_id: string; location_id?: string; start_time?: string; end_time?: string }> = [];

        for (const userId of userIds) {
            for (const dayIndex of includeDays) {
                if (dayIndex >= 0 && dayIndex < 7) {
                    const date = weekDates[dayIndex];
                    if (!excludeSet.has(date)) {
                        toBulkCreate.push({
                            user_id: userId,
                            date,
                            shift_template_id: templateId,
                            location_id: locationId,
                            start_time: templateStartTime,
                            end_time: templateEndTime,
                        });
                    }
                }
            }
        }

        return this.assignmentService.bulkCreate(companyId, toBulkCreate);
    }

    /** Returns 7 date strings (Mon–Sun) for the week starting on monday */
    private getWeekDates(monday: string): string[] {
        const base = new Date(monday + 'T12:00:00Z'); // noon UTC avoids timezone shift
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(base);
            d.setUTCDate(base.getUTCDate() + i);
            return d.toISOString().split('T')[0];
        });
    }
}
