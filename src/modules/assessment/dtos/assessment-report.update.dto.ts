import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, MaxLength, IsUUID } from 'class-validator';

export class AssessmentReportUpdateDto {
    @ApiProperty({
        description: 'ID of the assessment',
        example: '605c435a4f7b5f001f1b3d4c',
        required: false,
    })
    @IsUUID()
    @IsOptional()
    assessment_id: string;

    @ApiProperty({
        description: 'Assessment data',
        example: {},
        required: false,
    })
    @IsOptional()
    assessment_data: object;

    @ApiProperty({
        description: 'Group data',
        example: [],
        required: false,
    })
    @IsOptional()
    group_data: Array<any>;

    @ApiProperty({
        description: 'Name',
        example: 'John Doe',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    name: string;

    @ApiProperty({
        description: 'First name',
        example: 'John',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    first_name: string;

    @ApiProperty({
        description: 'Last name',
        example: 'Doe',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    last_name: string;

    @ApiProperty({
        description: 'Company name',
        example: 'Acme Inc',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    company_name: string;

    @ApiProperty({
        description: 'Email',
        example: 'john.doe@example.com',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    email: string;

    @ApiProperty({
        description: 'Mobile',
        example: '+1234567890',
        required: false,
    })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    mobile: string;

    @ApiProperty({
        description: 'Business type',
        example: 'Manufacturing',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    business_type: string;

    @ApiProperty({
        description: 'Team size',
        example: 50,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    team_size: number;

    @ApiProperty({
        description: 'Operation description',
        example: 'Manufacturing operations',
        required: false,
    })
    @IsString()
    @IsOptional()
    operation_description: string;

    @ApiProperty({
        description: 'Address line 1',
        example: '123 Main St',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    address1: string;

    @ApiProperty({
        description: 'Address line 2',
        example: 'Suite 100',
        required: false,
    })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    address2: string;

    @ApiProperty({
        description: 'City',
        example: 'New York',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    city: string;

    @ApiProperty({
        description: 'State',
        example: 'NY',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    state: string;

    @ApiProperty({
        description: 'Country',
        example: 'USA',
        required: false,
    })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    country: string;

    @ApiProperty({
        description: 'Zipcode',
        example: '10001',
        required: false,
    })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    zipcode: string;

    @ApiProperty({
        description: 'Total score',
        example: 100,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    total: number;

    @ApiProperty({
        description: 'Pass count',
        example: 80,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    pass: number;

    @ApiProperty({
        description: 'Fail count',
        example: 20,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    fail: number;

    @ApiProperty({
        description: 'Invalid count',
        example: 0,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    invalid: number;

    @ApiProperty({
        description: 'Score',
        example: 80,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    score: number;

    @ApiProperty({
        description: 'PDF path',
        example: '/path/to/report.pdf',
        required: false,
    })
    @IsString()
    @IsOptional()
    pdf_path: string;

    @ApiProperty({
        description: 'Email verified',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    email_verified: boolean;

    @ApiProperty({
        description: 'Mobile verified',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    mobile_verified: boolean;

    @ApiProperty({
        description: 'Status',
        example: 1,
        required: false,
    })
    @IsNumber()
    @IsOptional()
    status: number;
}