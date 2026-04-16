import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserShortResponseDto } from '@modules/user/dtos/response/user.short.response.dto';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { CompanyShortResponseDto } from '@modules/company/dtos/response/company.short.response.dto';

export class SelectedToolResponseDto {
    @ApiProperty({
        description: 'Tool unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'Tool name',
        example: 'Wazuh',
    })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Tool slug',
        example: 'wazuh',
        required: false,
    })
    @Expose()
    slug?: string;

    @ApiProperty({
        description: 'Tool price (calculated price)',
        example: 9.99,
    })
    @Expose()
    price: number;

    @ApiProperty({
        description: 'Base price from plan (original price)',
        example: 9.99,
        required: false,
    })
    @Expose()
    base_price?: number;

    @ApiProperty({
        description: 'Calculated price (after applying pricing mode)',
        example: 29.97,
        required: false,
    })
    @Expose()
    calculated_price?: number;

    @ApiProperty({
        description: 'Pricing mode (fixed or multiplier)',
        example: 'fixed',
        enum: ['fixed', 'multiplier'],
        required: false,
    })
    @Expose()
    pricing_mode?: string;

    @ApiProperty({
        description: 'Location multiplier for multiplier pricing mode',
        example: 1.0,
        required: false,
    })
    @Expose()
    location_multiplier?: number;

    @ApiProperty({
        description: 'Whether this tool is mandatory for the subscription',
        example: false,
        required: false,
    })
    @Expose()
    is_mandatory?: boolean;

    @ApiProperty({
        description: 'Display order',
        example: 1,
        required: false,
    })
    @Expose()
    display_order?: number;
}

export class SubscriptionListResponseDto {
    @ApiProperty({
        description: 'Subscription unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    user_id: string;

    @ApiProperty({
        description: 'Company ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    company_id: string;

    @ApiProperty({
        description: 'Plan ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    plan_id: string;

    @ApiProperty({
        description: 'Plan type',
        example: 'MONTHLY',
    })
    @Expose()
    plan_type: string;

    @ApiProperty({
        description: 'Plan type value',
        example: 1,
    })
    @Expose()
    plan_type_value: number;

    @ApiProperty({
        description: 'Platform price',
        example: 10.00,
    })
    @Expose()
    platform_price: number;

    @ApiProperty({
        description: 'Tools price',
        example: 29.99,
    })
    @Expose()
    tools_price: number;

    @ApiProperty({
        description: 'Total price (subtotal without tax)',
        example: 39.99,
    })
    @Expose()
    total_price: number;

    @ApiProperty({
        description: 'Final price (total including tax and other charges)',
        example: 43.98,
    })
    @Expose()
    final_price: number;

    @ApiProperty({
        description: 'Tax value',
        example: 3.99,
    })
    @Expose()
    tax_value?: number;

    @ApiProperty({
        description: 'Whether the subscription is recurring',
        example: true,
    })
    @Expose()
    recurring: boolean;

    @ApiProperty({
        description: 'Subscription start date',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    start_date: Date;

    @ApiProperty({
        description: 'Next billing date',
        example: '2023-11-10T10:00:00.000Z',
    })
    @Expose()
    next_date: Date;

    @ApiProperty({
        description: 'Subscription end date',
        example: '2024-10-10T10:00:00.000Z',
    })
    @Expose()
    end_date: Date;

    @ApiProperty({
        description: 'Whether the subscription is on hold',
        example: false,
    })
    @Expose()
    hold: boolean;

    @ApiProperty({
        description: 'Whether this is a trial subscription',
        example: false,
    })
    @Expose()
    trial: boolean;

    @ApiProperty({
        description: 'Whether this is the default subscription',
        example: false,
    })
    @Expose()
    is_default: boolean;

    @ApiProperty({
        description: 'Subscription status',
        example: true,
    })
    @Expose()
    status: boolean;

    @ApiProperty({
        description: 'Whether this is a lifetime subscription',
        example: false,
    })
    @Expose()
    is_lifetime: boolean;

    @ApiProperty({
        description: 'Selected tools for the subscription',
        type: [SelectedToolResponseDto],
    })
    @Expose()
    @Type(() => SelectedToolResponseDto)
    tools: SelectedToolResponseDto[];

    @ApiProperty({
        description: 'User information',
        type: UserShortResponseDto,
    })
    @Expose()
    @Type(() => UserShortResponseDto)
    user: UserShortResponseDto;

    @ApiProperty({
        description: 'Plan information',
        type: PlanListResponseDto,
    })
    @Expose()
    @Type(() => PlanListResponseDto)
    plan: PlanListResponseDto;

    @ApiProperty({
        description: 'Company information',
        type: CompanyShortResponseDto,
    })
    @Expose()
    @Type(() => CompanyShortResponseDto)
    company: CompanyShortResponseDto;

    @ApiProperty({
        description: 'Subscription creation timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    createdAt: Date;

    @ApiProperty({
        description: 'Subscription last update timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    updatedAt: Date;

    @ApiProperty({
        description: 'Tool provisioning status',
        example: 'provisioned',
        enum: ['pending', 'provisioning', 'provisioned', 'failed'],
    })
    @Expose()
    provisioningStatus: string;

    @ApiProperty({
        description: 'Timestamp when tools were provisioned',
        example: '2023-10-10T10:00:00.000Z',
        required: false,
    })
    @Expose()
    provisionedAt: Date;

    @ApiProperty({
        description: 'Error message if provisioning failed',
        example: 'Failed to connect to tenant database',
        required: false,
    })
    @Expose()
    provisioningError: string;

    @ApiProperty({
        description: 'Discount ID if a discount was applied',
        example: '507f1f77bcf86cd799439011',
        required: false,
    })
    @Expose()
    discount_id?: string;

    @ApiProperty({
        description: 'Discount code that was applied',
        example: 'SAVE20',
        required: false,
    })
    @Expose()
    discount_code?: string;

    @ApiProperty({
        description: 'Amount discounted from the total price',
        example: 10.00,
        required: false,
    })
    @Expose()
    discount_price?: number;

    @ApiProperty({
        description: 'Discount type (percentage or fixed)',
        example: 'percentage',
        required: false,
    })
    @Expose()
    discount_type?: string;

    @ApiProperty({
        description: 'Discount value (percentage or fixed amount)',
        example: 20,
        required: false,
    })
    @Expose()
    discount_value?: number;

    @ApiProperty({
        description: 'Discount duration type',
        example: 'forever',
        enum: ['forever', 'first_payment', 'limited_months'],
        required: false,
    })
    @Expose()
    discount_duration_type?: string;

    @ApiProperty({
        description: 'Total discount duration in months (for limited_months type)',
        example: 6,
        required: false,
    })
    @Expose()
    discount_duration_months?: number;

    @ApiProperty({
        description: 'Remaining discount months (for limited_months type)',
        example: 4,
        required: false,
    })
    @Expose()
    discount_remaining_months?: number;

    @ApiProperty({
        description: 'Discount name for display',
        example: 'Summer Sale Discount',
        required: false,
    })
    @Expose()
    discount_name?: string;

    @ApiProperty({
        description: 'Discount location rules',
        example: [{ type: 'minimum', value: 3 }],
        required: false,
    })
    @Expose()
    discount_location_rules?: Array<{
        type: string;
        value?: number;
        min?: number;
        max?: number;
    }>;

    @ApiProperty({
        description: 'Number of locations',
        example: 3,
        required: false,
    })
    @Expose()
    locations?: number;

    @ApiProperty({
        description: 'Plan price for selected locations',
        example: 49.99,
        required: false,
    })
    @Expose()
    plan_price?: number;

    @ApiProperty({
        description: 'Subtotal (plan_price + tools_price)',
        example: 79.98,
        required: false,
    })
    @Expose()
    subtotal?: number;

    @ApiProperty({
        description: 'Total after discount (subtotal - discount_price)',
        example: 63.99,
        required: false,
    })
    @Expose()
    total?: number;

    @ApiProperty({
        description: 'Tax rate percentage',
        example: 10,
        required: false,
    })
    @Expose()
    tax_rate?: number;

    @ApiProperty({
        description: 'Calculated tax amount',
        example: 6.40,
        required: false,
    })
    @Expose()
    tax_price?: number;

    @ApiProperty({
        description: 'Tax information from environment',
        example: { label: 'VAT', value: 10 },
        required: false,
    })
    @Expose()
    tax_info?: {
        label?: string;
        value?: number;
    };

    @Exclude()
    soft_delete: boolean;

    @Exclude()
    cancelledAt: Date;
}