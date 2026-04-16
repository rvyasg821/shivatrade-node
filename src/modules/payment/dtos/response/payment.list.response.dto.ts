import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ENUM_PAYMENT_GATEWAY, ENUM_PAYMENT_METHOD, ENUM_PAYMENT_STATUS } from '../../repository/entities/payment.entity';

// Simple DTOs for nested user and plan information in payment responses
export class PaymentUserInfoDto {
    @ApiProperty({
        description: 'User unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'User full name',
        example: 'John Doe',
    })
    @Expose()
    name?: string;

    @ApiProperty({
        description: 'User email address',
        example: 'john.doe@example.com',
    })
    @Expose()
    email: string;

    @ApiProperty({
        description: 'User status',
        example: 'ACTIVE',
    })
    @Expose()
    status: string;
}

export class PaymentPlanInfoDto {
    @ApiProperty({
        description: 'Plan unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'Plan name',
        example: 'Premium Plan',
    })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Plan price',
        example: 29.99,
    })
    @Expose()
    price: number;

    @ApiProperty({
        description: 'Plan status',
        example: 'ACTIVE',
    })
    @Expose()
    status: string;

    @ApiProperty({
        description: 'Plan duration type',
        example: 'MONTHLY',
    })
    @Expose()
    duration_type: string;
}

export class PaymentListResponseDto {
    @ApiProperty({
        description: 'Payment unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'User information',
        type: PaymentUserInfoDto,
    })
    @Expose()
    @Type(() => PaymentUserInfoDto)
    user: PaymentUserInfoDto;

    @ApiProperty({
        description: 'Company ID or populated company object',
    })
    @Expose()
    company_id: any;

    @ApiProperty({
        description: 'Plan information',
        type: PaymentPlanInfoDto,
    })
    @Expose()
    @Type(() => PaymentPlanInfoDto)
    plan?: PaymentPlanInfoDto;

    @ApiProperty({
        description: 'Subscription ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    subscription_id?: string;

    @ApiProperty({
        description: 'Charge ID from payment gateway',
        example: 'ch_1234567890',
    })
    @Expose()
    charge_id?: string;

    @ApiProperty({
        description: 'Request ID for tracking',
        example: 'req_1234567890',
    })
    @Expose()
    request_id?: string;

    @Expose()
    locations?: number;

    @Expose()
    plan_price?: number;

    @Expose()
    tools_price?: number;

    @Expose()
    subtotal?: number;

    @Expose()
    tax_rate?: number;

    @Expose()
    tax_price?: number;

    @ApiProperty({
        description: 'Base price',
        example: 29.99,
    })
    @Expose()
    price: number;

    @ApiProperty({
        description: 'Special price',
        example: 19.99,
    })
    @Expose()
    special_price?: number;

    @ApiProperty({
        description: 'Special price duration',
        example: 3,
    })
    @Expose()
    special_price_duration?: number;

    @ApiProperty({
        description: 'Remaining special price duration',
        example: 2,
    })
    @Expose()
    special_price_duration_remaining?: number;

    @ApiProperty({
        description: 'Final price after discounts',
        example: 19.99,
    })
    @Expose()
    final_price: number;

    @ApiProperty({
        description: 'Tax amount',
        example: 2.99,
    })
    @Expose()
    tax_value?: number;

    @ApiProperty({
        description: 'Total amount',
        example: 32.98,
    })
    @Expose()
    total: number;

    @ApiProperty({
        description: 'Invoice number',
        example: 1001,
    })
    @Expose()
    inv_number?: number;

    @ApiProperty({
        description: 'Full invoice number',
        example: 'INV-2023-1001',
    })
    @Expose()
    full_inv_number?: string;

    @ApiProperty({
        description: 'Payment gateway',
        enum: ENUM_PAYMENT_GATEWAY,
        example: ENUM_PAYMENT_GATEWAY.PAYPAL,
    })
    @Expose()
    gateway: ENUM_PAYMENT_GATEWAY;

    @ApiProperty({
        description: 'Payment method',
        enum: ENUM_PAYMENT_METHOD,
        example: ENUM_PAYMENT_METHOD.CARD,
    })
    @Expose()
    method: ENUM_PAYMENT_METHOD;

    @ApiProperty({
        description: 'Payment status',
        example: true,
    })
    @Expose()
    paid: boolean;

    @ApiProperty({
        description: 'Post date time string',
        example: '2023-10-10 10:00 AM',
    })
    @Expose()
    postDateTime?: string;

    @ApiProperty({
        description: 'Is trial payment',
        example: false,
    })
    @Expose()
    trial?: boolean;

    @ApiProperty({
        description: 'Payment status',
        enum: ENUM_PAYMENT_STATUS,
        example: ENUM_PAYMENT_STATUS.COMPLETED,
    })
    @Expose()
    status: ENUM_PAYMENT_STATUS;

    @ApiProperty({
        description: 'Tools included in subscription',
        example: ['tool1', 'tool2'],
    })
    @Expose()
    tools?: string[];

    @ApiProperty({
        description: 'Discount amount applied',
        example: 10.00,
        required: false,
    })
    @Expose()
    discount_price?: number;

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
        description: 'Discount name for display',
        example: 'Summer Sale',
        required: false,
    })
    @Expose()
    discount_name?: string;

    @ApiProperty({
        description: 'Discount duration type',
        example: 'limited_months',
        enum: ['forever', 'first_payment', 'limited_months'],
        required: false,
    })
    @Expose()
    discount_duration_type?: string;

    @ApiProperty({
        description: 'Total months for limited_months discount type',
        example: 6,
        required: false,
    })
    @Expose()
    discount_duration_months?: number;

    @ApiProperty({
        description: 'Remaining discount months at time of payment',
        example: 3,
        required: false,
    })
    @Expose()
    discount_remaining_months?: number;

    @ApiProperty({
        description: 'Payment creation timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    createdAt: Date;

    @ApiProperty({
        description: 'Payment last update timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    updatedAt: Date;

    @Exclude()
    request_data: Record<string, any>;

    @Exclude()
    response: Record<string, any>;

    @Expose()
    inv_path: string;

    @Exclude()
    soft_delete: boolean;
}