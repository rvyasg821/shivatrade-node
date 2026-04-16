import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsString, ValidateNested } from 'class-validator';

export class WidgetMetadataResponseDto {
    @ApiProperty({
        description: 'Widget slug identifier',
        example: 'siem-incident-trending',
    })
    @IsString()
    slug: string;

    @ApiProperty({
        description: 'Widget display name',
        example: 'SIEM Incident Trending',
    })
    @IsString()
    name: string;
}

export class WidgetItemResponseDto {
    @ApiProperty({
        description: 'Widget unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    _id: string;

    @ApiProperty({
        description: 'User ID who owns the widget',
        example: '507f1f77bcf86cd799439012',
    })
    @IsString()
    user_id: string;

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

    @ApiProperty({
        description: 'Widget active status',
        example: true,
    })
    @IsBoolean()
    status: boolean;

    @ApiProperty({
        description: 'Soft delete flag',
        example: false,
    })
    @IsBoolean()
    soft_delete: boolean;

    @ApiProperty({
        description: 'Widget creation date',
        example: '2024-01-01T00:00:00.000Z',
    })
    @IsString()
    createdAt: Date;

    @ApiProperty({
        description: 'Widget last update date',
        example: '2024-01-01T00:00:00.000Z',
    })
    @IsString()
    updatedAt: Date;
}

export class WidgetListResponseDto {
    @ApiProperty({
        description: 'List of user widgets',
        type: [WidgetItemResponseDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WidgetItemResponseDto)
    widgets: WidgetItemResponseDto[];

    @ApiProperty({
        description: 'Widget metadata for slug-name mappings',
        type: [WidgetMetadataResponseDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WidgetMetadataResponseDto)
    metadata: WidgetMetadataResponseDto[];

    @ApiProperty({
        description: 'Invisible Widget metadata for slug-name mappings',
        type: [WidgetMetadataResponseDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WidgetMetadataResponseDto)
    invisibleMetaData: WidgetMetadataResponseDto[];
}

export class WidgetUpdateResponseDto {
    @ApiProperty({
        description: 'Success message',
        example: 'Widgets updated successfully',
    })
    @IsString()
    message: string;

    @ApiProperty({
        description: 'Updated widgets list',
        type: [WidgetItemResponseDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WidgetItemResponseDto)
    widgets: WidgetItemResponseDto[];
}