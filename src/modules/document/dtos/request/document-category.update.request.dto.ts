import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentCategoryUpdateRequestDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    requires_expiry?: boolean;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
