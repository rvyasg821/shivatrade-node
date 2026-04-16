import { IsOptional, IsBoolean, IsNumber, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceSettingsRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    face_capture_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0.1)
    face_match_threshold?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    gps_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    geofence_radius_meters?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    geofence_lat?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    geofence_lng?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    auto_clock_out_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    auto_clock_out_time?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    break_tracking_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    overtime_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    overtime_threshold_hours?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    overtime_multiplier?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    late_threshold_minutes?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    early_leave_threshold_minutes?: number;
}
