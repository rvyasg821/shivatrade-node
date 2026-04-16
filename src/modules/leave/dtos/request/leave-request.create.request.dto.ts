import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_LEAVE_HALF_DAY } from '../../enums/leave.enum';

export class LeaveRequestCreateRequestDto {
    @ApiProperty()
    @IsString()
    leave_type_id: string;

    @ApiProperty({ example: '2026-03-01' })
    @IsString()
    start_date: string;

    @ApiProperty({ example: '2026-03-05' })
    @IsString()
    end_date: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_LEAVE_HALF_DAY))
    start_half?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_LEAVE_HALF_DAY))
    end_half?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;
}
