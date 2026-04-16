import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { LEAVE_REQUEST_TABLE } from '../../constants/leave.entity.constant';
import {
    ENUM_LEAVE_REQUEST_STATUS,
    ENUM_LEAVE_HALF_DAY,
} from '../../enums/leave.enum';

@Entity(LEAVE_REQUEST_TABLE)
export class LeaveRequestEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    leave_type_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'date', nullable: false })
    start_date: string;

    @Column({ type: 'date', nullable: false })
    end_date: string;

    @Column({ type: 'varchar', length: 10, default: ENUM_LEAVE_HALF_DAY.FULL })
    start_half: string; // full, am, pm

    @Column({ type: 'varchar', length: 10, default: ENUM_LEAVE_HALF_DAY.FULL })
    end_half: string; // full, am, pm

    @Column({ type: 'float', default: 0 })
    total_days: number; // computed working days excluding holidays

    @Column({ type: 'text', nullable: true })
    reason: string;

    @Column({ type: 'varchar', length: 20, default: ENUM_LEAVE_REQUEST_STATUS.PENDING })
    status: string;

    @Column({ type: 'uuid', nullable: true })
    approved_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    approved_at: Date;

    @Column({ type: 'text', nullable: true })
    rejection_reason: string;

    @Column({ type: 'timestamptz', nullable: true })
    cancelled_at: Date;

    @Column({ type: 'uuid', nullable: true })
    supporting_doc_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LeaveRequestDoc = LeaveRequestEntity;
