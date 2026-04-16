import { IsString, IsOptional, IsArray, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShiftAssignmentCreateRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiProperty({ example: '2026-03-01' })
    @IsDateString()
    date: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    shift_template_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;

    @ApiPropertyOptional({ example: '08:00' })
    @IsOptional()
    @IsString()
    start_time?: string;

    @ApiPropertyOptional({ example: '16:00' })
    @IsOptional()
    @IsString()
    end_time?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class ShiftBulkAssignRequestDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    user_ids: string[];

    @ApiProperty({ description: 'ISO Monday date to start week' })
    @IsDateString()
    monday: string;

    @ApiProperty()
    @IsString()
    shift_template_id: string;

    @ApiPropertyOptional({ type: [Number], description: 'Day indices 0=Mon..6=Sun, default [0,1,2,3,4]' })
    @IsOptional()
    @IsArray()
    include_days?: number[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;

    @ApiPropertyOptional({ type: [String], description: 'ISO date strings to exclude (e.g. holidays)' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    exclude_dates?: string[];
}

export class ShiftPublishRequestDto {
    @ApiProperty({ example: '2026-03-02' })
    @IsDateString()
    start_date: string;

    @ApiProperty({ example: '2026-03-08' })
    @IsDateString()
    end_date: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;
}

export class ShiftCopyWeekRequestDto {
    @ApiProperty({ description: 'ISO Monday of source week' })
    @IsDateString()
    source_monday: string;

    @ApiProperty({ description: 'ISO Monday of target week' })
    @IsDateString()
    target_monday: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_id?: string;

    @ApiPropertyOptional({ type: [String], description: 'ISO date strings to exclude (e.g. holidays)' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    exclude_dates?: string[];
}
