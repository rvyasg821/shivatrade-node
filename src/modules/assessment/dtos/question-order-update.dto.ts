import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator';

export class QuestionOrderItemDto {
    @ApiProperty({
        description: 'ID of the question',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    questionId: string;

    @ApiProperty({
        description: 'New order value',
        example: 1,
    })
    @IsNumber()
    order: number;
}

export class QuestionOrderUpdateDto {
    @ApiProperty({
        description: 'Array of questions with their new order values',
        type: [QuestionOrderItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionOrderItemDto)
    questions: QuestionOrderItemDto[];
}