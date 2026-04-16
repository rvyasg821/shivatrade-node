import { ApiProperty } from '@nestjs/swagger';

export class QuestionOrderResponseDto {
    @ApiProperty({
        description: 'ID of the question',
        example: '507f1f77bcf86cd799439011',
    })
    questionId: string;

    @ApiProperty({
        description: 'Order value of the question',
        example: 1,
    })
    order: number;
}