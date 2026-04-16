import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { LEAVE_TYPE_TABLE } from '../../constants/leave.entity.constant';
import { ENUM_LEAVE_ACCRUAL_METHOD } from '../../enums/leave.enum';

@Entity(LEAVE_TYPE_TABLE)
export class LeaveTypeEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_id: string; // NULL = system default type

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 100 })
    slug: string;

    @Column({ type: 'varchar', length: 7, default: '#4A90E2' })
    color: string;

    @Column({ type: 'boolean', default: true })
    is_paid: boolean;

    @Column({ type: 'boolean', default: true })
    requires_approval: boolean;

    @Column({ type: 'float', nullable: true })
    max_days_per_year: number;

    @Column({ type: 'boolean', default: false })
    is_system: boolean;

    @Column({ type: 'boolean', default: false })
    carry_over_allowed: boolean;

    @Column({ type: 'float', nullable: true })
    max_carry_over_days: number;

    @Column({ type: 'varchar', length: 20, default: ENUM_LEAVE_ACCRUAL_METHOD.ANNUAL })
    accrual_method: string;

    @Column({ type: 'int', default: 0 })
    notice_days: number;

    @Column({ type: 'int', default: 1 })
    min_block_days: number;

    @Column({ type: 'int', nullable: true })
    max_consecutive: number;

    @Column({ type: 'boolean', default: false })
    documentation_required: boolean;

    @Column({ type: 'int', nullable: true })
    documentation_after_days: number;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LeaveTypeDoc = LeaveTypeEntity;
