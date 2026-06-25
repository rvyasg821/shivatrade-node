import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    MaxLength,
    MinLength,
    IsOptional,
    ValidateIf,
    IsUrl,
    IsBoolean,
    IsEmail,
    IsArray,
    IsEnum,
    IsUUID,
    IsDateString,
    ValidateNested,
    Matches,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';
import { Transform, Type } from 'class-transformer';
import {
    ENUM_COMPANY_ADDRESS_TYPE,
    ENUM_COMPANY_BANK_ACCOUNT_TYPE,
    ENUM_COMPANY_STATUS,
} from '@modules/company/enums/company.enum';

export class CompanyAddressRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsEnum(ENUM_COMPANY_ADDRESS_TYPE) @IsOptional()
    type?: ENUM_COMPANY_ADDRESS_TYPE;

    @IsString() @IsOptional() @MaxLength(150) label?: string;

    @IsString() @IsOptional() @MaxLength(200) address_line1?: string;
    @IsString() @IsOptional() @MaxLength(200) address_line2?: string;
    @IsString() @IsOptional() @MaxLength(100) city?: string;
    @IsString() @IsOptional() @MaxLength(100) state?: string;
    @IsString() @IsOptional() @MaxLength(100) country?: string;
    @IsString() @IsOptional() @MaxLength(20) postcode?: string;

    @IsString() @IsOptional() @MaxLength(15) gstin?: string;

    @IsBoolean() @IsOptional() is_default?: boolean;
}

export class CompanyBankAccountRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsString() @MaxLength(200) bank_name: string;
    @IsString() @IsOptional() @MaxLength(200) account_holder_name?: string;
    @IsString() @MaxLength(50) account_number: string;

    @IsString() @IsOptional() @MaxLength(11) ifsc?: string;
    @IsString() @IsOptional() @MaxLength(11) swift_code?: string;
    @IsString() @IsOptional() @MaxLength(34) iban?: string;

    /** AD code — required for forex-receiving accounts. */
    @IsString() @IsOptional() @MaxLength(30) ad_code?: string;

    @IsUUID() currency_id: string;

    @IsString() @IsOptional() @MaxLength(200) branch_name?: string;
    @IsString() @IsOptional() @MaxLength(500) branch_address?: string;

    @IsEnum(ENUM_COMPANY_BANK_ACCOUNT_TYPE) @IsOptional()
    account_type?: ENUM_COMPANY_BANK_ACCOUNT_TYPE;

    @IsBoolean() @IsOptional() is_default?: boolean;
    @IsString() @IsOptional() notes?: string;
    @IsBoolean() @IsOptional() is_active?: boolean;
}

export class CompanyUpdateRequestDto {
    @ApiProperty({
        example: faker.company.name(),
        required: false,
        maxLength: 100,
        minLength: 1,
        description: 'Company name'
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    company_name?: string;

    @ApiProperty({
        example: faker.person.fullName(),
        required: false,
        maxLength: 100,
        minLength: 1,
        description: 'Contact person name'
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    contact_name?: string;

    @ApiProperty({
        example: faker.person.firstName(),
        required: false,
        maxLength: 50,
        description: 'Contact person first name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    contact_first_name?: string;

    @ApiProperty({
        example: faker.person.lastName(),
        required: false,
        maxLength: 50,
        description: 'Contact person last name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    contact_middle_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    contact_last_name?: string;

    @ApiProperty({
        example: faker.internet.email(),
        required: false,
        maxLength: 100,
        description: 'Company email address'
    })
    @IsOptional()
    // @IsCustomEmail()
    @IsEmail()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim()?.toLowerCase())
    email?: string;

    @ApiProperty({
        example: faker.phone.number(),
        required: false,
        maxLength: 20,
        minLength: 8,
        description: 'Company mobile number'
    })
    // @ValidateIf((o) => o.mobile !== null && o.mobile !== undefined)
    @IsOptional()
    @IsString()
    @MinLength(0)
    @MaxLength(20)
    // @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    mobile?: string;

    @ApiProperty({
        example: { code: '+1', name: 'United States' },
        required: false,
        description: 'Country code object'
    })
    @IsOptional()
    country_code?: object;

    @ApiProperty({
        example: faker.internet.url(),
        required: false,
        description: 'Company website URL'
    })
    @ValidateIf((o) => o.website !== "" && o.website !== null && o.website !== undefined)
    @IsOptional()
    @IsUrl({}, { message: 'Website must be a valid URL' })
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    website?: string;

    @ApiProperty({
        example: 'LIC-123456789',
        required: false,
        maxLength: 50,
        description: 'Company license number'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    license_number?: string;

    @ApiProperty({
        example: 'TAX-987654321',
        required: false,
        maxLength: 50,
        description: 'Company tax/VAT number'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    tax_number?: string;

    @ApiProperty({
        example: 'AAAAA0000A',
        required: false,
        maxLength: 10,
        description: 'Permanent Account Number (Indian Income Tax)',
    })
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
        message: 'pan must match the format AAAAA0000A (10 chars)',
    })
    @Transform(({ value }) =>
        value === '' ? undefined : value?.trim().toUpperCase()
    )
    pan?: string;

    @ApiProperty({
        example: 'US',
        required: false,
        maxLength: 2,
        description: 'Selected country ISO code'
    })
    @IsOptional()
    @IsString()
    @MaxLength(2)
    @Transform(({ value }) => value?.toUpperCase()?.trim())
    selected_country?: string;

    @ApiProperty({
        example: 'America/New_York',
        required: false,
        description: 'Company timezone'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    timezone?: string;

    @ApiProperty({
        example: 'USD',
        required: false,
        maxLength: 3,
        description: 'Company currency code'
    })
    @IsOptional()
    @IsString()
    @MaxLength(3)
    @Transform(({ value }) => value?.toUpperCase()?.trim())
    currency?: string;

    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 1'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    address_1?: string;

    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 2'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    address_2?: string;

    @ApiProperty({
        example: faker.location.city(),
        required: false,
        description: 'City'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    city?: string;

    @ApiProperty({
        example: faker.location.state(),
        required: false,
        description: 'State'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    state?: string;

    @ApiProperty({
        example: faker.location.country(),
        required: false,
        description: 'Country'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    country?: string;

    @ApiProperty({
        example: faker.location.zipCode(),
        required: false,
        description: 'Country'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    zipcode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    company_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    paye_reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    pension_provider?: string;

    @IsOptional()
    is_sponsor_licence?: boolean;

    @IsOptional()
    @IsBoolean()
    is_subscribe?: boolean;

    @IsOptional()
    @IsString()
    status?: ENUM_COMPANY_STATUS;

    // ── India export compliance ──
    @IsOptional() @IsString() @MaxLength(20) iec?: string;
    @IsOptional() @IsString() @MaxLength(50) lut_no?: string;
    @IsOptional() @IsDateString() lut_date?: string;
    @IsOptional() @IsString() @MaxLength(21) cin?: string;

    // ── PFI / export-document defaults ──
    @IsOptional() @IsString() @MaxLength(150) default_port_of_loading?: string;
    @IsOptional() @IsUUID() default_port_of_loading_id?: string;
    @IsOptional() default_port_of_loading_snapshot?: any;
    @IsOptional() @IsString() @MaxLength(4000) default_declaration_text?: string;

    // ── PO defaults ──
    // `default_po_delivery_address` retired — see refactor plan.
    @IsOptional() @IsString() @MaxLength(4000) default_terms?: string;

    @IsOptional() @IsString() @MaxLength(4000) default_remarks?: string;
    @IsOptional() @IsString() @MaxLength(150) authorised_signatory_name?: string;
    @IsOptional() @IsString() @MaxLength(255) footer_address?: string;

    // ── Multi-address ──
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CompanyAddressRequestDto)
    addresses?: CompanyAddressRequestDto[];

    // ── Multi-bank ──
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CompanyBankAccountRequestDto)
    bank_accounts?: CompanyBankAccountRequestDto[];
}