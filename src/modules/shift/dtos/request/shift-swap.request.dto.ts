import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShiftSwapRequestCreateDto {
    @ApiProperty()
    @IsString()
    requester_assignment_id: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    target_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    target_assignment_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    reason?: string;
}

export class ShiftSwapRespondDto {
    @ApiProperty()
    @IsBoolean()
    accept: boolean;
}

export class ShiftSwapAdminDecideDto {
    @ApiProperty()
    @IsBoolean()
    approve: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
