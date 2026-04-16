import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { DiscountGetResponseDto } from './discount.get.response.dto';

export class DiscountApplyResponseDto {
    @ApiProperty({
        description: 'Success flag',
        example: true,
    })
    @Expose()
    flag: boolean;

    @ApiProperty({
        description: 'Message',
        example: 'Discount code applied successfully',
    })
    @Expose()
    message: string;

    @ApiProperty({
        description: 'Discount details',
        type: () => DiscountGetResponseDto,
    })
    @Expose()
    @Type(() => DiscountGetResponseDto)
    data?: DiscountGetResponseDto;

    @ApiProperty({
        description: 'Total price before discount',
        example: 99.99,
    })
    @Expose()
    total_price: number;

    @ApiProperty({
        description: 'Discount amount',
        example: 19.99,
    })
    @Expose()
    discounted_price: number;

    @ApiProperty({
        description: 'Final price after discount',
        example: 80.00,
    })
    @Expose()
    price: number;

    @ApiProperty({
        description: 'Is code valid',
        example: true,
    })
    @Expose()
    is_code_valid: boolean;

    @ApiProperty({
        description: 'Is code applied',
        example: true,
    })
    @Expose()
    is_code_applied: boolean;

    @ApiProperty({
        description: 'Is max occurrences reached',
        example: false,
    })
    @Expose()
    is_max_occurred: boolean;

    @ApiProperty({
        description: 'Is code expired',
        example: false,
    })
    @Expose()
    is_expired: boolean;

    @ApiProperty({
        description: 'Is code invalid',
        example: false,
    })
    @Expose()
    is_invalid: boolean;

    @ApiProperty({
        description: 'Start date',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    @Expose()
    @Type(() => Date)
    start_date?: Date;

    @ApiProperty({
        description: 'End date',
        example: '2024-12-31T23:59:59.999Z',
        required: false,
    })
    @Expose()
    @Type(() => Date)
    end_date?: Date;
}
