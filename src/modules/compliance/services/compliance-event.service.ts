import { Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceEventRepository } from '../repository/repositories/compliance-event.repository';
import { ComplianceEventEntity } from '../repository/entities/compliance-event.entity';
import {
    ENUM_COMPLIANCE_EVENT_TYPE,
    ENUM_COMPLIANCE_EVENT_STATUS,
} from '../enums/compliance.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ComplianceEventService {
    constructor(private readonly repo: ComplianceEventRepository) {}

    async findAll(companyId: string, filters: any = {}): Promise<ComplianceEventEntity[]> {
        return this.repo.findAll(
            { company_id: companyId, soft_delete: false, ...filters },
            { order: { event_date: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        ) as Promise<ComplianceEventEntity[]>;
    }

    async getTotal(companyId: string, filters: any = {}): Promise<number> {
        return this.repo.getTotal({ company_id: companyId, soft_delete: false, ...filters });
    }

    async findOneById(id: string): Promise<ComplianceEventEntity> {
        const item = await this.repo.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Compliance event not found');
        return item as ComplianceEventEntity;
    }

    async findOverdueEvents(companyId: string, filters: any = {}): Promise<ComplianceEventEntity[]> {
        const today = new Date().toISOString().split('T')[0];
        return this.repo.findAll({
            company_id: companyId,
            soft_delete: false,
            reported: false,
            reporting_deadline: { $lte: today },
            status: { $ne: ENUM_COMPLIANCE_EVENT_STATUS.NOT_APPLICABLE },
            ...filters,
        }, {
            order: { reporting_deadline: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<ComplianceEventEntity[]>;
    }

    /** Calculate UKVI reporting deadline: 10 working days from event_date */
    private addWorkingDays(dateStr: string, days: number): string {
        const date = new Date(dateStr);
        let added = 0;
        while (added < days) {
            date.setDate(date.getDate() + 1);
            const day = date.getDay();
            if (day !== 0 && day !== 6) added++;
        }
        return date.toISOString().split('T')[0];
    }

    async create(companyId: string, userId: string, data: {
        event_type: string;
        event_date: string;
        description?: string;
        auto_detected?: boolean;
        source_entity?: string;
        source_entity_id?: string;
        reporting_deadline?: string;
    }): Promise<ComplianceEventEntity> {
        const deadline = data.reporting_deadline || this.addWorkingDays(data.event_date, 10);

        return this.repo.create({
            company_id: companyId,
            user_id: userId,
            event_type: data.event_type as any,
            event_date: data.event_date,
            description: data.description || null,
            reporting_deadline: deadline,
            reported: false,
            auto_detected: data.auto_detected ?? false,
            source_entity: data.source_entity || null,
            source_entity_id: data.source_entity_id || null,
            status: ENUM_COMPLIANCE_EVENT_STATUS.PENDING,
            soft_delete: false,
        });
    }

    async markReported(
        id: string,
        reportedBy: string,
        referenceNumber?: string,
    ): Promise<ComplianceEventEntity> {
        const item = await this.findOneById(id);
        return this.repo.update(item, {
            reported: true,
            reported_date: new Date().toISOString().split('T')[0],
            reported_by: reportedBy,
            reference_number: referenceNumber || null,
            status: ENUM_COMPLIANCE_EVENT_STATUS.REPORTED,
        }) as Promise<ComplianceEventEntity>;
    }

    async markNotApplicable(id: string): Promise<ComplianceEventEntity> {
        const item = await this.findOneById(id);
        return this.repo.update(item, { status: ENUM_COMPLIANCE_EVENT_STATUS.NOT_APPLICABLE }) as Promise<ComplianceEventEntity>;
    }

    async update(id: string, data: Partial<ComplianceEventEntity>): Promise<ComplianceEventEntity> {
        const item = await this.findOneById(id);
        return this.repo.update(item, data) as Promise<ComplianceEventEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.repo.update({ _id: (item as any)._id }, { soft_delete: true } as any);
    }

    /** Refresh statuses: mark overdue events */
    async refreshStatuses(companyId: string): Promise<number> {
        const today = new Date().toISOString().split('T')[0];
        const pending = await this.repo.findAll({
            company_id: companyId,
            soft_delete: false,
            reported: false,
            status: ENUM_COMPLIANCE_EVENT_STATUS.PENDING,
        }, {}) as ComplianceEventEntity[];

        let updated = 0;
        for (const event of pending) {
            if (event.reporting_deadline && event.reporting_deadline < today) {
                await this.repo.update(event, { status: ENUM_COMPLIANCE_EVENT_STATUS.OVERDUE });
                updated++;
            }
        }
        return updated;
    }

    mapGet(e: ComplianceEventEntity) {
        return {
            _id: e._id,
            company_id: e.company_id,
            user_id: e.user_id,
            event_type: e.event_type,
            event_date: e.event_date,
            description: e.description,
            reporting_deadline: e.reporting_deadline,
            reported: e.reported,
            reported_date: e.reported_date,
            reported_by: e.reported_by,
            reference_number: e.reference_number,
            auto_detected: e.auto_detected,
            source_entity: e.source_entity,
            status: e.status,
            createdAt: e.createdAt,
        };
    }
}
