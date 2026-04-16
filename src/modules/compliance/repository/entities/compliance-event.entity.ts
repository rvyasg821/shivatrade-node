import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { COMPLIANCE_EVENT_TABLE } from '../../constants/compliance.entity.constant';
import { ENUM_COMPLIANCE_EVENT_TYPE, ENUM_COMPLIANCE_EVENT_STATUS } from '../../enums/compliance.enum';

@Entity(COMPLIANCE_EVENT_TABLE)
export class ComplianceEventEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'varchar', length: 50, default: ENUM_COMPLIANCE_EVENT_TYPE.CUSTOM })
    event_type: string;

    @Column({ type: 'date', nullable: false })
    event_date: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'date', nullable: true })
    reporting_deadline: string; // UKVI 10-working-day deadline

    @Column({ type: 'boolean', default: false })
    reported: boolean;

    @Column({ type: 'date', nullable: true })
    reported_date: string;

    @Column({ type: 'uuid', nullable: true })
    reported_by: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    reference_number: string;

    @Column({ type: 'boolean', default: false })
    auto_detected: boolean;

    @Column({ type: 'varchar', length: 50, nullable: true })
    source_entity: string; // 'attendance', 'user', etc.

    @Column({ type: 'uuid', nullable: true })
    source_entity_id: string;

    @Column({ type: 'varchar', length: 30, default: ENUM_COMPLIANCE_EVENT_STATUS.PENDING })
    status: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ComplianceEventDoc = ComplianceEventEntity;
