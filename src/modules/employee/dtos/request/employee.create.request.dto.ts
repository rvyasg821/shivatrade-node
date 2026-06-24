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
    IsNumber,
    MinLength,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_EMPLOYEE_GENDER,
    ENUM_PAYROLL_FREQUENCY,
    ENUM_MODE_OF_TRANSFER,
} from '@modules/employee/enums/employee.enum';
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

    // ============ SALARY & WORKING HOURS ============

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    annual_salary?: number;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    hourly_rate?: number;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    weekly_working_hours?: number;

    @ApiProperty({ required: false, type: String, enum: ['hourly', 'salaried'] })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    pay_type?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    working_hours_pattern?: string;

    @ApiProperty({ required: false, enum: ENUM_PAYROLL_FREQUENCY })
    @IsEnum(ENUM_PAYROLL_FREQUENCY)
    @IsOptional()
    payroll_frequency?: ENUM_PAYROLL_FREQUENCY;

    @ApiProperty({ required: false, enum: ENUM_MODE_OF_TRANSFER })
    @IsEnum(ENUM_MODE_OF_TRANSFER)
    @IsOptional()
    mode_of_transfer?: ENUM_MODE_OF_TRANSFER;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    sick_leaves_allowed?: number;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    annual_leaves_allowed?: number;

    // ============ BANK / FINANCIAL DETAILS ============

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    bank_name?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    account_holder_name?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    sort_code?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    account_number?: string;

    @ApiProperty({ required: false, type: Boolean })
    @IsBoolean()
    @IsOptional()
    pension_opt_in?: boolean;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    pension_provider?: string;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    pension_employee_contribution?: number;

    @ApiProperty({ required: false, type: Number })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    pension_employer_contribution?: number;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    tax_code?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(10)
    ni_category?: string;

    // ============ NEXT OF KIN / EMERGENCY CONTACT ============

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    kin_name?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    kin_relationship?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    kin_address?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    kin_postcode?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    kin_phone?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    kin_email?: string;

    // ============ IMMIGRATION / PASSPORT ============

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    passport_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    passport_country_of_issue?: string;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    passport_expiry?: Date;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    visa_category?: string;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    visa_valid_from?: Date;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    visa_valid_to?: Date;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    brp_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    cos_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    visa_restriction?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    share_code?: string;

    // ============ RIGHT TO WORK ============

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    rtw_check_date?: Date;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    rtw_end_date?: Date;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    rtw_check_conducted?: Date;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    rtw_date_received?: Date;

    @ApiProperty({ required: false, type: Date })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    ecs_expiry_date?: Date;

    // ============ REPORTING ============

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    reporting_to?: string;
}
