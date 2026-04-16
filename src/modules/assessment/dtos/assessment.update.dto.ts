import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, MaxLength } from 'class-validator';

export class AssessmentUpdateDto {
    @ApiProperty({
        description: 'Name of the assessment',
        example: 'Security Assessment',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    name: string;

    @ApiProperty({
        description: 'Description of the assessment',
        example: 'Comprehensive security assessment for organizations',
        required: false,
    })
    @IsString()
    @IsOptional()
    description: string;

    @ApiProperty({
        description: 'Order of the assessment',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    order: number;

    @ApiProperty({
        description: 'Whether to show score calculation',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    show_score_calculation: boolean;

    @ApiProperty({
        description: 'Additional description of the assessment',
        example: 'This assessment includes advanced security checks',
        required: false,
    })
    @IsString()
    @IsOptional()
    additional_description: string;

    @ApiProperty({
        description: 'Status of the assessment',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    status: number;
}