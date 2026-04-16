import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsUUID } from 'class-validator';

export class QuestionAnswerCreateDto {
    @ApiProperty({
        description: 'ID of the company',
        example: '605c435a4f7b5f001f1b3d4a',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    company_id: string;

    @ApiProperty({
        description: 'ID of the assessment report',
        example: '605c435a4f7b5f001f1b3d4b',
        required: false,
    })
    @IsUUID()
    asessment_report_id: string;

    @ApiProperty({
        description: 'ID of the user',
        example: '605c435a4f7b5f001f1b3d4c',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    user_id: string;

    @ApiProperty({
        description: 'ID of the section',
        example: '605c435a4f7b5f001f1b3d4d',
        required: true,
    })
    @IsUUID()
    section_id: string;

    @ApiProperty({
        description: 'ID of the question',
        example: '605c435a4f7b5f001f1b3d4e',
        required: true,
    })
    @IsUUID()
    question_id: string;

    @ApiProperty({
        description: 'ID of the parent question',
        example: '605c435a4f7b5f001f1b3d4f',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    parent_question_id: string;

    @ApiProperty({
        description: 'Question data',
        example: {},
        required: false,
    })
    @IsOptional()
    question_data: object;

    @ApiProperty({
        description: 'Answer value',
        example: 'Yes',
        required: true,
    })
    @IsString()
    value: string;

    @ApiProperty({
        description: 'Status of the question answer',
        example: 1,
        required: true,
    })
    @IsNumber()
    @IsOptional()
    status: number;
}