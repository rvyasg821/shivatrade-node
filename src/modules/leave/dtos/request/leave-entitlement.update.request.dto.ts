import { IsOptional, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LeaveEntitlementUpdateRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    total_entitlement?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    additional?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    carried_over?: number;
}
