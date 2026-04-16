import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { LEAVE_ENTITLEMENT_TABLE } from '../../constants/leave.entity.constant';

@Entity(LEAVE_ENTITLEMENT_TABLE)
@Unique(['user_id', 'leave_type_id', 'year'])
export class LeaveEntitlementEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    leave_type_id: string;

    @Column({ type: 'int', nullable: false })
    year: number;

    @Column({ type: 'float', default: 0 })
    total_entitlement: number;

    @Column({ type: 'float', default: 0 })
    carried_over: number;

    @Column({ type: 'float', default: 0 })
    additional: number;

    @Column({ type: 'float', default: 0 })
    used: number;

    @Column({ type: 'float', default: 0 })
    pending: number;

    @Column({ type: 'float', default: 0 })
    balance: number;
}

export type LeaveEntitlementDoc = LeaveEntitlementEntity;
