import { Exclude, Expose } from 'class-transformer';
import { ENUM_PLAN_STATUS, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';

export class LocationPricingPublicResponseDto {
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

export class PlanToolPublicResponseDto {
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

export class PlanPublicResponseDto {
    @Expose()
    _id: string;

    @Expose()
    name: string;

    @Expose()
    description: string;

    @Expose()
    location_pricing?: LocationPricingPublicResponseDto[];

    @Expose()
    features: string[];

    @Expose()
    isDefault: boolean;

    @Expose()
    displayOrder: number;

    @Expose()
    status: ENUM_PLAN_STATUS;

    @Expose()
    tools?: PlanToolPublicResponseDto[];

    @Exclude()
    metadata: Record<string, any>;

    @Exclude()
    createdAt: Date;

    @Exclude()
    updatedAt: Date;

    @Exclude()
    deleted: boolean;

    @Exclude()
    deletedAt?: Date;
}