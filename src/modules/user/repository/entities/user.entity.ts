import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';

import {
    ENUM_USER_GENDER,
    ENUM_USER_INACTIVE_REASON,
    ENUM_USER_SIGN_UP_FROM,
    ENUM_USER_STATUS,
} from '@modules/user/enums/user.enum';

export const UserTableName = 'users';

@Entity(UserTableName)
@Index('IDX_employee_code_company_unique', ['employee_code', 'companyId'], { unique: true, where: '"deleted" = false AND "employee_code" IS NOT NULL' })
export class UserEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 200, nullable: true })
    name?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    first_name?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    last_name?: string;

    @Index({ unique: true, where: '"deleted" = false' })
    @Column({ type: 'varchar', length: 100, nullable: false })
    email: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code: object;

    @Column({ type: 'varchar', nullable: true, default: '' })
    mobile: string;

    @Column({ type: 'varchar', nullable: true })
    gender: ENUM_USER_GENDER;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    role: string;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    companyId?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true, default: null })
    location_id?: string;

    @Column({ type: 'varchar', nullable: true, default: 'self' })
    access_level?: string;

    @Column({ type: 'uuid', array: true, default: '{}' })
    accessible_locations?: string[];

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    locationId?: string; // Keep for backward compatibility

    @Column({ type: 'varchar', nullable: false, select: false })
    password: string;

    @Column({ type: 'timestamptz', nullable: false })
    passwordExpired: Date;

    @Column({ type: 'timestamptz', nullable: false })
    passwordCreated: Date;

    @Column({ type: 'int', nullable: false, default: 0 })
    passwordAttempt: number;

    @Column({ type: 'timestamptz', nullable: false })
    signUpDate: Date;

    @Column({ type: 'varchar', nullable: false })
    signUpFrom: ENUM_USER_SIGN_UP_FROM;

    @Column({ type: 'varchar', nullable: false, select: false })
    salt: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    photo: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    face_descriptor: number[]; // 128-float face embedding from face-api.js

    @Column({ type: 'varchar', nullable: true, default: null })
    face_reference_photo: string; // path to reference face photo file

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_USER_STATUS.ACTIVE })
    status: ENUM_USER_STATUS;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    inactive_reason?: ENUM_USER_INACTIVE_REASON;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    subscription_id?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_subscribe?: boolean;

    @Index()
    @Column({ type: 'int', nullable: false, default: 1 })
    roleLevel: number;

    @Column({ type: 'varchar', nullable: true, default: null })
    referal_code?: string;

    @Column({ type: 'float', nullable: true, default: 0 })
    commission?: number;

    @Column({ type: 'varchar', length: 2, nullable: true })
    selected_country?: string;

    @Column({ type: 'varchar', nullable: true })
    timezone?: string;

    // ============ EMPLOYEE/HR FIELDS ============
    // These fields are used when user has Employee role

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    employee_code?: string; // Unique employee code within company

    @Column({ type: 'varchar', length: 100, nullable: true })
    designation?: string; // Job title

    @Column({ type: 'varchar', length: 100, nullable: true })
    department?: string;

    @Column({ type: 'timestamptz', nullable: true })
    date_of_joining?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    date_of_birth?: Date;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line1?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line2?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    postcode?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country?: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    employment_type?: string;

    @Column({ type: 'uuid', nullable: true })
    reporting_to?: string; // Reports to which user

    @Column({ type: 'boolean', default: true })
    is_active?: boolean; // For employee status (active/inactive)

    // ============ EXTENDED PERSONAL FIELDS ============

    @Column({ type: 'varchar', length: 50, nullable: true })
    middle_name?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    marital_status?: string; // SINGLE, MARRIED, DIVORCED, WIDOWED, OTHER

    @Column({ type: 'varchar', length: 50, nullable: true })
    home_telephone?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    ni_number?: string; // National Insurance / Tax ID

    @Column({ type: 'varchar', length: 100, nullable: true })
    nationality?: string;

    // ============ SALARY & WORKING HOURS ============

    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    annual_salary?: number;

    @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
    hourly_rate?: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    weekly_working_hours?: number;

    // 'hourly' (rate is the source of truth, salary computed) | 'salaried' (salary
    // is the source of truth, rate computed). Drives the UI calculator on the
    // employee edit page so values can't drift due to rounding feedback loops.
    @Column({ type: 'varchar', length: 20, nullable: true, default: 'salaried' })
    pay_type?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    working_hours_pattern?: string; // e.g. "9-5", "Shifts"

    @Column({ type: 'varchar', length: 20, nullable: true })
    payroll_frequency?: string; // WEEKLY, BI_WEEKLY, MONTHLY

    @Column({ type: 'varchar', length: 20, nullable: true })
    mode_of_transfer?: string; // BANK, CASH, CHEQUE

    @Column({ type: 'int', nullable: true })
    sick_leaves_allowed?: number;

    @Column({ type: 'int', nullable: true })
    annual_leaves_allowed?: number;

    // ============ BANK / FINANCIAL DETAILS ============

    @Column({ type: 'varchar', length: 100, nullable: true })
    bank_name?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    account_holder_name?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    sort_code?: string; // Sort Code / Routing Number

    @Column({ type: 'varchar', length: 50, nullable: true })
    account_number?: string;

    @Column({ type: 'boolean', nullable: true, default: null })
    pension_opt_in?: boolean;

    @Column({ type: 'varchar', length: 100, nullable: true })
    pension_provider?: string;

    @Column({ type: 'float', nullable: true })
    pension_employee_contribution?: number;

    @Column({ type: 'float', nullable: true })
    pension_employer_contribution?: number;

    @Column({ type: 'varchar', length: 20, nullable: true })
    tax_code?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    ni_category?: string;

    // ============ NEXT OF KIN / EMERGENCY CONTACT ============

    @Column({ type: 'varchar', length: 100, nullable: true })
    kin_name?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    kin_relationship?: string;

    @Column({ type: 'text', nullable: true })
    kin_address?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    kin_postcode?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    kin_phone?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    kin_email?: string;

    // ============ IMMIGRATION / PASSPORT ============

    @Column({ type: 'varchar', length: 50, nullable: true })
    passport_number?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    passport_country_of_issue?: string;

    @Column({ type: 'timestamptz', nullable: true })
    passport_expiry?: Date;

    @Column({ type: 'varchar', length: 100, nullable: true })
    visa_category?: string;

    @Column({ type: 'timestamptz', nullable: true })
    visa_valid_from?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    visa_valid_to?: Date;

    @Column({ type: 'varchar', length: 50, nullable: true })
    brp_number?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    cos_number?: string;

    @Column({ type: 'text', nullable: true })
    visa_restriction?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    share_code?: string;

    // ============ RIGHT TO WORK ============

    @Column({ type: 'timestamptz', nullable: true })
    rtw_check_date?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    rtw_end_date?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    rtw_check_conducted?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    rtw_date_received?: Date;

    @Column({ type: 'timestamptz', nullable: true })
    ecs_expiry_date?: Date;

}

export type UserDoc = UserEntity;
