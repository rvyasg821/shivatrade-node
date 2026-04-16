import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsObject,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CardCreateRequestDto {
    @ApiProperty({
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    user_id: string;

    @ApiProperty({
        description: 'Payment gateway',
        example: 'paypal',
    })
    @IsString()
    @IsNotEmpty()
    gateway: string;

    @ApiProperty({
        description: 'Token ID from payment gateway',
        example: 'tok_1234567890',
        required: false,
    })
    @IsString()
    @IsOptional()
    token_id?: string;

    @ApiProperty({
        description: 'Card ID from payment gateway',
        example: 'card_1234567890',
        required: false,
    })
    @IsString()
    @IsOptional()
    card_id?: string;

    @ApiProperty({
        description: 'Card holder name',
        example: 'John Doe',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    holder_name: string;

    @ApiProperty({
        description: 'Full card number (will be masked)',
        example: '4111111111111111',
        required: false,
    })
    @IsString()
    @IsOptional()
    card_number?: string;

    @ApiProperty({
        description: 'Last 4 digits of card number',
        example: '1111',
    })
    @IsString()
    @IsNotEmpty()
    last4: string;

    @ApiProperty({
        description: 'Expiry month',
        example: '12',
    })
    @IsString()
    @IsNotEmpty()
    expiry_month: string;

    @ApiProperty({
        description: 'Expiry year',
        example: '2025',
    })
    @IsString()
    @IsNotEmpty()
    expiry_year: string;

    @ApiProperty({
        description: 'Gateway response data',
        example: {},
        required: false,
    })
    @IsObject()
    @IsOptional()
    response?: Record<string, any>;

    @ApiProperty({
        description: 'Set as default card',
        example: false,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;

    @ApiProperty({
        description: 'Card status',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    status?: boolean = true;
}