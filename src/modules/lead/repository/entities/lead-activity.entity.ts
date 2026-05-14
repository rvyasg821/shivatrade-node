import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { LEAD_ACTIVITY_COLLECTION_NAME } from '../../constants/lead-activity.entity.constant';
import { ENUM_LEAD_ACTIVITY_TYPE } from '../../enums/lead-activity.enum';

@Entity(LEAD_ACTIVITY_COLLECTION_NAME)
export class LeadActivityEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    lead_id: string;

    @Index()
    @Column({ type: 'varchar', length: 30, nullable: false })
    type: ENUM_LEAD_ACTIVITY_TYPE;

    /** Free-text body — required for notes, optional for system events. */
    @Column({ type: 'text', nullable: true })
    body?: string;

    /** Type-specific payload (e.g. { from, to } for status_change). */
    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LeadActivityDoc = LeadActivityEntity;
