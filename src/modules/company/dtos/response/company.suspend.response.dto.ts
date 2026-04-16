import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CompanySuspendResponseDto {
    @ApiProperty({
        description: 'Company ID that was suspended',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    readonly companyId: string;

    @ApiProperty({
        description: 'User ID of the company admin that was suspended',
        example: '507f1f77bcf86cd799439012',
        required: false,
    })
    @IsOptional()
    @IsString()
    readonly userId?: string;

    @ApiProperty({
        description: 'Subscription ID that was deactivated',
        example: '507f1f77bcf86cd799439013',
        required: false,
    })
    @IsOptional()
    @IsString()
    readonly subscriptionId?: string;

    @ApiProperty({
        description: 'Number of tenant users that were updated to inactive status',
        example: 5,
    })
    @IsNumber()
    @Type(() => Number)
    readonly tenantUsersUpdated: number;

    @ApiProperty({
        description: 'Success message describing the suspension operation',
        example: 'Company admin and associated resources have been suspended successfully',
    })
    @IsString()
    readonly message: string;
}