import { IsString, IsOptional, IsBoolean, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_COMPLIANCE_EVENT_TYPE } from '../../enums/compliance.enum';

export class ComplianceEventCreateRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiProperty()
    @IsIn(Object.values(ENUM_COMPLIANCE_EVENT_TYPE))
    event_type: string;

    @ApiProperty({ example: '2026-02-24' })
    @IsDateString()
    event_date: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    reporting_deadline?: string;
}

export class ComplianceEventReportRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    reference_number?: string;
}
