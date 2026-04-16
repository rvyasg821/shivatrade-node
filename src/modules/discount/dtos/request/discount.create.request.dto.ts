import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsEnum,
    IsNumber,
    IsOptional,
    IsDate,
    Min,
    Max,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_DISCOUNT_TYPE,
    ENUM_DURATION_TYPE,
    ENUM_LOCATION_RULE_TYPE,
} from '../../repository/entities/discount.entity';
import { ENUM_DISCOUNT_STATUS } from '@modules/discount/enums/discount.enum';

export class LocationRuleDto {
    @ApiProperty({
        description: 'Type of location rule',
        example: 'exact',
        enum: ENUM_LOCATION_RULE_TYPE,
        required: true,
    })
    @IsEnum(ENUM_LOCATION_RULE_TYPE)
    @IsNotEmpty()
    type: ENUM_LOCATION_RULE_TYPE;

    @ApiProperty({
        description: 'Value for exact/minimum/maximum rules',
        example: 5,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    value?: number;

    @ApiProperty({
        description: 'Minimum value for range rule',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    min?: number;

    @ApiProperty({
        description: 'Maximum value for range rule',
        example: 10,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    max?: number;
}

export class DiscountCreateRequestDto {
    @ApiProperty({
        description: 'Discount name',
        example: 'Summer Sale 2024',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Discount type (value or percentage)',
        example: 'percentage',
        enum: ENUM_DISCOUNT_TYPE,
        required: true,
    })
    @IsEnum(ENUM_DISCOUNT_TYPE)
    @IsNotEmpty()
    discount_type: ENUM_DISCOUNT_TYPE;

    @ApiProperty({
        description: 'Discount value (amount or percentage)',
        example: 20,
        required: true,
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    discount_value: number;

    @ApiProperty({
        description: 'Description of the discount',
        example: 'Get 20% off on all subscriptions',
        required: false,
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'Maximum number of times this discount can be used',
        example: 100,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    max_occurances?: number;

    @ApiProperty({
        description: 'Start date of the discount',
        example: '2024-01-01',
        required: false,
    })
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    start_date?: Date;

    @ApiProperty({
        description: 'End date of the discount',
        example: '2024-12-31',
        required: false,
    })
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    end_date?: Date;

    @ApiProperty({
        description: 'Status (0 = inactive, 1 = active)',
        example: 1,
        required: false,
        default: 1,
    })
    @IsNumber()
    @IsOptional()
    @IsEnum(ENUM_DISCOUNT_STATUS)
    status?: number;

    // ============ DURATION CONTROL ============
    @ApiProperty({
        description: 'Duration type for recurring subscriptions',
        example: 'forever',
        enum: ENUM_DURATION_TYPE,
        required: false,
        default: 'forever',
    })
    @IsEnum(ENUM_DURATION_TYPE)
    @IsOptional()
    duration_type?: ENUM_DURATION_TYPE;

    @ApiProperty({
        description: 'Number of months discount applies (only for limited_months type)',
        example: 6,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    duration_months?: number;

    // ============ LOCATION RULES ============
    @ApiProperty({
        description: 'Location rules for discount eligibility (empty = applies to all)',
        type: [LocationRuleDto],
        required: false,
        default: [],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => LocationRuleDto)
    location_rules?: LocationRuleDto[];
}
