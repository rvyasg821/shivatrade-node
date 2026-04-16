import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CardListResponseDto {
    @ApiProperty({
        description: 'Card unique identifier',
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
        description: 'Payment gateway',
        example: 'paypal',
    })
    @Expose()
    gateway: string;

    @ApiProperty({
        description: 'Card holder name',
        example: 'John Doe',
    })
    @Expose()
    holder_name: string;

    @ApiProperty({
        description: 'Last 4 digits of card number',
        example: '1111',
    })
    @Expose()
    last4: string;

    @ApiProperty({
        description: 'Expiry month',
        example: '12',
    })
    @Expose()
    expiry_month: string;

    @ApiProperty({
        description: 'Expiry year',
        example: '2025',
    })
    @Expose()
    expiry_year: string;

    @ApiProperty({
        description: 'Is default card',
        example: true,
    })
    @Expose()
    is_default: boolean;

    @ApiProperty({
        description: 'Card status',
        example: true,
    })
    @Expose()
    status: boolean;

    @ApiProperty({
        description: 'Card creation timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    createdAt: Date;

    @ApiProperty({
        description: 'Card last update timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    updatedAt: Date;

    @Exclude()
    token_id: string;

    @Exclude()
    card_id: string;

    @Exclude()
    card_number: string;

    @Exclude()
    response: Record<string, any>;

    @Exclude()
    soft_delete: boolean;
}