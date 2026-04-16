import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CompanyReactivateResponseDto {
    @ApiProperty({
        description: 'Company ID that was reactivated',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    readonly companyId: string;

    @ApiProperty({
        description: 'User ID of the company admin that was reactivated',
        example: '507f1f77bcf86cd799439012',
        required: false,
    })
    @IsString()
    readonly userId?: string;

    @ApiProperty({
        description: 'Success message describing the reactivation operation',
        example: 'Company and associated user have been reactivated successfully',
    })
    @IsString()
    readonly message: string;
}