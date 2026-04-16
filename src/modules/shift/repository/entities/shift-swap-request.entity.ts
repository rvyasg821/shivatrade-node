import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { SHIFT_SWAP_REQUEST_TABLE } from '../../constants/shift.entity.constant';
import { ENUM_SHIFT_SWAP_STATUS } from '../../enums/shift.enum';

@Entity(SHIFT_SWAP_REQUEST_TABLE)
export class ShiftSwapRequestEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    requester_id: string; // employee requesting swap

    @Column({ type: 'uuid', nullable: true })
    target_id: string; // employee to swap with (nullable = open swap)

    @Column({ type: 'uuid', nullable: false })
    requester_assignment_id: string; // assignment being offered

    @Column({ type: 'uuid', nullable: true })
    target_assignment_id: string; // assignment being requested

    @Column({ type: 'varchar', length: 30, default: ENUM_SHIFT_SWAP_STATUS.PENDING })
    status: string;

    @Column({ type: 'text', nullable: true })
    reason: string;

    @Column({ type: 'uuid', nullable: true })
    admin_approved_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    admin_approved_at: Date;

    @Column({ type: 'text', nullable: true })
    admin_notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ShiftSwapRequestDoc = ShiftSwapRequestEntity;
