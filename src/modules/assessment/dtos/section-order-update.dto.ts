import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator';

export class SectionOrderItemDto {
    @ApiProperty({
        description: 'ID of the section',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    sectionId: string;

    @ApiProperty({
        description: 'New order value',
        example: 1,
    })
    @IsNumber()
    order: number;
}

export class SectionOrderUpdateDto {
    @ApiProperty({
        description: 'Array of sections with their new order values',
        type: [SectionOrderItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SectionOrderItemDto)
    sections: SectionOrderItemDto[];
}