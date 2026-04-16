import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscriptionTrialRequestDto {
    @ApiProperty({
        description: 'Plan ID for trial subscription',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    plan_id: string;

    @ApiProperty({
        description: 'Trial duration in days',
        example: 7,
        minimum: 1,
        maximum: 30,
        required: false,
    })
    @IsNumber()
    @Min(1)
    @Max(30)
    @IsOptional()
    @Transform(({ value }) => value ?? 7)
    trial_days?: number;
}

export class SubscriptionConvertTrialRequestDto {
    @ApiProperty({
        description: 'Platform price',
        example: 10.00,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    platform_price: number;

    @ApiProperty({
        description: 'Tools price',
        example: 29.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    tools_price: number;

    @ApiProperty({
        description: 'Total price',
        example: 39.99,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    total_price: number;

    @ApiProperty({
        description: 'Whether the subscription is recurring',
        example: true,
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => value ?? true)
    recurring?: boolean;

    @ApiPropertyOptional({
        description: 'Selected tools for the subscription',
        example: [
            {
                _id: '507f1f77bcf86cd799439011',
                name: 'Wazuh',
                price: 9.99
            }
        ],
        default: [],
    })
    @IsOptional()
    @Transform(({ value }) => value ?? [])
    tools?: any[];
}