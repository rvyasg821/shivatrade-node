import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class BulkOrderItemDto {
    @ApiProperty({
        description: 'ID of the item',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    _id: string;

    @ApiProperty({
        description: 'New order value',
        example: 1,
    })
    @IsNumber()
    order: number;
}

export class BulkUpdateOrderDto {
    @ApiProperty({
        description: 'Array of items to update',
        type: [BulkOrderItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkOrderItemDto)
    bulkItems: BulkOrderItemDto[];

    @ApiProperty({
        description: 'Flag to indicate if updating question order',
        example: true,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    questionOrder?: boolean;

    @ApiProperty({
        description: 'Flag to indicate if updating section order',
        example: false,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    sectionOrder?: boolean;
}
