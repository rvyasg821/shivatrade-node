import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsUUID,
    IsBoolean,
    IsArray,
    IsEmail,
    IsObject,
    MaxLength,
    ValidateNested,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_VENDOR_ADDRESS_TYPE,
    ENUM_VENDOR_BANK_ACCOUNT_TYPE,
    ENUM_VENDOR_STATUS,
} from '@modules/vendor/enums/vendor.enum';

export class VendorSocialMediaDto {
    @IsString()
    @IsOptional()
    @MaxLength(500)
    linkedin?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    facebook?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    instagram?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    twitter?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    other?: string;
}

export class VendorContactRequestDto {
    @IsString()
    @IsOptional()
    _id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    name?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    designation?: string;

    // Email is optional; format-checked only when a non-empty value is supplied.
    // A vendor may have a contact with no email (it simply gets no portal login).
    @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
    @IsEmail()
    @IsOptional()
    @MaxLength(200)
    email?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    phone?: string;

    @IsObject()
    @IsOptional()
    country_code?: { code: string; dialCode: string };

    @IsBoolean()
    @IsOptional()
    is_primary?: boolean;
}

export class VendorBankAccountRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsString() @IsNotEmpty() @MaxLength(200) bank_name: string;
    @IsString() @IsOptional() @MaxLength(200) account_holder_name?: string;
    @IsString() @IsNotEmpty() @MaxLength(50) account_number: string;

    @IsString() @IsOptional() @MaxLength(11) ifsc?: string;
    @IsString() @IsOptional() @MaxLength(11) swift_code?: string;
    @IsString() @IsOptional() @MaxLength(34) iban?: string;

    @IsUUID() currency_id: string;

    @IsString() @IsOptional() @MaxLength(200) branch_name?: string;
    @IsString() @IsOptional() @MaxLength(500) branch_address?: string;

    @IsEnum(ENUM_VENDOR_BANK_ACCOUNT_TYPE) @IsOptional()
    account_type?: ENUM_VENDOR_BANK_ACCOUNT_TYPE;

    @IsBoolean() @IsOptional() is_default?: boolean;

    @IsString() @IsOptional() notes?: string;

    @IsBoolean() @IsOptional() is_active?: boolean;
}

export class VendorAddressRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsEnum(ENUM_VENDOR_ADDRESS_TYPE) @IsOptional()
    type?: ENUM_VENDOR_ADDRESS_TYPE;

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

export class VendorCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    company_name: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    website?: string;

    @ValidateNested()
    @Type(() => VendorSocialMediaDto)
    @IsObject()
    @IsOptional()
    social_media?: VendorSocialMediaDto;

    @IsArray()
    @IsOptional()
    @IsUUID('4', { each: true })
    category_ids?: string[];

    @IsArray()
    @IsOptional()
    @IsUUID('4', { each: true })
    product_category_ids?: string[];

    // ── Tax & Compliance (all optional) ──
    @IsString() @IsOptional() @MaxLength(15) gstin?: string;
    @IsString() @IsOptional() @MaxLength(10) pan?: string;
    @IsString() @IsOptional() @MaxLength(50) vendor_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    incoterms?: string;

    // Preferred transaction currency (ISO code, e.g. "USD") — auto-selected on
    // this vendor's Vendor POs. Optional; blank falls back to INR.
    @IsString()
    @IsOptional()
    @MaxLength(10)
    currency_code?: string;

    /** Migration opening balance (vendor currency); 'credit' = we already owe. */
    @IsOptional()
    opening_balance?: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    opening_balance_type?: string;

    @IsString()
    @IsOptional()
    opening_balance_date?: string;

    @IsEnum(ENUM_VENDOR_STATUS)
    @IsOptional()
    status?: ENUM_VENDOR_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    // Contacts are optional — a vendor may be created with only a company_name.
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => VendorContactRequestDto)
    contacts?: VendorContactRequestDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VendorAddressRequestDto)
    @IsOptional()
    addresses?: VendorAddressRequestDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VendorBankAccountRequestDto)
    @IsOptional()
    bank_accounts?: VendorBankAccountRequestDto[];
}
