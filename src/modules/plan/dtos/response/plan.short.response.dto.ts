import { Exclude, Expose } from 'class-transformer';
import { ENUM_PLAN_STATUS, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';

export class LocationPricingShortResponseDto {
    @Expose()
    locations: number;

    @Expose()
    price: number;

    @Expose()
    special_price?: number;

    @Expose()
    special_price_duration?: number;
}

export class PlanShortResponseDto {
    @Expose()
    _id: string;

    @Expose()
    name: string;

    @Expose()
    location_pricing?: LocationPricingShortResponseDto[];

    @Expose()
    status: ENUM_PLAN_STATUS;

    @Expose()
    isDefault: boolean;

    @Expose()
    displayOrder: number;

    @Expose()
    tools?: Array<{
        _id: string;
        name: string;
    }>;

    @Exclude()
    description: string;

    @Exclude()
    features: string[];

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