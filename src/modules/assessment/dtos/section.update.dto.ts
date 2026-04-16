import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, MaxLength, IsUUID } from 'class-validator';

export class SectionUpdateDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '605c435a4f7b5f001f1b3d4c',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    assessment_id: string;

    @ApiProperty({
        description: 'Name of the section',
        example: 'Data Security',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
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
    @IsNumber()
    @IsOptional()
    order: number;

    @ApiProperty({
        description: 'Status of the section',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    status: number;
}