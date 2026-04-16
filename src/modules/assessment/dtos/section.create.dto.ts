import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, MaxLength, IsUUID } from 'class-validator';

export class SectionCreateDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '605c435a4f7b5f001f1b3d4c',
        required: true,
    })
    @IsUUID()
    assessment_id: string;

    @ApiProperty({
        description: 'Name of the section',
        example: 'Data Security',
        required: true,
    })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({
        description: 'Description of the section',
        example: 'Questions related to data security practices',
        required: false,
    })
    @IsString()
    @IsOptional()
    description: string;

    @ApiProperty({
        description: 'Order of the section',
        example: 1,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    order: number;

    @ApiProperty({
        description: 'Status of the section',
        example: 1,
        required: true,
    })
    @IsNumber()
    status: number;
}