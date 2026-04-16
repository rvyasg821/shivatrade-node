import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WidgetGetRequestDto {
    @ApiPropertyOptional({
        description: 'Filter widgets by tool slug',
        example: 'wazuh',
    })
    @IsOptional()
    @IsString()
    tool_slug?: string;
}