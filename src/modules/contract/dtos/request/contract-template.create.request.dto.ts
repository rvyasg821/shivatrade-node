import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContractTemplateCreateRequestDto {
    @ApiProperty()
    @IsString()
    @MaxLength(200)
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_default?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    requires_signature?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    version?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_system?: boolean;
}
