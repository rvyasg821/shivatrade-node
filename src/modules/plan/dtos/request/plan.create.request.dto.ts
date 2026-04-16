import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsNumber,
    IsObject,
    IsArray,
    ValidateNested,
    Min,
    Max,
    MaxLength,
    IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_PLAN_STATUS, ENUM_PLAN_DURATION_TYPE, ENUM_TOOL_PRICING_MODE } from '@modules/plan/enums/plan.enum';
import { UniqueLocations } from '@common/request/validations/request.unique-locations.validation';

export class PlanToolDto {
    @ApiProperty({
        description: 'Tool ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @ApiProperty({
        description: 'Tool name',
        example: 'Security Tool',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({
        description: 'Tool slug',
        example: 'security_tool',
    })
    @IsString()
    @IsOptional()
    slug?: string;

    @ApiProperty({
        description: 'Price for the tool (for 1 location)',
        example: 50,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    price: number;

    @ApiProperty({
        description: 'Pricing mode: fixed (same price regardless of locations) or multiplier (price scales with locations)',
        enum: ENUM_TOOL_PRICING_MODE,
        default: ENUM_TOOL_PRICING_MODE.FIXED,
        example: ENUM_TOOL_PRICING_MODE.MULTIPLIER,
    })
    @IsString()
    @IsEnum(ENUM_TOOL_PRICING_MODE)
    @IsNotEmpty()
    pricing_mode: ENUM_TOOL_PRICING_MODE;

    @ApiPropertyOptional({
        description: 'Location multiplier (only used when pricing_mode is "multiplier"). 1.0 = full price per location, 0.8 = 20% discount per location',
        example: 0.8,
        minimum: 0.1,
        maximum: 10.0,
        default: 1.0,
    })
    @IsNumber()
    @Min(0.1)
    @Max(10.0)
    @IsOptional()
    location_multiplier?: number;

    @ApiPropertyOptional({
        description: 'Whether the tool is mandatory',
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    is_mandatory?: boolean = false;
}

export class LocationPricingDto {
    @ApiProperty({
        description: 'Number of locations for this pricing tier',
        example: 5,
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @IsNotEmpty()
    locations: number;

    @ApiProperty({
        description: 'Base/Platform price for this location tier',
        example: 400,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    price: number;

    @ApiPropertyOptional({
        description: 'Special/Discounted price for this location tier (if set, takes precedence over base price)',
        example: 350,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    special_price?: number;

    @ApiPropertyOptional({
        description: 'Duration in days/months for which the special price is valid',
        example: 3,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    special_price_duration?: number;

    @ApiPropertyOptional({
        description: 'Platform fee for this location tier',
        example: 50,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    platform_fee?: number;
}

export class PlanCreateRequestDto {
    @ApiProperty({
        description: 'Plan name',
        example: 'Basic Plan',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({
        description: 'Plan description',
        example: 'Basic security plan for small teams',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Location-based pricing tiers. Define different prices for different numbers of locations.',
        type: [LocationPricingDto],
        default: [],
        example: [
            { locations: 1, price: 100, special_price: null, special_price_duration: 0, platform_fee: 10 },
            { locations: 3, price: 250, special_price: 200, special_price_duration: 3, platform_fee: 25 },
            { locations: 5, price: 400, special_price: 350, special_price_duration: 6, platform_fee: 40 },
            { locations: 10, price: 700, special_price: null, special_price_duration: 0, platform_fee: 70 },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LocationPricingDto)
    @UniqueLocations({ message: 'Location pricing tiers must have unique location counts' })
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    location_pricing?: LocationPricingDto[];

    @ApiPropertyOptional({
        description: 'Plan features',
        type: [String],
        default: [],
    })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    features?: string[];

    @ApiPropertyOptional({
        description: 'Plan status',
        enum: ENUM_PLAN_STATUS,
        default: ENUM_PLAN_STATUS.ACTIVE,
    })
    @IsEnum(ENUM_PLAN_STATUS)
    @IsOptional()
    @Transform(({ value }) => value ?? ENUM_PLAN_STATUS.ACTIVE)
    status?: ENUM_PLAN_STATUS;

    @ApiPropertyOptional({
        description: 'Whether this is the default plan',
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    isDefault?: boolean;

    @ApiPropertyOptional({
        description: 'Display order',
        minimum: 0,
        maximum: 999,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @Max(999)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    displayOrder?: number;

    @ApiPropertyOptional({
        description: 'Plan duration',
        example: 30,
    })
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiProperty({
        description: 'Plan duration type',
        enum: ENUM_PLAN_DURATION_TYPE,
        example: ENUM_PLAN_DURATION_TYPE.MONTHLY,
    })
    @IsEnum(ENUM_PLAN_DURATION_TYPE)
    duration_type: ENUM_PLAN_DURATION_TYPE;

    @ApiPropertyOptional({
        description: 'Whether the plan is recurring',
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    recurring?: boolean;

    @ApiPropertyOptional({
        description: 'Whether the plan has a trial',
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    trial?: boolean;

    @ApiPropertyOptional({
        description: 'Whether the plan is for a lifetime',
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    is_lifetime?: boolean;

    @ApiPropertyOptional({
        description: 'Tools included in the plan',
        type: [PlanToolDto],
        default: [],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanToolDto)
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    tools?: PlanToolDto[];

    @ApiPropertyOptional({
        description: 'Additional metadata',
        type: 'object',
        additionalProperties: true,
        default: {},
    })
    @IsObject()
    @IsOptional()
    @Transform(({ value }) => value ?? {})
    metadata?: Record<string, any>;
}