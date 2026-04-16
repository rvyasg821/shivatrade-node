import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
    ENUM_DISCOUNT_TYPE,
    ENUM_DURATION_TYPE,
    ILocationRule,
} from '../../repository/entities/discount.entity';

export class DiscountGetResponseDto {
    @ApiProperty({
        description: 'Discount ID',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'Discount name',
        example: 'Summer Sale 2024',
    })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Discount type',
        example: 'percentage',
        enum: ENUM_DISCOUNT_TYPE,
    })
    @Expose()
    discount_type: ENUM_DISCOUNT_TYPE;

    @ApiProperty({
        description: 'Discount value',
        example: 20,
    })
    @Expose()
    discount_value: number;

    @ApiProperty({
        description: 'Discount code',
        example: 'SUMMER20',
    })
    @Expose()
    discount_code: string;

    @ApiProperty({
        description: 'Description',
        example: 'Get 20% off on all subscriptions',
    })
    @Expose()
    description?: string;

    @ApiProperty({
        description: 'Maximum occurrences',
        example: 100,
    })
    @Expose()
    max_occurances?: number;

    @ApiProperty({
        description: 'Start date',
        example: '2024-01-01T00:00:00.000Z',
    })
    @Expose()
    @Type(() => Date)
    start_date?: Date;

    @ApiProperty({
        description: 'End date',
        example: '2024-12-31T23:59:59.999Z',
    })
    @Expose()
    @Type(() => Date)
    end_date?: Date;

    @ApiProperty({
        description: 'Status',
        example: 1,
    })
    @Expose()
    status: number;

    @ApiProperty({
        description: 'Is expired',
        example: false,
    })
    @Expose()
    is_expired: boolean;

    // ============ DURATION CONTROL ============
    @ApiProperty({
        description: 'Duration type for recurring subscriptions',
        example: 'forever',
        enum: ENUM_DURATION_TYPE,
    })
    @Expose()
    duration_type: ENUM_DURATION_TYPE;

    @ApiProperty({
        description: 'Number of months discount applies (only for limited_months type)',
        example: 6,
    })
    @Expose()
    duration_months?: number;

    // ============ LOCATION RULES ============
    @ApiProperty({
        description: 'Location rules for discount eligibility',
        type: 'array',
    })
    @Expose()
    location_rules: ILocationRule[];

    @ApiProperty({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    @Expose()
    @Type(() => Date)
    createdAt: Date;

    @ApiProperty({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    @Expose()
    @Type(() => Date)
    updatedAt: Date;
}
