import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

export const DiscountAppliedDatabaseName = 'discount_applieds';

export enum ENUM_EXHAUSTED_REASON {
    DURATION_COMPLETED = 'duration_completed',
    LOCATION_CRITERIA_NOT_MET = 'location_criteria_not_met',
    MANUAL_REMOVAL = 'manual_removal',
    DISCOUNT_EXPIRED = 'discount_expired',
}

@Entity(DiscountAppliedDatabaseName)
export class DiscountAppliedEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    subscription_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    discount_id: string;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    discount_code: string;

    @Column({ type: 'float', default: 0 })
    discount_price: number;

    // ============ DURATION TRACKING ============
    @Column({ type: 'int', default: 1 })
    applied_count: number;

    @Column({ type: 'int', nullable: true, default: null })
    remaining_months?: number;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    first_applied_at: Date;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    last_applied_at: Date;

    @Column({ type: 'boolean', default: false })
    is_exhausted: boolean;

    @Column({ type: 'varchar', nullable: true, default: null })
    exhausted_reason?: ENUM_EXHAUSTED_REASON;
}

export type DiscountAppliedDoc = DiscountAppliedEntity;
