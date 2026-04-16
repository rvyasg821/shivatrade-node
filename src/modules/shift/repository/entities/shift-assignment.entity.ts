import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { SHIFT_ASSIGNMENT_TABLE } from '../../constants/shift.entity.constant';
import { ENUM_SHIFT_ASSIGNMENT_STATUS } from '../../enums/shift.enum';

@Entity(SHIFT_ASSIGNMENT_TABLE)
@Unique(['user_id', 'date'])
export class ShiftAssignmentEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    shift_template_id: string;

    @Index()
    @Column({ type: 'date', nullable: false })
    date: string;

    @Column({ type: 'time', nullable: true })
    start_time: string; // override template

    @Column({ type: 'time', nullable: true })
    end_time: string;

    @Column({ type: 'varchar', length: 30, default: ENUM_SHIFT_ASSIGNMENT_STATUS.SCHEDULED })
    status: string;

    @Column({ type: 'boolean', default: false })
    published: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    published_at: Date;

    @Column({ type: 'uuid', nullable: true })
    published_by: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ShiftAssignmentDoc = ShiftAssignmentEntity;
