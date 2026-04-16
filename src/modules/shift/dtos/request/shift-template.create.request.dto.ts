import { IsString, IsOptional, IsInt, IsBoolean, IsUUID, MaxLength, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShiftTemplateCreateRequestDto {
    @ApiProperty({ example: 'Morning Shift' })
    @IsString()
    @MaxLength(200)
    name: string;

    @ApiProperty({ example: 'AM' })
    @IsString()
    @MaxLength(20)
    code: string;

    @ApiProperty({ example: '08:00' })
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'start_time must be HH:MM' })
    start_time: string;

    @ApiProperty({ example: '16:00' })
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'end_time must be HH:MM' })
    end_time: string;

    @ApiPropertyOptional({ example: 30 })
    @IsOptional()
    @IsInt()
    @Min(0)
    break_minutes?: number;

    @ApiPropertyOptional({ example: '#3b82f6' })
    @IsOptional()
    @IsString()
    @MaxLength(7)
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_overnight?: boolean;

    @ApiPropertyOptional({ description: 'Location ID (null = company-wide)', example: 'uuid' })
    @IsOptional()
    @IsUUID()
    location_id?: string;
}

export class ShiftTemplateUpdateRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'start_time must be HH:MM' })
    start_time?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'end_time must be HH:MM' })
    end_time?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    break_minutes?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_overnight?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
