import { Transform } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    MaxLength,
    IsObject,
    IsBoolean,
    IsEnum,
    IsDate,
    MinLength,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ENUM_EMPLOYEE_GENDER } from '@modules/employee/enums/employee.enum';
import { ApiProperty } from '@nestjs/swagger';

export class EmployeeCreateRequestDto {
    @ApiProperty({
        required: true,
        type: String,
        description: 'Location ID where employee will be assigned',
    })
    @IsString()
    @IsNotEmpty()
    location_id: string;

    @ApiProperty({
        required: false,
        type: [String],
        description: 'Additional location IDs the employee can work at (excluding primary)',
    })
    @IsOptional()
    additional_location_ids?: string[];

    @ApiProperty({
        required: true,
        type: String,
        description: 'Custom role ID to assign to the employee. Must be a custom role belonging to this company. The Employee system role is no longer assignable.',
    })
    @IsString()
    @IsNotEmpty()
    role_id: string;

    @ApiProperty({
        required: true,
        type: String,
        maxLength: 100,
        description: 'Employee first name',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    first_name: string;

    @ApiProperty({
        required: true,
        type: String,
        maxLength: 100,
        description: 'Employee last name',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    last_name: string;

    @ApiProperty({
        required: true,
        type: String,
        maxLength: 200,
        description: 'Employee email address',
    })
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(200)
    email: string;

    @ApiProperty({
        required: false,
        type: String,
        description: 'Login password. If omitted, defaults to Welcome@123',
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => (value === '' ? undefined : value))
    @MinLength(8)
    @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, {
        message: 'Password must have min 8 chars, uppercase, lowercase, number and special character',
    })
    password?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 50,
        description: 'Employee mobile number',
    })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    mobile?: string;

    @ApiProperty({
        required: false,
        type: Object,
        description: 'Country code information',
        example: { dial_code: '+44', country_code: 'GB' },
    })
    @IsObject()
    @IsOptional()
    country_code?: {
        dial_code: string;
        country_code: string;
    };

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 50,
        description: 'Unique employee code (will be auto-uppercased or auto-generated)',
    })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    employee_code?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 100,
        description: 'Employee designation/job title',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    designation?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 100,
        description: 'Department name',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    department?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 50,
        description: 'Employment type (full-time, part-time, contract, intern)',
    })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    employment_type?: string;

    @ApiProperty({
        required: true,
        type: Date,
        description: 'Date of joining',
    })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    date_of_joining?: Date;

    @ApiProperty({
        required: false,
        type: Date,
        description: 'Date of birth',
    })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    date_of_birth?: Date;

    @ApiProperty({
        required: true,
        enum: ENUM_EMPLOYEE_GENDER,
        description: 'Employee gender',
    })
    @IsEnum(ENUM_EMPLOYEE_GENDER)
    @IsNotEmpty()
    gender: ENUM_EMPLOYEE_GENDER;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 200,
        description: 'Address line 1',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    address_1?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 200,
        description: 'Address line 2',
    })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    address_2?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 100,
        description: 'City',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    city?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 100,
        description: 'State/Province',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    state?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 100,
        description: 'Country',
    })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    country?: string;

    @ApiProperty({
        required: false,
        type: String,
        maxLength: 20,
        description: 'ZIP/Postal code',
    })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    zip_code?: string;

    @ApiProperty({
        required: false,
        type: Boolean,
        description: 'Is employee active',
    })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiProperty({
        required: false,
        type: String,
        description: 'Base64 face image for face recognition registration',
    })
    @IsString()
    @IsOptional()
    face_image?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    ni_number?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    nationality?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    marital_status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    middle_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    home_telephone?: string;
}
