import { IsOptional, IsBoolean, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_PROBATION_ENTITLEMENT_METHOD } from '../../enums/leave.enum';

export class LeavePolicyUpdateRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(12)
    leave_year_start_month?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    include_bank_holidays?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    bradford_factor_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    bradford_factor_threshold?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    auto_approve_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    toil_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    default_annual_entitlement?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_PROBATION_ENTITLEMENT_METHOD))
    probation_entitlement_method?: string;
}
