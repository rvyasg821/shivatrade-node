import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

export class WidgetUpdateItemDto {
    @ApiProperty({
        description: 'Widget unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    _id: string;

    @ApiProperty({
        description: 'Widget display order',
        example: 1,
        minimum: 1,
        maximum: 100,
        required: false,
    })
    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    @Max(100)
    order: number;

    @ApiProperty({
        description: 'Widget visibility status',
        example: true,
        required: false,
    })
    @IsNotEmpty()
    @IsBoolean()
    is_visible: boolean;
}

export class WidgetUpdateRequestDto {
    @ApiProperty({
        description: 'Array of widgets to update',
        type: [WidgetUpdateItemDto],
        example: [
            {
                _id: '507f1f77bcf86cd799439011',
                order: 1,
                is_visible: true,
            },
            {
                _id: '507f1f77bcf86cd799439012',
                order: 2,
                is_visible: false,
            },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WidgetUpdateItemDto)
    widgets: WidgetUpdateItemDto[];
}
