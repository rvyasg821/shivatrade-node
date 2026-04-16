import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_ATTENDANCE_STATUS } from '../../enums/attendance.enum';

export class AttendanceManualRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiProperty({ example: '2026-03-01' })
    @IsDateString()
    date: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    clock_in?: string; // ISO datetime

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    clock_out?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_ATTENDANCE_STATUS))
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
