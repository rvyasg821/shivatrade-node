import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class SubscriptionDetailsDto {
    @ApiProperty({
        description: 'Subscription ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'Tools in the subscription',
        example: [
            { _id: '507f1f77bcf86cd799439012', name: 'Advanced Analytics', base_price: 9.99, calculated_price: 29.99, pricing_mode: 'multiplier' },
        ],
    })
    @Expose()
    tools: Array<{
        _id: string;
        name: string;
        slug?: string;
        base_price: number;
        pricing_mode: string;
        location_multiplier: number;
        calculated_price: number;
        is_mandatory?: boolean;
        display_order?: number;
    }>;

    @ApiProperty({
        description: 'Total price of all tools',
        example: 59.98,
    })
    @Expose()
    tools_price: number;

    @ApiProperty({
        description: 'Plan price',
        example: 49.99,
    })
    @Expose()
    plan_price: number;

    @ApiProperty({
        description: 'Subtotal (plan_price + tools_price)',
        example: 109.98,
    })
    @Expose()
    subtotal: number;

    @ApiProperty({
        description: 'Tax amount',
        example: 10.99,
    })
    @Expose()
    tax_price: number;

    @ApiProperty({
        description: 'Final price (subtotal + tax_price)',
        example: 120.97,
    })
    @Expose()
    final_price: number;
}

export class PaymentDetailsDto {
    @ApiProperty({
        description: 'Payment ID',
        example: '507f1f77bcf86cd799439014',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'PayPal charge ID',
        example: 'PAYID-123456',
    })
    @Expose()
    charge_id: string;

    @ApiProperty({
        description: 'Payment status',
        example: 'COMPLETED',
    })
    @Expose()
    status: string;

    @ApiProperty({
        description: 'Payment amount',
        example: 29.99,
    })
    @Expose()
    amount: number;

    @ApiProperty({
        description: 'Payment gateway',
        example: 'paypal',
    })
    @Expose()
    gateway: string;

    @ApiProperty({
        description: 'Payment method',
        example: 'card',
    })
    @Expose()
    method: string;
}

export class ProvisioningDetailsDto {
    @ApiProperty({
        description: 'Provisioning status',
        example: 'success',
        enum: ['success', 'partial', 'failed'],
    })
    @Expose()
    status: string;

    @ApiProperty({
        description: 'Number of tools provisioned',
        example: 1,
    })
    @Expose()
    toolsProvisioned: number;

    @ApiProperty({
        description: 'Provisioning errors (if any)',
        example: [],
        required: false,
    })
    @Expose()
    errors?: string[];
}

export class SubscriptionAddToolsResponseDto {
    @ApiProperty({
        description: 'Operation success status',
        example: true,
    })
    @Expose()
    success: boolean;

    @ApiProperty({
        description: 'Updated subscription details',
        type: () => SubscriptionDetailsDto,
    })
    @Expose()
    @Type(() => SubscriptionDetailsDto)
    subscription: SubscriptionDetailsDto;

    @ApiProperty({
        description: 'Payment details',
        type: () => PaymentDetailsDto,
    })
    @Expose()
    @Type(() => PaymentDetailsDto)
    payment: PaymentDetailsDto;

    @ApiProperty({
        description: 'Tool provisioning details',
        type: () => ProvisioningDetailsDto,
    })
    @Expose()
    @Type(() => ProvisioningDetailsDto)
    provisioning: ProvisioningDetailsDto;

    @ApiProperty({
        description: 'Success message',
        example: 'Tools added successfully to subscription',
    })
    @Expose()
    message: string;
}
