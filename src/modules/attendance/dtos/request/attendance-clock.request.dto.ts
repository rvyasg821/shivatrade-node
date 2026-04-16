import { IsOptional, IsObject, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_ATTENDANCE_SOURCE } from '../../enums/attendance.enum';

export class AttendanceClockRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    gps?: { lat: number; lng: number };

    @ApiPropertyOptional()
    @IsOptional()
    faceDescriptor?: any;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    shiftStartTime?: string; // HH:MM

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    shiftEndTime?: string; // HH:MM

    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(Object.values(ENUM_ATTENDANCE_SOURCE))
    source?: string;
}
