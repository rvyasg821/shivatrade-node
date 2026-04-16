import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_EMPLOYEE_GENDER } from '@modules/employee/enums/employee.enum';

export class EmployeeGetResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    company_id: string;

    @ApiProperty({ required: true, type: String })
    location_id: string;

    @ApiProperty({ required: false, type: String })
    created_by?: string;

    @ApiProperty({ required: true, type: String })
    first_name: string;

    @ApiProperty({ required: true, type: String })
    last_name: string;

    @ApiProperty({ required: true, type: String })
    email: string;

    @ApiProperty({ required: false, type: String })
    mobile?: string;

    @ApiProperty({ required: false, type: Object })
    country_code?: {
        dial_code: string;
        country_code: string;
    };

    @ApiProperty({ required: true, type: String })
    employee_code: string;

    @ApiProperty({ required: true, type: String })
    designation: string;

    @ApiProperty({ required: true, type: String })
    department: string;

    @ApiProperty({ required: true, type: Date })
    date_of_joining: Date;

    @ApiProperty({ required: false, type: Date })
    date_of_birth?: Date;

    @ApiProperty({ required: true, enum: ENUM_EMPLOYEE_GENDER })
    gender: ENUM_EMPLOYEE_GENDER;

    @ApiProperty({ required: false, type: String })
    address_1?: string;

    @ApiProperty({ required: false, type: String })
    address_2?: string;

    @ApiProperty({ required: false, type: String })
    city?: string;

    @ApiProperty({ required: false, type: String })
    state?: string;

    @ApiProperty({ required: false, type: String })
    country?: string;

    @ApiProperty({ required: false, type: String })
    zip_code?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: false, type: String })
    employment_type?: string;

    @ApiProperty({ required: false, type: String })
    reporting_to?: string;

    // Extended personal fields
    @ApiProperty({ required: false, type: String })
    middle_name?: string;

    @ApiProperty({ required: false, type: String })
    marital_status?: string;

    @ApiProperty({ required: false, type: String })
    home_telephone?: string;

    @ApiProperty({ required: false, type: String })
    ni_number?: string;

    @ApiProperty({ required: false, type: String })
    nationality?: string;

    // Salary & working hours
    @ApiProperty({ required: false, type: Number })
    annual_salary?: number;

    @ApiProperty({ required: false, type: Number })
    hourly_rate?: number;

    @ApiProperty({ required: false, type: Number })
    weekly_working_hours?: number;

    @ApiProperty({ required: false, type: String, enum: ['hourly', 'salaried'] })
    pay_type?: string;

    @ApiProperty({ required: false, type: String })
    working_hours_pattern?: string;

    @ApiProperty({ required: false, type: String })
    payroll_frequency?: string;

    @ApiProperty({ required: false, type: String })
    mode_of_transfer?: string;

    @ApiProperty({ required: false, type: Number })
    sick_leaves_allowed?: number;

    @ApiProperty({ required: false, type: Number })
    annual_leaves_allowed?: number;

    // Bank / financial details
    @ApiProperty({ required: false, type: String })
    bank_name?: string;

    @ApiProperty({ required: false, type: String })
    account_holder_name?: string;

    @ApiProperty({ required: false, type: String })
    sort_code?: string;

    @ApiProperty({ required: false, type: String })
    account_number?: string;

    @ApiProperty({ required: false, type: Boolean })
    pension_opt_in?: boolean;

    // Next of kin
    @ApiProperty({ required: false, type: String })
    kin_name?: string;

    @ApiProperty({ required: false, type: String })
    kin_relationship?: string;

    @ApiProperty({ required: false, type: String })
    kin_address?: string;

    @ApiProperty({ required: false, type: String })
    kin_postcode?: string;

    @ApiProperty({ required: false, type: String })
    kin_phone?: string;

    @ApiProperty({ required: false, type: String })
    kin_email?: string;

    // Immigration / passport
    @ApiProperty({ required: false, type: String })
    passport_number?: string;

    @ApiProperty({ required: false, type: String })
    passport_country_of_issue?: string;

    @ApiProperty({ required: false, type: Date })
    passport_expiry?: Date;

    @ApiProperty({ required: false, type: String })
    visa_category?: string;

    @ApiProperty({ required: false, type: Date })
    visa_valid_from?: Date;

    @ApiProperty({ required: false, type: Date })
    visa_valid_to?: Date;

    @ApiProperty({ required: false, type: String })
    brp_number?: string;

    @ApiProperty({ required: false, type: String })
    cos_number?: string;

    @ApiProperty({ required: false, type: String })
    visa_restriction?: string;

    @ApiProperty({ required: false, type: String })
    share_code?: string;

    // Right to work
    @ApiProperty({ required: false, type: Date })
    rtw_check_date?: Date;

    @ApiProperty({ required: false, type: Date })
    rtw_end_date?: Date;

    @ApiProperty({ required: false, type: Date })
    rtw_check_conducted?: Date;

    @ApiProperty({ required: false, type: Date })
    rtw_date_received?: Date;

    @ApiProperty({ required: false, type: Date })
    ecs_expiry_date?: Date;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @ApiProperty({ required: false, type: Date })
    deleted_at?: Date;

    @Exclude()
    soft_delete: boolean;
}
