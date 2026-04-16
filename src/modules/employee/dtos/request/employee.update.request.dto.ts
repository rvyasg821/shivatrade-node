import { PartialType } from '@nestjs/swagger';
import { EmployeeCreateRequestDto } from './employee.create.request.dto';
import {
    IsString,
    IsOptional,
    IsEnum,
    IsDate,
    IsNumber,
    IsBoolean,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
    ENUM_MARITAL_STATUS,
    ENUM_PAYROLL_FREQUENCY,
    ENUM_MODE_OF_TRANSFER,
} from '@modules/employee/enums/employee.enum';

export class EmployeeUpdateRequestDto extends PartialType(
    EmployeeCreateRequestDto
) {
    // ============ EXTENDED PERSONAL FIELDS ============

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    middle_name?: string;

    @ApiProperty({ required: false, enum: ENUM_MARITAL_STATUS })
    @IsEnum(ENUM_MARITAL_STATUS)
    @IsOptional()
    marital_status?: ENUM_MARITAL_STATUS;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    home_telephone?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    ni_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    nationality?: string;

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
