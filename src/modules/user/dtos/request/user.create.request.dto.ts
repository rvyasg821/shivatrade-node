import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    MaxLength,
    MinLength,
    IsEnum,
    IsOptional,
    ValidateIf,
    IsNumber,
    IsEmail,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';
import { ENUM_USER_GENDER, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { IsPassword } from '@common/request/validations/request.is-password.validation';
import { Transform } from 'class-transformer';

export class UserCreateRequestDto {
    @ApiProperty({
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
    })
    // @IsCustomEmail()
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(100)
    email: string;

    @ApiProperty({
        description: 'Password of user',
        example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string.alphanumeric(5).toUpperCase()}@@!123`,
        required: true,
        minLength: 8,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @IsPassword()
    @MinLength(8)
    @MaxLength(50)
    password?: string;

    @ApiProperty({
        example: faker.database.mongodbObjectId(),
        required: true,
    })
    @IsNotEmpty()
    role: string;

    @ApiProperty({
        example: faker.person.fullName(),
        required: false,
        maxLength: 100,
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiProperty({
        example: faker.person.firstName(),
        required: false,
        maxLength: 50,
        description: 'User first name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    first_name?: string;

    @ApiProperty({
        example: faker.person.lastName(),
        required: false,
        maxLength: 50,
        description: 'User last name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    last_name?: string;

    @ApiProperty({ description: 'User country code' })
    @IsOptional()
    country_code?: object;

    @ApiProperty({ description: 'User mobile number' })
    @IsOptional()
    @IsString()
    @MinLength(0)
    @MaxLength(20)
    mobile?: string;

    @ApiProperty({
        required: true,
        enum: ENUM_USER_GENDER,
        example: ENUM_USER_GENDER.MALE,
    })
    @IsString()
    @IsEnum(ENUM_USER_GENDER)
    @IsNotEmpty()
    gender: ENUM_USER_GENDER;

    @ApiProperty({
        enum: ENUM_USER_STATUS,
        example: ENUM_USER_STATUS.ACTIVE,
    })
    @IsOptional()
    status?: ENUM_USER_STATUS;

    @ApiProperty({
        required: false,
        description: 'company id',
        example: faker.database.mongodbObjectId(),
    })
    @IsString()
    @IsOptional()
    companyId?: string | null;

    @ApiProperty({
        description: 'Company name',
        example: faker.company.name(),
        required: false,
    })
    @IsString()
    @IsOptional()
    company_name?: string;

    @ApiProperty({
        description: 'First name',
        example: faker.person.firstName(),
        required: false,
    })
    @IsString()
    @IsOptional()
    fname?: string;

    @ApiProperty({
        description: 'Last name',
        example: faker.person.lastName(),
        required: true,
        maxLength: 50,
    })
    @IsString()
    @IsOptional()
    lname?: string;

    @ApiProperty({
        description: 'Role Level',
        example: 3,
        required: false
    })
    @IsNumber()
    @IsOptional()
    roleLevel?: number;

    @ApiProperty({
        description: 'Role Level',
        example: 3,
        required: false
    })
    @IsString()
    @IsOptional()
    referal_code?: string;

    @ApiProperty({
        description: 'Commission of the Agent in percentage',
        example: 3,
        required: false
    })
    @IsNumber()
    @IsOptional()
    commission?: number;

    @ApiProperty({
        example: faker.image.dataUri(),
        required: false,
        description: 'User photo',
    })
    @IsOptional()
    @IsString()
    photo?: string;

    @ApiProperty({
        description: 'Selected country ISO code',
        example: 'US',
        required: false,
        maxLength: 2,
    })
    @IsOptional()
    @IsString()
    @MaxLength(2)
    selected_country?: string;

    @ApiProperty({
        description: 'Timezone',
        example: 'America/New_York',
        required: false,
    })
    @IsOptional()
    @IsString()
    timezone?: string;

    // ============ EMPLOYEE/HR FIELDS ============

    @ApiProperty({
        description: 'Location ID (for Employee and Location Admin roles)',
        example: faker.database.mongodbObjectId(),
        required: false,
    })
    @IsOptional()
    @IsString()
    location_id?: string;

    @ApiProperty({
        description: 'Additional accessible locations for Location Admin (array of location UUIDs)',
        example: ['uuid-1', 'uuid-2'],
        required: false,
    })
    @IsOptional()
    accessible_locations?: string[];

    @ApiProperty({
        description: 'Employee code (unique within company)',
        example: 'EMP001',
        required: false,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.toUpperCase().trim())
    employee_code?: string;

    @ApiProperty({
        description: 'Job title/designation',
        example: 'Senior Software Engineer',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    designation?: string;

    @ApiProperty({
        description: 'Department',
        example: 'Engineering',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    department?: string;

    @ApiProperty({
        description: 'Employment type',
        example: 'full-time',
        required: false,
        enum: ['full-time', 'part-time', 'contract', 'intern'],
    })
    @IsOptional()
    @IsString()
    employment_type?: string;

    @ApiProperty({
        description: 'Date of joining',
        example: '2024-01-01',
        required: false,
    })
    @IsOptional()
    @IsString()
    date_of_joining?: string;

    @ApiProperty({
        description: 'Date of birth',
        example: '1990-01-01',
        required: false,
    })
    @IsOptional()
    @IsString()
    date_of_birth?: string;

    @ApiProperty({
        description: 'Reporting to user ID',
        example: faker.database.mongodbObjectId(),
        required: false,
    })
    @IsOptional()
    @IsString()
    reporting_to?: string;

    @ApiProperty({
        description: 'Address line 1',
        example: '123 Main Street',
        required: false,
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => value?.trim())
    address_line1?: string;

    @ApiProperty({
        description: 'Address line 2',
        example: 'Apt 4B',
        required: false,
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => value?.trim())
    address_line2?: string;

    @ApiProperty({
        description: 'City',
        example: 'New York',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    city?: string;

    @ApiProperty({
        description: 'State/Province',
        example: 'NY',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    state?: string;

    @ApiProperty({
        description: 'Postal/ZIP code',
        example: '10001',
        required: false,
        maxLength: 20,
    })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    @Transform(({ value }) => value?.trim())
    postcode?: string;

    @ApiProperty({
        description: 'Country',
        example: 'United States',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    country?: string;

    @ApiProperty({
        description: 'Base64 face image for face recognition registration',
        required: false,
    })
    @IsOptional()
    @IsString()
    face_image?: string;

    @IsOptional()
    @IsString()
    ni_number?: string;

    @IsOptional()
    @IsString()
    nationality?: string;

    @IsOptional()
    @IsString()
    marital_status?: string;

    @IsOptional()
    @IsString()
    middle_name?: string;

    @IsOptional()
    @IsString()
    home_telephone?: string;
}
