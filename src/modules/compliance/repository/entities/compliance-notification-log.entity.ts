import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { COMPLIANCE_NOTIFICATION_LOG_TABLE } from '../../constants/compliance.entity.constant';

@Entity(COMPLIANCE_NOTIFICATION_LOG_TABLE)
export class ComplianceNotificationLogEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    user_id: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    notification_type: string; // 'visa_expiry_90', 'rtw_followup', etc.

    @Column({ type: 'varchar', length: 255, nullable: true })
    sent_to: string; // email address

    @Column({ type: 'timestamptz', nullable: false })
    sent_at: Date;

    @Column({ type: 'varchar', length: 50, nullable: true })
    entity_type: string;

    @Column({ type: 'uuid', nullable: true })
    entity_id: string;

    @Column({ type: 'int', nullable: true })
    days_remaining: number;
}

export type ComplianceNotificationLogDoc = ComplianceNotificationLogEntity;
