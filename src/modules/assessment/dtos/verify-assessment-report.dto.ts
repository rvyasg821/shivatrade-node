import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class VerifyAssessmentReportDto {
    @ApiProperty({
        description: 'Assessment Report ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    _id: string;

    @ApiProperty({
        description: 'Email verification code',
        example: '123456',
    })
    @IsString()
    email_code: string;

    @ApiProperty({
        description: 'Mobile verification code (optional)',
        example: '654321',
        required: false,
    })
    @IsOptional()
    @IsString()
    mobile_code?: string;
}
