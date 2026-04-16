import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PLAN_STATUS, ENUM_PLAN_CURRENCY, ENUM_PLAN_DURATION_TYPE, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';
import { PLAN_COLLECTION_NAME } from '@modules/plan/constants/plan.entity.constant';
import { PlanToolDto } from '@modules/plan/dtos';

@Entity(PLAN_COLLECTION_NAME)
export class PlanEntity extends DatabaseObjectIdEntityBase {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'jsonb', default: [] })
    location_pricing?: Array<{
        locations: number;
        price: number;
        special_price?: number;
        special_price_duration?: number;
        platform_fee?: number;
    }>;

    @Column({ type: 'text', array: true, default: '{}' })
    features: string[];

    @Index()
    @Column({ type: 'int', nullable: false, default: ENUM_PLAN_STATUS.ACTIVE })
    status: ENUM_PLAN_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    isDefault: boolean;

    @Index()
    @Column({ type: 'int', default: 0 })
    displayOrder: number;

    @Column({ type: 'int', nullable: true, default: 0 })
    duration?: number;

    @Column({ type: 'varchar', nullable: false, default: ENUM_PLAN_DURATION_TYPE.MONTHLY })
    duration_type: ENUM_PLAN_DURATION_TYPE;

    @Column({ type: 'boolean', default: true })
    recurring?: boolean;

    @Column({ type: 'boolean', default: false })
    trial?: boolean;

    @Column({ type: 'boolean', default: false })
    is_lifetime?: boolean;

    @Column({ type: 'jsonb', default: [] })
    tools: PlanToolDto[];

    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, any>;
}

export type PlanDoc = PlanEntity;
