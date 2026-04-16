import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShiftAssignmentRepository } from '../repository/repositories/shift-assignment.repository';
import { ShiftTemplateRepository } from '../repository/repositories/shift-template.repository';
import { ShiftAssignmentEntity } from '../repository/entities/shift-assignment.entity';
import { ENUM_SHIFT_ASSIGNMENT_STATUS } from '../enums/shift.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ShiftAssignmentService {
    constructor(
        private readonly assignmentRepository: ShiftAssignmentRepository,
        private readonly templateRepository: ShiftTemplateRepository,
    ) {}

    async findAll(
        companyId: string,
        limit = 50,
        offset = 0,
        filters: any = {}
    ): Promise<ShiftAssignmentEntity[]> {
        const find: any = { company_id: companyId, soft_delete: false, ...filters };
        return this.assignmentRepository.findAll(find, {
            paging: { limit, offset },
            order: { date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<ShiftAssignmentEntity[]>;
    }

    async getTotal(companyId: string, filters: any = {}): Promise<number> {
        return this.assignmentRepository.getTotal({ company_id: companyId, soft_delete: false, ...filters });
    }

    async findByUser(userId: string, startDate?: string, endDate?: string): Promise<ShiftAssignmentEntity[]> {
        const find: any = { user_id: userId, soft_delete: false };
        if (startDate || endDate) {
            find.date = {};
            if (startDate) find.date.$gte = startDate;
            if (endDate) find.date.$lte = endDate;
        }
        return this.assignmentRepository.findAll(find, {
            order: { date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<ShiftAssignmentEntity[]>;
    }

    async findByDateRange(companyId: string, startDate: string, endDate: string, locationId?: string): Promise<ShiftAssignmentEntity[]> {
        const find: any = {
            company_id: companyId,
            soft_delete: false,
            date: { $gte: startDate, $lte: endDate },
        };
        if (locationId) find.location_id = locationId;
        return this.assignmentRepository.findAll(find, {
            order: { date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<ShiftAssignmentEntity[]>;
    }

    async findOneById(id: string): Promise<ShiftAssignmentEntity> {
        const item = await this.assignmentRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Shift assignment not found');
        return item as ShiftAssignmentEntity;
    }

    async findByUserAndDate(userId: string, date: string): Promise<ShiftAssignmentEntity | null> {
        return this.assignmentRepository.findOne({ user_id: userId, date, soft_delete: false }) as Promise<ShiftAssignmentEntity | null>;
    }

    async create(companyId: string, data: {
        user_id: string;
        date: string;
        shift_template_id?: string;
        location_id?: string;
        start_time?: string;
        end_time?: string;
        notes?: string;
    }): Promise<ShiftAssignmentEntity> {
        // Enforce one-shift-per-day-per-user
        const existing = await this.assignmentRepository.findOne({
            user_id: data.user_id,
            date: data.date,
        });
        if (existing && !existing.soft_delete) {
            throw new BadRequestException(`${data.user_id} already has a shift on ${data.date}`);
        }

        // Reuse soft-deleted record to avoid unique constraint violation
        if (existing && existing.soft_delete) {
            return this.assignmentRepository.update(existing, {
                company_id: companyId,
                location_id: data.location_id || null,
                shift_template_id: data.shift_template_id || null,
                start_time: data.start_time || null,
                end_time: data.end_time || null,
                status: ENUM_SHIFT_ASSIGNMENT_STATUS.SCHEDULED,
                published: false,
                published_at: null,
                published_by: null,
                notes: data.notes || null,
                soft_delete: false,
            }) as Promise<ShiftAssignmentEntity>;
        }

        return this.assignmentRepository.create({
            company_id: companyId,
            user_id: data.user_id,
            location_id: data.location_id || null,
            shift_template_id: data.shift_template_id || null,
            date: data.date,
            start_time: data.start_time || null,
            end_time: data.end_time || null,
            status: ENUM_SHIFT_ASSIGNMENT_STATUS.SCHEDULED,
            published: false,
            notes: data.notes || null,
            soft_delete: false,
        });
    }

    async bulkCreate(companyId: string, assignments: Array<{
        user_id: string;
        date: string;
        shift_template_id?: string;
        location_id?: string;
        start_time?: string;
        end_time?: string;
    }>): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;
        for (const a of assignments) {
            try {
                await this.create(companyId, a);
                created++;
            } catch {
                skipped++;
            }
        }
        return { created, skipped };
    }

    async update(id: string, data: Partial<ShiftAssignmentEntity>): Promise<ShiftAssignmentEntity> {
        const item = await this.findOneById(id);
        return this.assignmentRepository.update(item, data) as Promise<ShiftAssignmentEntity>;
    }

    async publish(companyId: string, startDate: string, endDate: string, publishedBy: string, locationId?: string): Promise<number> {
        const assignments = await this.findByDateRange(companyId, startDate, endDate, locationId);
        const unpublished = assignments.filter(a => !a.published);
        for (const a of unpublished) {
            await this.assignmentRepository.update(a, {
                published: true,
                published_at: new Date(),
                published_by: publishedBy,
            });
        }
        return unpublished.length;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.assignmentRepository.update(item, { soft_delete: true });
    }

    mapGet(a: ShiftAssignmentEntity) {
        return {
            _id: a._id,
            company_id: a.company_id,
            user_id: a.user_id,
            location_id: a.location_id,
            shift_template_id: a.shift_template_id,
            date: a.date,
            start_time: a.start_time,
            end_time: a.end_time,
            status: a.status,
            published: a.published,
            published_at: a.published_at,
            notes: a.notes,
            createdAt: a.createdAt,
        };
    }

    /** Like mapGet but falls back to template start/end times if assignment has none */
    async mapGetResolved(a: ShiftAssignmentEntity): Promise<ReturnType<ShiftAssignmentService['mapGet']>> {
        const base = this.mapGet(a);
        if ((!base.start_time || !base.end_time) && a.shift_template_id) {
            try {
                const template = await this.templateRepository.findOne({ _id: a.shift_template_id, soft_delete: false });
                if (template) {
                    if (!base.start_time) base.start_time = template.start_time;
                    if (!base.end_time) base.end_time = template.end_time;
                }
            } catch { /* ignore — return without template times */ }
        }
        return base;
    }
}
