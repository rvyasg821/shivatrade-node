import { IsString, IsOptional, IsBoolean, IsDateString, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ENUM_RTW_CHECK_TYPE, ENUM_RTW_CHECK_RESULT } from '../../enums/compliance.enum';

export class RtwCheckCreateRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    immigration_record_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_RTW_CHECK_TYPE))
    check_type?: string;

    @ApiProperty({ example: '2026-02-24' })
    @IsOptional()
    @Transform(({ value }) => (value === '' ? undefined : value))
    @IsDateString()
    check_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_RTW_CHECK_RESULT))
    result?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => (value === '' ? undefined : value))
    @IsDateString()
    valid_from?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => (value === '' ? undefined : value))
    @IsDateString()
    valid_until?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    document_ids?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    share_code_used?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    employer_checking_reference?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    follow_up_required?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => (value === '' ? undefined : value))
    @IsDateString()
    follow_up_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
