import { IsString, IsOptional, IsBoolean, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ENUM_IMMIGRATION_STATUS } from '../../enums/compliance.enum';

const EmptyToUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

export class ImmigrationCreateRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    visa_type?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    immigration_status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    brp_number?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    share_code?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    visa_start_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    visa_expiry_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    work_restriction?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_sponsored?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    cos_number?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    cos_start_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    cos_expiry_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    sponsor_license_number?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
