import { ApiProperty } from '@nestjs/swagger';

export class AssessmentListResponseDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '605c435a4f7b5f001f1b3d4c',
    })
    _id: string;

    @ApiProperty({
        description: 'Name of the assessment',
        example: 'Security Assessment',
    })
    name: string;

    @ApiProperty({
        description: 'Description of the assessment',
        example: 'Security Assessment',
    })
    description: string;

    @ApiProperty({
        description: 'Order of the assessment',
        example: 1,
    })
    order: number;

    @ApiProperty({
        description: 'Status of the assessment',
        example: 1,
    })
    status: number;

    @ApiProperty({
        description: 'Creation date',
        example: '2023-01-01T00:00:00.000Z',
    })
    createdAt: Date;

    @ApiProperty({
        description: 'Last update date',
        example: '2023-01-01T00:00:00.000Z',
    })
    updatedAt: Date;
}