import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContractIssueRequestDto {
    @ApiProperty()
    @IsString()
    user_id: string;

    @ApiProperty()
    @IsString()
    template_id: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    effective_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    end_date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
