import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    IsEmail,
    IsObject,
    MaxLength,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_CUSTOMER_ADDRESS_TYPE,
    ENUM_CUSTOMER_STATUS,
} from '@modules/customer/enums/customer.enum';

export class CustomerSocialMediaDto {
    @IsString() @IsOptional() @MaxLength(500) linkedin?: string;
    @IsString() @IsOptional() @MaxLength(500) facebook?: string;
    @IsString() @IsOptional() @MaxLength(500) instagram?: string;
    @IsString() @IsOptional() @MaxLength(500) twitter?: string;
    @IsString() @IsOptional() @MaxLength(500) other?: string;
}

export class CustomerContactRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsString() @IsNotEmpty() @MaxLength(150) name: string;

    @IsString() @IsOptional() @MaxLength(100) designation?: string;

    @IsEmail() @IsNotEmpty() @MaxLength(200) email: string;

    @IsString() @IsOptional() @MaxLength(50) phone?: string;

    @IsObject() @IsOptional() country_code?: { code: string; dialCode: string };

    @IsBoolean() @IsOptional() is_primary?: boolean;
}

export class CustomerAddressRequestDto {
    @IsString() @IsOptional() _id?: string;

    @IsEnum(ENUM_CUSTOMER_ADDRESS_TYPE) @IsOptional()
    type?: ENUM_CUSTOMER_ADDRESS_TYPE;

    @IsString() @IsOptional() @MaxLength(150) label?: string;

    @IsString() @IsOptional() @MaxLength(200) address_line1?: string;
    @IsString() @IsOptional() @MaxLength(200) address_line2?: string;
    @IsString() @IsOptional() @MaxLength(100) city?: string;
    @IsString() @IsOptional() @MaxLength(100) state?: string;
    @IsString() @IsOptional() @MaxLength(100) country?: string;
    @IsString() @IsOptional() @MaxLength(20) postcode?: string;

    // Accepts GSTIN (India, 15 chars) and any foreign equivalent (VAT, TRN,
    // EU VAT id, etc.). Length raised to 30 to fit prefixed EU VAT numbers
    // and other international tax identifiers.
    @IsString() @IsOptional() @MaxLength(30) gstin?: string;
    @IsString() @IsOptional() @MaxLength(20) iec?: string;

    @IsBoolean() @IsOptional() is_default?: boolean;
}

export class CustomerCreateRequestDto {
    @IsString() @IsNotEmpty() @MaxLength(200) company_name: string;

    @IsString() @IsOptional() @MaxLength(500) website?: string;

    @ValidateNested()
    @Type(() => CustomerSocialMediaDto)
    @IsObject()
    @IsOptional()
    social_media?: CustomerSocialMediaDto;

    // ── Tax & Compliance (root level, all optional) ──
    // gstin column also accepts VAT / TRN / Tax ID for non-Indian customers.
    // pan column also accepts Trade License / CR / EIN / company registration
    // for non-Indian customers — relabelled in UI as "Business Registration #".
    @IsString() @IsOptional() @MaxLength(30) gstin?: string;
    @IsString() @IsOptional() @MaxLength(30) pan?: string;
    @IsString() @IsOptional() @MaxLength(20) iec?: string;

    @IsEnum(ENUM_CUSTOMER_STATUS) @IsOptional() status?: ENUM_CUSTOMER_STATUS;

    @IsBoolean() @IsOptional() is_active?: boolean;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CustomerContactRequestDto)
    contacts: CustomerContactRequestDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CustomerAddressRequestDto)
    @IsOptional()
    addresses?: CustomerAddressRequestDto[];
}
