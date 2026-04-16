import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsArray,
    Min,
    ValidateNested,
    IsDateString,
    IsUUID,
    IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Location pricing tier DTO - cloned from Plan
 */
export class LocationPricingDto {
    @ApiProperty({
        description: 'Number of locations for this tier',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    locations: number;

    @ApiProperty({
        description: 'Base price for this tier',
        example: 49.99,
    })
    @IsNumber()
    @Min(0)
    price: number;

    @ApiPropertyOptional({
        description: 'Special price for this tier',
        example: 39.99,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    special_price?: number;

    @ApiPropertyOptional({
        description: 'Special price duration in billing cycles',
        example: 3,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    special_price_duration?: number;

    @ApiPropertyOptional({
        description: 'Platform fee for this tier',
        example: 5.00,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    platform_fee?: number;
}

/**
 * Tool DTO with full pricing details - cloned from Plan
 */
export class SelectedToolDto {
    @ApiProperty({
        description: 'Tool unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @ApiProperty({
        description: 'Tool name',
        example: 'Wazuh',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({
        description: 'Tool slug',
        example: 'wazuh',
    })
    @IsString()
    @IsOptional()
    slug?: string;

    @ApiProperty({
        description: 'Base price from plan (original price)',
        example: 9.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    base_price: number;

    @ApiProperty({
        description: 'Pricing mode (fixed or multiplier)',
        example: 'fixed',
        enum: ['fixed', 'multiplier'],
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value ?? 'fixed')
    pricing_mode: string;

    @ApiPropertyOptional({
        description: 'Location multiplier for multiplier pricing mode',
        example: 1.0,
        default: 1.0,
    })
    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => value ?? 1.0)
    location_multiplier?: number;

    @ApiProperty({
        description: 'Calculated price (after applying pricing mode)',
        example: 29.97,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    calculated_price: number;

    @ApiPropertyOptional({
        description: 'Whether this tool is mandatory',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    is_mandatory?: boolean;

    @ApiPropertyOptional({
        description: 'Display order',
        example: 1,
        default: 0,
    })
    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    display_order?: number;
}

export class SubscriptionCreateRequestDto {
    // ============ REFERENCES ============
    @ApiProperty({
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    user_id: string;

    @ApiPropertyOptional({
        description: 'Company ID (will be derived from user if not provided)',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    company_id?: string;

    @ApiProperty({
        description: 'Plan ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    plan_id: string;

    // ============ LOCATION-BASED PRICING ============
    @ApiPropertyOptional({
        description: 'Number of locations',
        example: 1,
        default: 1,
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @IsOptional()
    @Transform(({ value }) => value ?? 1)
    locations?: number;

    @ApiPropertyOptional({
        description: 'Whether this is a custom location count (not from predefined tiers)',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    is_custom_location?: boolean;

    @ApiPropertyOptional({
        description: 'Location pricing tiers (cloned from plan)',
        type: () => [LocationPricingDto],
        default: [],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LocationPricingDto)
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    location_pricing?: LocationPricingDto[];

    // ============ PLAN TIER VALUES ============
    @ApiProperty({
        description: 'Plan price for selected locations',
        example: 49.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    plan_price: number;

    @ApiPropertyOptional({
        description: 'Original plan price at purchase (for reference)',
        example: 49.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    original_plan_price?: number;

    @ApiPropertyOptional({
        description: 'Special price if active',
        example: 39.99,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    special_price?: number;

    @ApiPropertyOptional({
        description: 'Total special price billing cycles',
        example: 3,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    special_price_duration?: number;

    @ApiPropertyOptional({
        description: 'Remaining special price cycles',
        example: 2,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    special_price_remaining?: number;

    // ============ TOOLS ============
    @ApiPropertyOptional({
        description: 'Selected tools with full pricing details',
        type: () => [SelectedToolDto],
        default: [],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SelectedToolDto)
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    tools?: SelectedToolDto[];

    @ApiProperty({
        description: 'Total tools price',
        example: 29.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    tools_price: number;

    // ============ CALCULATIONS ============
    @ApiPropertyOptional({
        description: 'Subtotal (plan_price + tools_price)',
        example: 79.98,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    subtotal?: number;

    // ============ DISCOUNT ============
    @ApiPropertyOptional({
        description: 'Discount ID reference',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    discount_id?: string;

    @ApiPropertyOptional({
        description: 'Discount code',
        example: 'SAVE20',
    })
    @IsString()
    @IsOptional()
    discount_code?: string;

    @ApiPropertyOptional({
        description: 'Discount type',
        example: 'percentage',
        enum: ['percentage', 'fixed'],
    })
    @IsString()
    @IsOptional()
    @IsEnum(['percentage', 'fixed'])
    discount_type?: string;

    @ApiPropertyOptional({
        description: 'Discount value (percentage or fixed amount)',
        example: 20,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    discount_value?: number;

    @ApiPropertyOptional({
        description: 'Calculated discount amount',
        example: 15.99,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    discount_price?: number;

    @ApiPropertyOptional({
        description: 'Discount duration type',
        example: 'forever',
        enum: ['forever', 'first_payment', 'limited_months'],
    })
    @IsString()
    @IsOptional()
    @IsEnum(['forever', 'first_payment', 'limited_months'])
    discount_duration_type?: string;

    @ApiPropertyOptional({
        description: 'Total discount duration in months (for limited_months type)',
        example: 6,
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @IsOptional()
    discount_duration_months?: number;

    @ApiPropertyOptional({
        description: 'Remaining discount months (for limited_months type)',
        example: 6,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    discount_remaining_months?: number;

    @ApiPropertyOptional({
        description: 'Discount name for display',
        example: 'Summer Sale Discount',
    })
    @IsString()
    @IsOptional()
    discount_name?: string;

    @ApiPropertyOptional({
        description: 'Discount location rules',
        example: [{ type: 'minimum', value: 3 }],
    })
    @IsArray()
    @IsOptional()
    discount_location_rules?: Array<{
        type: string;
        value?: number;
        min?: number;
        max?: number;
    }>;

    // ============ AFTER DISCOUNT ============
    @ApiPropertyOptional({
        description: 'Total after discount (subtotal - discount_price)',
        example: 63.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    total?: number;

    // ============ TAX ============
    @ApiPropertyOptional({
        description: 'Tax type (VAT, GST, Sales Tax, etc.)',
        example: 'VAT',
    })
    @IsString()
    @IsOptional()
    tax_type?: string;

    @ApiPropertyOptional({
        description: 'Tax rate percentage',
        example: 10,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    tax_rate?: number;

    @ApiPropertyOptional({
        description: 'Calculated tax amount',
        example: 6.40,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    tax_price?: number;

    // ============ FINAL AMOUNT ============
    @ApiProperty({
        description: 'Final price (total + tax_price)',
        example: 70.39,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    final_price: number;

    // ============ PLAN INFO (Snapshot) ============
    @ApiPropertyOptional({
        description: 'Plan name at purchase',
        example: 'Professional Plan',
    })
    @IsString()
    @IsOptional()
    plan_name?: string;

    @ApiPropertyOptional({
        description: 'Plan description at purchase',
        example: 'Best for growing businesses',
    })
    @IsString()
    @IsOptional()
    plan_description?: string;

    @ApiPropertyOptional({
        description: 'Plan type (MONTHLY, YEARLY)',
        example: 'MONTHLY',
    })
    @IsString()
    @IsOptional()
    plan_type?: string;

    @ApiPropertyOptional({
        description: 'Plan type value (days in billing cycle)',
        example: 30,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    plan_type_value?: number;

    // ============ SUBSCRIPTION FLAGS ============
    @ApiPropertyOptional({
        description: 'Whether the subscription is recurring',
        example: true,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    recurring?: boolean;

    @ApiPropertyOptional({
        description: 'Whether this is a lifetime subscription',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    is_lifetime?: boolean;

    @ApiPropertyOptional({
        description: 'Whether this is a trial subscription',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    trial?: boolean;

    @ApiPropertyOptional({
        description: 'Trial period in days',
        example: 14,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    trial_days?: number;

    @ApiPropertyOptional({
        description: 'Whether this is the default subscription',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    is_default?: boolean;

    // ============ DATES ============
    @ApiPropertyOptional({
        description: 'Subscription start date',
        example: '2023-10-10T10:00:00.000Z',
    })
    @IsDateString()
    @IsOptional()
    start_date?: Date;

    @ApiPropertyOptional({
        description: 'Next billing date',
        example: '2023-11-10T10:00:00.000Z',
    })
    @IsDateString()
    @IsOptional()
    next_date?: Date;

    @ApiPropertyOptional({
        description: 'Subscription end date',
        example: '2024-10-10T10:00:00.000Z',
    })
    @IsDateString()
    @IsOptional()
    end_date?: Date;

    // ============ STATUS ============
    @ApiPropertyOptional({
        description: 'Subscription status',
        example: true,
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? true)
    status?: boolean;

    @ApiPropertyOptional({
        description: 'Whether the subscription is on hold',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    hold?: boolean;

    // ============ PROVISIONING ============
    @ApiPropertyOptional({
        description: 'Tool provisioning status',
        example: 'pending',
        enum: ['pending', 'provisioning', 'provisioned', 'failed'],
    })
    @IsString()
    @IsOptional()
    provisioningStatus?: string;

    @ApiPropertyOptional({
        description: 'Date when tools were provisioned',
        example: '2023-10-10T10:00:00.000Z',
    })
    @IsDateString()
    @IsOptional()
    provisionedAt?: Date;

    @ApiPropertyOptional({
        description: 'Error message if provisioning failed',
        example: 'Failed to connect to tenant database',
    })
    @IsString()
    @IsOptional()
    provisioningError?: string;

    // ============ AGENT/REFERRAL ============
    @ApiPropertyOptional({
        description: 'Referral code',
        example: 'REF123',
    })
    @IsString()
    @IsOptional()
    referal_code?: string;

    @ApiPropertyOptional({
        description: 'Agent ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    agent_id?: string;

    @ApiPropertyOptional({
        description: 'Agent commission percentage',
        example: 10,
        default: 0,
    })
    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    commission?: number;
}
