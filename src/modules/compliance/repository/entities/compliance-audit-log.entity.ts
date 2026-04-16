import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { COMPLIANCE_AUDIT_LOG_TABLE } from '../../constants/compliance.entity.constant';

@Entity(COMPLIANCE_AUDIT_LOG_TABLE)
export class ComplianceAuditLogEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    user_id: string; // subject of the audit

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'uuid', nullable: true })
    performed_by: string; // who performed the action

    @Column({ type: 'varchar', length: 100, nullable: false })
    action: string; // e.g. 'rtw_check_completed', 'immigration_record_updated'

    @Column({ type: 'varchar', length: 50, nullable: true })
    entity_type: string;

    @Column({ type: 'uuid', nullable: true })
    entity_id: string;

    @Column({ type: 'jsonb', nullable: true })
    previous_value: any;

    @Column({ type: 'jsonb', nullable: true })
    new_value: any;

    @Column({ type: 'text', nullable: true })
    notes: string;
}

export type ComplianceAuditLogDoc = ComplianceAuditLogEntity;
