import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { WidgetItemResponseDto } from './widget.response.dto';

export class WidgetCreateRequestDto {
    @ApiProperty({
        description: 'Widget slug identifier',
        example: 'siem-incident-trending',
    })
    @IsString()
    slug: string;

    @ApiProperty({
        description: 'Widget display order',
        example: 1,
        minimum: 1,
        maximum: 100,
    })
    @IsNumber()
    @Min(1)
    @Max(100)
    order: number;

    @ApiProperty({
        description: 'Widget visibility status',
        example: true,
    })
    @IsBoolean()
    is_visible: boolean;

    @ApiProperty({
        description: 'Associated tool slug',
        example: 'wazuh',
    })
    @IsString()
    tool_slug: string;

    @ApiPropertyOptional({
        description: 'Widget active status',
        example: true,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    status?: boolean;
}

export class WidgetCreateResponseDto {
    @ApiProperty({
        description: 'Success message',
        example: 'Widget created successfully',
    })
    @IsString()
    message: string;

    @ApiProperty({
        description: 'Created widget',
        type: WidgetItemResponseDto,
    })
    widget: WidgetItemResponseDto; // Will be WidgetItemResponseDto but avoiding circular import
}