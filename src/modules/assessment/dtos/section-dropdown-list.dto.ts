import { ApiProperty } from '@nestjs/swagger';

export class SectionDropdownListDto {
    @ApiProperty({
        description: 'ID of the section',
        example: '507f1f77bcf86cd799439011',
    })
    _id: string;

    @ApiProperty({
        description: 'Name of the section',
        example: 'General Information',
    })
    name: string;
}