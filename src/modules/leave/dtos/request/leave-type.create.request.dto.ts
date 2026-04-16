import { IsString, IsOptional, IsBoolean, IsNumber, IsIn, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_LEAVE_ACCRUAL_METHOD } from '../../enums/leave.enum';

export class LeaveTypeCreateRequestDto {
    @ApiProperty()
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    slug?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_paid?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    requires_approval?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    max_days_per_year?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    carry_over_allowed?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    max_carry_over_days?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_LEAVE_ACCRUAL_METHOD))
    accrual_method?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    notice_days?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    documentation_required?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    documentation_after_days?: number;
}
