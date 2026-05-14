import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { LeadActivityRepository } from '../repository/repositories/lead-activity.repository';
import { LeadActivityDoc } from '../repository/entities/lead-activity.entity';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { ENUM_LEAD_ACTIVITY_TYPE } from '../enums/lead-activity.enum';
import { LeadActivityGetResponseDto } from '../dtos/response/lead-activity.get.response.dto';

@Injectable()
export class LeadActivityService {
    constructor(
        private readonly activityRepository: LeadActivityRepository,
        private readonly userRepository: UserRepository
    ) {}

    /**
     * Manual user note. Type fixed to NOTE; body is required.
     */
    async addNote(
        companyId: string,
        leadId: string,
        body: string,
        createdBy: string
    ): Promise<LeadActivityDoc> {
        const trimmed = (body || '').trim();
        if (!trimmed) {
            throw new BadRequestException('Note body is required');
        }
        return this.activityRepository.create({
            company_id: companyId,
            lead_id: leadId,
            type: ENUM_LEAD_ACTIVITY_TYPE.NOTE,
            body: trimmed,
            created_by: createdBy,
        } as any);
    }

    /**
     * System-generated activity. Called from lead.service / quotation.service
     * — never directly from an HTTP route. `body` can be null when the type
     * is fully described by `metadata`.
     */
    async addSystem(
        companyId: string,
        leadId: string,
        type: ENUM_LEAD_ACTIVITY_TYPE,
        opts: {
            body?: string;
            metadata?: Record<string, any>;
            createdBy?: string;
        } = {}
    ): Promise<LeadActivityDoc> {
        return this.activityRepository.create({
            company_id: companyId,
            lead_id: leadId,
            type,
            body: opts.body ?? null,
            metadata: opts.metadata ?? null,
            created_by: opts.createdBy ?? null,
        } as any);
    }

    async list(leadId: string): Promise<LeadActivityGetResponseDto[]> {
        const rows = await this.activityRepository.findByLeadId(leadId);
        if (!rows.length) return [];

        const userIds = Array.from(
            new Set(
                rows
                    .map((r) => r.created_by?.toString())
                    .filter(Boolean) as string[]
            )
        );
        const userMap = new Map<string, string>();
        if (userIds.length) {
            const users = await this.userRepository.findAll({
                _id: { $in: userIds },
            } as any);
            users.forEach((u: any) =>
                userMap.set(u._id.toString(), u.name || u.email || '')
            );
        }

        return rows.map((r) => ({
            _id: r._id.toString(),
            lead_id: r.lead_id.toString(),
            type: r.type,
            body: r.body,
            metadata: r.metadata,
            created_by: r.created_by?.toString(),
            created_by_name: r.created_by
                ? userMap.get(r.created_by.toString())
                : undefined,
            createdAt: (r as any).createdAt,
            updatedAt: (r as any).updatedAt,
        }));
    }

    /**
     * Edit a note. Only the original author can edit; only NOTE type.
     */
    async updateNote(
        activityId: string,
        body: string,
        userId: string
    ): Promise<LeadActivityDoc> {
        const row = await this.activityRepository.findOneById(activityId);
        if (!row || (row as any).soft_delete) {
            throw new NotFoundException('Activity not found');
        }
        if (row.type !== ENUM_LEAD_ACTIVITY_TYPE.NOTE) {
            throw new ForbiddenException('Only notes are editable');
        }
        if (row.created_by?.toString() !== userId) {
            throw new ForbiddenException('You can edit only your own notes');
        }
        const trimmed = (body || '').trim();
        if (!trimmed) {
            throw new BadRequestException('Note body is required');
        }
        row.body = trimmed;
        return this.activityRepository.save(row);
    }

    /**
     * Soft-delete a note. Same author-only / NOTE-only rule.
     */
    async deleteNote(activityId: string, userId: string): Promise<void> {
        const row = await this.activityRepository.findOneById(activityId);
        if (!row || (row as any).soft_delete) {
            throw new NotFoundException('Activity not found');
        }
        if (row.type !== ENUM_LEAD_ACTIVITY_TYPE.NOTE) {
            throw new ForbiddenException('Only notes are deletable');
        }
        if (row.created_by?.toString() !== userId) {
            throw new ForbiddenException('You can delete only your own notes');
        }
        row.soft_delete = true;
        await this.activityRepository.save(row);
    }
}
