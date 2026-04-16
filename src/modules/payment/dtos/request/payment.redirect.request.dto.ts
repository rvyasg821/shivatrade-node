import {
    IsString,
    IsNotEmpty,
    IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaymentRedirectRequestDto {
    @ApiProperty({
        description: 'Request ID for tracking payment',
        example: 'req_1234567890',
    })
    @IsString()
    @IsNotEmpty()
    request_id: string;

    @ApiProperty({
        description: 'Payment state',
        example: 'paypal',
    })
    @IsString()
    @IsNotEmpty()
    state: string;

    @ApiProperty({
        description: 'Action taken (success/cancel)',
        example: 'success',
    })
    @IsString()
    @IsNotEmpty()
    action: string;

    @ApiProperty({
        description: 'Subscription ID (optional)',
        example: '507f1f77bcf86cd799439011',
        required: false,
    })
    @IsString()
    @IsOptional()
    subscription_id?: string;
}