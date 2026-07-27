import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    IsEmail,
    IsObject,
    IsNumber,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_LEAD_SOURCE,
    ENUM_LEAD_STATUS,
} from '@modules/lead/enums/lead.enum';
import { LeadLineRequestDto } from './lead-line.request.dto';

export class LeadCreateRequestDto {
    @IsUUID() @IsOptional() customer_id?: string;

    /** Manual alphanumeric tracking reference (free text, optional). */
    @IsString() @IsOptional() @MaxLength(100) reference_no?: string;

    @IsString() @IsNotEmpty() @MaxLength(200) company_name: string;

    @IsString() @IsNotEmpty() @MaxLength(150) contact_name: string;
    @IsEmail() @IsNotEmpty() @MaxLength(200) contact_email: string;
    @IsString() @IsOptional() @MaxLength(50) contact_phone?: string;

    @IsObject() @IsOptional() country_code?: { code: string; dialCode: string };

    @IsEnum(ENUM_LEAD_SOURCE) @IsOptional() source?: ENUM_LEAD_SOURCE;

    @IsArray()
    @IsOptional()
    @IsUUID('all', { each: true })
    interested_categories?: string[];

    @IsArray() @IsOptional() @IsUUID('all', { each: true })
    interested_products?: string[];

    // Requirement line items (replaces interested_categories/products UI).
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => LeadLineRequestDto)
    lines?: LeadLineRequestDto[];

    @IsNumber() @IsOptional() expected_value?: number;
    @IsString() @IsOptional() @MaxLength(10) currency?: string;

    @IsString() @IsOptional() @MaxLength(300) website_url?: string;
    @IsObject() @IsOptional() social_media_urls?: Record<string, string>;
    @IsString() @IsOptional() @MaxLength(200) quantity?: string;
    @IsString() @IsOptional() @MaxLength(200) delivery_expectation?: string;

    @IsArray() @IsOptional() @IsUUID('all', { each: true })
    preferred_vendors?: string[];

    @IsString() @IsOptional() follow_up_date?: string;

    @IsUUID() @IsOptional() assigned_to?: string;

    @IsString() @IsOptional() description?: string;

    @IsString() @IsOptional() @MaxLength(200) address_line1?: string;
    @IsString() @IsOptional() @MaxLength(200) address_line2?: string;
    @IsString() @IsOptional() @MaxLength(100) city?: string;
    @IsString() @IsOptional() @MaxLength(100) state?: string;
    @IsString() @IsOptional() @MaxLength(100) country?: string;
    @IsString() @IsOptional() @MaxLength(20) postcode?: string;

    @IsEnum(ENUM_LEAD_STATUS) @IsOptional() status?: ENUM_LEAD_STATUS;

    @IsBoolean() @IsOptional() is_active?: boolean;
}
