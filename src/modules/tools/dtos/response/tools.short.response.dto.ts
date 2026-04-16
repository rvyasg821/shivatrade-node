import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ToolsShortResponseDto {
    @ApiProperty({
        description: 'Tool unique identifier',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    _id: string;

    @ApiProperty({
        description: 'Tool name',
        example: 'AI Assistant',
    })
    @Expose()
    name: string;

    @ApiProperty({
        description: 'Display order for sorting tools',
        example: 1,
    })
    @Expose()
    displayOrder: number;
}