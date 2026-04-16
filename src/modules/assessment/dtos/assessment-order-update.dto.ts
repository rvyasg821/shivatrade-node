import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator';

export class AssessmentOrderItemDto {
    @ApiProperty({
        description: 'ID of the Assessment',
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

export class AssessmentOrderUpdateDto {
    @ApiProperty({
        description: 'Array of Assessment with their new order values',
        type: [AssessmentOrderItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AssessmentOrderItemDto)
    sections: AssessmentOrderItemDto[];
}