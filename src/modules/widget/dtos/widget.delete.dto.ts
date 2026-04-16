import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { WidgetItemResponseDto } from './widget.response.dto';

export class WidgetDeleteResponseDto {
    @ApiProperty({
        description: 'Success message',
        example: 'Widget deleted successfully',
    })
    @IsString()
    message: string;

    @ApiProperty({
        description: 'Deleted widget ID',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    widgetId: string;
}

export class WidgetRestoreResponseDto {
    @ApiProperty({
        description: 'Success message',
        example: 'Widget restored successfully',
    })
    @IsString()
    message: string;

    @ApiProperty({
        description: 'Restored widget',
        type: WidgetItemResponseDto,
    })
    widget: WidgetItemResponseDto; // Will be WidgetItemResponseDto but avoiding circular import
}