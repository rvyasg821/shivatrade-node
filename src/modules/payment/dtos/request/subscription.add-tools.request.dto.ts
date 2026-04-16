import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    ValidateNested,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SelectedToolDto } from '../../../subscription/dtos/request/subscription.create.request.dto';

export class CardDetailsDto {
    @ApiProperty({
        description: 'Card holder name',
        example: 'John Doe',
    })
    @IsString()
    @IsNotEmpty()
    holder_name: string;

    @ApiProperty({
        description: 'Card number',
        example: '4111111111111111',
    })
    @IsString()
    @IsNotEmpty()
    card_number: string;

    @ApiProperty({
        description: 'Card expiry month',
        example: '12',
    })
    @IsString()
    @IsNotEmpty()
    expiry_month: string;

    @ApiProperty({
        description: 'Card expiry year',
        example: '2025',
    })
    @IsString()
    @IsNotEmpty()
    expiry_year: string;

    @ApiProperty({
        description: 'Card CVV',
        example: '123',
    })
    @IsString()
    @IsNotEmpty()
    cvv: string;
}

export class PaymentMethodDto {
    @ApiProperty({
        description: 'Saved card ID (use this OR cardDetails)',
        example: '507f1f77bcf86cd799439011',
        required: false,
    })
    @IsString()
    @IsOptional()
    @ValidateIf((o) => !o.cardDetails)
    @IsNotEmpty({ message: 'Either cardId or cardDetails must be provided' })
    cardId?: string;

    @ApiProperty({
        description: 'New card details (use this OR cardId)',
        type: () => CardDetailsDto,
        required: false,
    })
    @ValidateNested()
    @Type(() => CardDetailsDto)
    @IsOptional()
    @ValidateIf((o) => !o.cardId)
    @IsNotEmpty({ message: 'Either cardId or cardDetails must be provided' })
    cardDetails?: CardDetailsDto;
}

export class SubscriptionAddToolsRequestDto {
    @ApiProperty({
        description: 'Subscription ID to update',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    subscriptionId: string;

    @ApiProperty({
        description: 'Tools to add to the subscription',
        type: () => [SelectedToolDto],
        example: [
            { _id: '507f1f77bcf86cd799439012', name: 'Advanced Analytics', price: 29.99 },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SelectedToolDto)
    @IsNotEmpty()
    tools: SelectedToolDto[];

    @ApiProperty({
        description: 'Payment method (saved card or new card details)',
        type: () => PaymentMethodDto,
    })
    @ValidateNested()
    @Type(() => PaymentMethodDto)
    @IsNotEmpty()
    payment: PaymentMethodDto;
}
