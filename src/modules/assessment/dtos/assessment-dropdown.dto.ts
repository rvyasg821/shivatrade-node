import { ApiProperty } from '@nestjs/swagger';

export class AssessmentDropdownDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '507f1f77bcf86cd799439011',
    })
    _id: string;

    @ApiProperty({
        description: 'Name of the assessment',
        example: 'Security Assessment',
    })
    name: string;
}