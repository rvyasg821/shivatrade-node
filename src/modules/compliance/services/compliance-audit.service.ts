import { Injectable } from '@nestjs/common';
import { ComplianceAuditLogRepository } from '../repository/repositories/compliance-audit-log.repository';
import { ComplianceAuditLogEntity } from '../repository/entities/compliance-audit-log.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ComplianceAuditService {
    constructor(private readonly repo: ComplianceAuditLogRepository) {}

    async log(data: {
        company_id: string;
        user_id?: string;
        performed_by?: string;
        action: string;
        entity_type?: string;
        entity_id?: string;
        previous_value?: any;
        new_value?: any;
        notes?: string;
    }): Promise<ComplianceAuditLogEntity> {
        return this.repo.create({
            company_id: data.company_id,
            user_id: data.user_id || null,
            performed_by: data.performed_by || null,
            action: data.action,
            entity_type: data.entity_type || null,
            entity_id: data.entity_id || null,
            previous_value: data.previous_value || null,
            new_value: data.new_value || null,
            notes: data.notes || null,
        });
    }

    async findByCompany(companyId: string, limit = 50, offset = 0, filters: any = {}): Promise<ComplianceAuditLogEntity[]> {
        return this.repo.findAll(
            { company_id: companyId, ...filters },
            {
                paging: { limit, offset },
                order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
            }
        ) as Promise<ComplianceAuditLogEntity[]>;
    }

    async findByUser(userId: string, limit = 50): Promise<ComplianceAuditLogEntity[]> {
        return this.repo.findAll(
            { user_id: userId },
            {
                paging: { limit, offset: 0 },
                order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
            }
        ) as Promise<ComplianceAuditLogEntity[]>;
    }
}
