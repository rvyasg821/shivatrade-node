import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ENUM_TOOLS_STATUS } from '../../enums/tools.enum';

export class ToolsListResponseDto {
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
        description: 'Tool name slug',
        example: 'ai-sssistant',
    })
    @Expose()
    slug: string;

    @ApiProperty({
        description: 'Tool description',
        example: 'Advanced AI assistant for productivity',
    })
    @Expose()
    description: string;

    @ApiProperty({
        description: 'Tool status',
        enum: ENUM_TOOLS_STATUS,
        example: ENUM_TOOLS_STATUS.ACTIVE,
    })
    @Expose()
    status: ENUM_TOOLS_STATUS;

    @ApiProperty({
        description: 'Display order for sorting tools',
        example: 1,
    })
    @Expose()
    displayOrder: number;

    @ApiProperty({
        description: 'Tool creation timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    createdAt: Date;

    @ApiProperty({
        description: 'Tool last update timestamp',
        example: '2023-10-10T10:00:00.000Z',
    })
    @Expose()
    updatedAt: Date;

    @Exclude()
    deleted: boolean;

    @Exclude()
    deletedAt?: Date;
}