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
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ENUM_VENDOR_STATUS } from '@modules/vendor/enums/vendor.enum';

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
    @IsNotEmpty()
    @MaxLength(150)
    name: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    designation?: string;

    @IsEmail()
    @IsNotEmpty()
    @MaxLength(200)
    email: string;

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
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    category_ids: string[];

    @IsString()
    @IsOptional()
    @MaxLength(50)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    incoterms?: string;

    // Address (all optional)
    @IsString()
    @IsOptional()
    @MaxLength(200)
    address_line1?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    address_line2?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    city?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    state?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    country?: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    postcode?: string;

    @IsEnum(ENUM_VENDOR_STATUS)
    @IsOptional()
    status?: ENUM_VENDOR_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => VendorContactRequestDto)
    contacts: VendorContactRequestDto[];
}
