import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { LEAVE_POLICY_TABLE } from '../../constants/leave.entity.constant';
import { ENUM_PROBATION_ENTITLEMENT_METHOD } from '../../enums/leave.enum';

@Entity(LEAVE_POLICY_TABLE)
@Unique(['company_id'])
export class LeavePolicyEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'int', default: 1 })
    leave_year_start_month: number; // 1 = January

    @Column({ type: 'boolean', default: true })
    include_bank_holidays: boolean;

    @Column({ type: 'boolean', default: false })
    bradford_factor_enabled: boolean;

    @Column({ type: 'float', default: 150 })
    bradford_factor_threshold: number;

    @Column({ type: 'boolean', default: false })
    auto_approve_enabled: boolean;

    @Column({ type: 'boolean', default: false })
    toil_enabled: boolean;

    @Column({ type: 'float', default: 28 })
    default_annual_entitlement: number;

    @Column({ type: 'varchar', length: 20, default: ENUM_PROBATION_ENTITLEMENT_METHOD.PRO_RATA })
    probation_entitlement_method: string;
}

export type LeavePolicyDoc = LeavePolicyEntity;
