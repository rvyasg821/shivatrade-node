import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsDate,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DiscountApplyRequestDto {
    @ApiProperty({
        description: 'Discount code to apply',
        example: 'SUMMER20',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    discount_code: string;

    @ApiProperty({
        description: 'Total amount before discount',
        example: 99.99,
        required: true,
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    amount: number;

    @ApiProperty({
        description: 'Company ID',
        example: '507f1f77bcf86cd799439011',
        required: false,
    })
    @IsString()
    @IsOptional()
    company_id?: string;

    @ApiProperty({
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
        required: false,
    })
    @IsString()
    @IsOptional()
    user_id?: string;

    @ApiProperty({
        description: 'Date to check discount validity',
        example: '2024-06-15',
        required: false,
    })
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    date?: Date;
}
