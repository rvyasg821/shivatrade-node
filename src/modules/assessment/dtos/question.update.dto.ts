import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, MaxLength, IsUUID } from 'class-validator';

export class QuestionUpdateDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '605c435a4f7b5f001f1b3d4c',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    assessment_id: string;

    @ApiProperty({
        description: 'ID of the section',
        example: '605c435a4f7b5f001f1b3d4d',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    section_id: string;

    @ApiProperty({
        description: 'ID of the parent question',
        example: '605c435a4f7b5f001f1b3d4e',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    parent_question_id: string;

    @ApiProperty({
        description: 'Whether this is a child question',
        example: false,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    is_child: boolean;

    @ApiProperty({
        description: 'Question text',
        example: 'Do you have a data backup policy?',
        required: false,
    })
    @IsString()
    @IsOptional()
    question: string;

    @ApiProperty({
        description: 'Description of the question',
        example: 'Please describe your data backup policy',
        required: false,
    })
    @IsString()
    @IsOptional()
    description: string;

    @ApiProperty({
        description: 'Option type',
        example: 'single_choice',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    option_type: string;

    @ApiProperty({
        description: 'Question options',
        example: [{ value: 'Yes', points: 10 }, { value: 'No', points: 15 }],
        required: false,
    })
    @IsOptional()
    options: Array<any>;

    @ApiProperty({
        description: 'Value',
        example: 'Yes',
        required: false,
    })
    @IsString()
    @IsOptional()
    value: string;

    @ApiProperty({
        description: 'Whether the question is mandatory',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    is_mandatory: boolean;

    @ApiProperty({
        description: 'Point value',
        example: 10,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    point: number;

    @ApiProperty({
        description: 'Order of the question',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    order: number;

    @ApiProperty({
        description: 'Status of the question',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    status: number;
}