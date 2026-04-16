import { Exclude, Expose } from 'class-transformer';
import { ENUM_PLAN_STATUS, ENUM_PLAN_DURATION_TYPE, ENUM_PLAN_CURRENCY, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';

export class PlanPriceResponseDto {
    @Expose()
    monthly: number;

    @Expose()
    yearly: number;

    @Expose()
    currency: ENUM_PLAN_CURRENCY;
}

export class LocationPricingResponseDto {
    @Expose()
    locations: number;

    @Expose()
    price: number;

    @Expose()
    special_price?: number;

    @Expose()
    special_price_duration?: number;

    @Expose()
    platform_fee?: number;
}

export class PlanToolResponseDto {
    @Expose()
    _id: string;

    @Expose()
    name: string;

    @Expose()
    slug?: string;

    @Expose()
    price: number;

    @Expose()
    pricing_mode: ENUM_TOOL_PRICING_MODE;

    @Expose()
    location_multiplier?: number;

    @Expose()
    is_mandatory?: boolean;
}

export class PlanListResponseDto {
    @Expose()
    _id: string;

    @Expose()
    name: string;

    @Expose()
    description: string;

    @Expose()
    location_pricing?: LocationPricingResponseDto[];

    @Expose()
    features: string[];

    @Expose()
    status: ENUM_PLAN_STATUS;

    @Expose()
    isDefault: boolean;

    @Expose()
    displayOrder: number;

    @Expose()
    duration?: string;

    @Expose()
    duration_type: ENUM_PLAN_DURATION_TYPE;

    @Expose()
    recurring?: boolean;

    @Expose()
    trial?: boolean;

    @Expose()
    is_lifetime?: boolean;

    @Expose()
    tools?: PlanToolResponseDto[];

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Exclude()
    deleted: boolean;

    @Exclude()
    deletedAt?: Date;

    @Exclude()
    metadata: Record<string, any>;
}