import { ApiProperty } from '@nestjs/swagger';

export class AssessmentOrderResponseDto {
    @ApiProperty({
        description: 'ID of the Assessment',
        example: '507f1f77bcf86cd799439011',
    })
    _id: string;

    @ApiProperty({
        description: 'Order value of the assessment',
        example: 1,
    })
    order: number;
}