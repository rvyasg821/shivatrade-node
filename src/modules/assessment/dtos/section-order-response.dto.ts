import { ApiProperty } from '@nestjs/swagger';

export class SectionOrderResponseDto {
    @ApiProperty({
        description: 'ID of the section',
        example: '507f1f77bcf86cd799439011',
    })
    sectionId: string;

    @ApiProperty({
        description: 'Order value of the section',
        example: 1,
    })
    order: number;
}