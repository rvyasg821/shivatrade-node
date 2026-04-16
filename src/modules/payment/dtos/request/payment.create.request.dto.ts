import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsNumber,
    IsObject,
    IsBoolean,
    IsArray,
    Min,
    ValidateNested,
    IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_PAYMENT_GATEWAY, ENUM_PAYMENT_METHOD, ENUM_PAYMENT_STATUS } from '../../repository/entities/payment.entity';

/**
 * Location pricing tier DTO - cloned from Plan
 */
export class PaymentLocationPricingDto {
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
export class PaymentToolDto {
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

/**
 * Plan snapshot DTO - captured at purchase time
 */
export class PaymentPlanSnapshotDto {
    @ApiPropertyOptional({
        description: 'Plan name',
        example: 'Professional Plan',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Plan description',
        example: 'Best for growing businesses',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Duration value',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiPropertyOptional({
        description: 'Duration type (MONTHLY, YEARLY)',
        example: 'MONTHLY',
    })
    @IsString()
    @IsOptional()
    duration_type?: string;

    @ApiPropertyOptional({
        description: 'Whether the plan is recurring',
        example: true,
    })
    @IsBoolean()
    @IsOptional()
    recurring?: boolean;

    @ApiPropertyOptional({
        description: 'Whether the plan is lifetime',
        example: false,
    })
    @IsBoolean()
    @IsOptional()
    is_lifetime?: boolean;

    @ApiPropertyOptional({
        description: 'Whether the plan has trial',
        example: true,
    })
    @IsBoolean()
    @IsOptional()
    trial?: boolean;

    @ApiPropertyOptional({
        description: 'Trial period in days',
        example: 14,
    })
    @IsNumber()
    @IsOptional()
    trial_days?: number;
}

export class PaymentCreateRequestDto {
    // ============ REFERENCES ============
    @ApiProperty({
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    user_id: string;

    @ApiPropertyOptional({
        description: 'Company ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    company_id?: string;

    @ApiPropertyOptional({
        description: 'Plan ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    plan_id?: string;

    @ApiPropertyOptional({
        description: 'Subscription ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    subscription_id?: string;

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
        description: 'Location pricing tiers (cloned from plan)',
        type: () => [PaymentLocationPricingDto],
        default: [],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PaymentLocationPricingDto)
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    location_pricing?: PaymentLocationPricingDto[];

    // ============ PLAN TIER VALUES ============
    @ApiPropertyOptional({
        description: 'Plan price for selected locations',
        example: 49.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    plan_price?: number;

    @ApiPropertyOptional({
        description: 'Special price from tier',
        example: 39.99,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    plan_special_price?: number;

    @ApiPropertyOptional({
        description: 'Special price duration in billing cycles',
        example: 3,
        minimum: 0,
        default: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    @Transform(({ value }) => value ?? 0)
    plan_special_price_duration?: number;

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
    plan_special_price_remaining?: number;

    // ============ TOOLS ============
    @ApiPropertyOptional({
        description: 'Tools with full pricing details',
        type: () => [PaymentToolDto],
        default: [],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PaymentToolDto)
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    tools?: PaymentToolDto[];

    @ApiPropertyOptional({
        description: 'Total tools price',
        example: 29.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    tools_price?: number;

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
        example: 'limited_months',
        enum: ['forever', 'first_payment', 'limited_months'],
    })
    @IsString()
    @IsOptional()
    discount_duration_type?: string;

    @ApiPropertyOptional({
        description: 'Total months for limited_months discount type',
        example: 6,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    discount_duration_months?: number;

    @ApiPropertyOptional({
        description: 'Remaining months at time of payment',
        example: 3,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    @IsOptional()
    discount_remaining_months?: number;

    @ApiPropertyOptional({
        description: 'Discount name for display',
        example: 'Summer Sale',
    })
    @IsString()
    @IsOptional()
    discount_name?: string;

    // ============ AFTER DISCOUNT ============
    @ApiProperty({
        description: 'Total after discount (subtotal - discount_price)',
        example: 63.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    total: number;

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

    // ============ PLAN SNAPSHOT ============
    @ApiPropertyOptional({
        description: 'Plan snapshot at purchase time',
        type: () => PaymentPlanSnapshotDto,
    })
    @ValidateNested()
    @Type(() => PaymentPlanSnapshotDto)
    @IsOptional()
    plan_snapshot?: PaymentPlanSnapshotDto;

    // ============ PAYMENT INFO ============
    @ApiPropertyOptional({
        description: 'Payment gateway',
        enum: ENUM_PAYMENT_GATEWAY,
        example: ENUM_PAYMENT_GATEWAY.STRIPE,
    })
    @IsOptional()
    @IsEnum(ENUM_PAYMENT_GATEWAY)
    gateway?: ENUM_PAYMENT_GATEWAY;

    @ApiPropertyOptional({
        description: 'Payment method',
        enum: ENUM_PAYMENT_METHOD,
        example: ENUM_PAYMENT_METHOD.CARD,
    })
    @IsOptional()
    @IsEnum(ENUM_PAYMENT_METHOD)
    method?: ENUM_PAYMENT_METHOD;

    @ApiPropertyOptional({
        description: 'Charge ID from payment gateway',
        example: 'ch_1234567890',
    })
    @IsString()
    @IsOptional()
    charge_id?: string;

    @ApiPropertyOptional({
        description: 'Request ID for tracking',
        example: 'req_1234567890',
    })
    @IsString()
    @IsOptional()
    request_id?: string;

    @ApiPropertyOptional({
        description: 'Payment status',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    paid?: boolean;

    @ApiPropertyOptional({
        description: 'Post date time string',
        example: '2023-10-10 10:00 AM',
    })
    @IsString()
    @IsOptional()
    postDateTime?: string;

    @ApiPropertyOptional({
        description: 'Is trial payment',
        example: false,
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => value ?? false)
    trial?: boolean;

    @ApiPropertyOptional({
        description: 'Payment status',
        enum: ENUM_PAYMENT_STATUS,
        example: ENUM_PAYMENT_STATUS.CREATED,
        default: ENUM_PAYMENT_STATUS.CREATED,
    })
    @IsEnum(ENUM_PAYMENT_STATUS)
    @IsOptional()
    @Transform(({ value }) => value ?? ENUM_PAYMENT_STATUS.CREATED)
    status?: ENUM_PAYMENT_STATUS;

    // ============ INVOICE ============
    @ApiPropertyOptional({
        description: 'Invoice number',
        example: 1001,
    })
    @IsNumber()
    @IsOptional()
    inv_number?: number;

    @ApiPropertyOptional({
        description: 'Full invoice number',
        example: 'INV-2023-1001',
    })
    @IsString()
    @IsOptional()
    full_inv_number?: string;

    @ApiPropertyOptional({
        description: 'Invoice file path',
        example: '/invoices/INV-2023-1001.pdf',
    })
    @IsString()
    @IsOptional()
    inv_path?: string;

    // ============ REQUEST/RESPONSE ============
    @ApiPropertyOptional({
        description: 'Request data sent to payment gateway',
        example: {},
    })
    @IsObject()
    @IsOptional()
    request_data?: Record<string, any>;

    @ApiPropertyOptional({
        description: 'Response data from payment gateway',
        example: {},
    })
    @IsObject()
    @IsOptional()
    response?: Record<string, any>;

    // ============ CARD DETAILS (For PayPal/Stripe) ============
    @ApiPropertyOptional({
        description: 'Card ID from card model',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsOptional()
    card_id?: string;

    @ApiPropertyOptional({
        description: 'Card number',
        example: '4111111111111111',
    })
    @IsString()
    @IsOptional()
    card_number?: string;

    @ApiPropertyOptional({
        description: 'Card expiry month',
        example: '12',
    })
    @IsString()
    @IsOptional()
    expiry_month?: string;

    @ApiPropertyOptional({
        description: 'Card expiry year',
        example: '2025',
    })
    @IsString()
    @IsOptional()
    expiry_year?: string;

    @ApiPropertyOptional({
        description: 'Card CVV',
        example: '123',
    })
    @IsString()
    @IsOptional()
    card_cvv?: string;

    @ApiPropertyOptional({
        description: 'Card holder name',
        example: 'John Doe',
    })
    @IsString()
    @IsOptional()
    holder_name?: string;

    @ApiPropertyOptional({
        description: 'Currency code',
        example: 'USD',
    })
    @IsString()
    @IsOptional()
    currency?: string;

    @ApiPropertyOptional({
        description: 'Redirect URL after payment',
        example: 'https://example.com/payment/success',
    })
    @IsString()
    @IsOptional()
    redirect_url?: string;

    @ApiPropertyOptional({
        description: 'Payment type',
        example: 'subscription',
    })
    @IsString()
    @IsOptional()
    type?: string;
}
