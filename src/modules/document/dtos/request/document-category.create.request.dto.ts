import { IsString, IsBoolean, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentCategoryCreateRequestDto {
    @ApiProperty({ example: 'Passport' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ default: false })
    @IsBoolean()
    @IsOptional()
    requires_expiry?: boolean;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
