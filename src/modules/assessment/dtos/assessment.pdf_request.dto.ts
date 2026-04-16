import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RequestPDFAssessmentReportDto {
    @ApiProperty({
        description: 'Assessment Report ID',
        example: '507f1f77bcf86cd799439011',
        required: true,
    })
    @IsString()
    asessment_report_id: string;

    @ApiProperty({
        description: 'Assessment ID',
        example: '507f1f77bcf86cd799439011',
        required: true,
    })
    @IsOptional()
    @IsString()
    assessment_id: string;
}
