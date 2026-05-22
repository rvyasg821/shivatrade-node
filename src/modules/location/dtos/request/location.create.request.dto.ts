import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    IsNumber,
    MaxLength,
    IsObject,
    IsBoolean,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ENUM_LOCATION_STATUS } from '@modules/location/enums/location.enum';

export class BusinessHoursDto {
    @IsString()
    @IsNotEmpty()
    open: string; // "09:00"

    @IsString()
    @IsNotEmpty()
    close: string; // "17:00"

    @IsBoolean()
    @IsNotEmpty()
    is_closed: boolean;
}

export class WeeklyBusinessHoursDto {
    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    monday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    tuesday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    wednesday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    thursday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    friday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    saturday: BusinessHoursDto;

    @Type(() => BusinessHoursDto)
    @IsObject()
    @IsNotEmpty()
    sunday: BusinessHoursDto;
}

export class LocationCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    location_name: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    location_code: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    description?: string;

    // Contact Information
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    contact_name: string;

    @IsEmail()
    @IsNotEmpty()
    @MaxLength(200)
    email: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    mobile?: string;

    @IsObject()
    @IsOptional()
    country_code?: {
        code?: string;
        countryCode?: string;
        dialCode?: string;
        name?: string;
        number?: string;
        /** Human-readable national form, e.g. "7123 456789". */
        nationalNumber?: string;
        /** Human-readable international form, e.g. "+44 7123 456789". */
        internationalNumber?: string;
        country_flag?: string;
        format?: string;
    };

    @IsString()
    @IsOptional()
    @MaxLength(50)
    phone?: string;

    // Address
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
    @MaxLength(20)
    postcode?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    country?: string;

    // GPS Coordinates
    @IsNumber()
    @IsOptional()
    latitude?: number;

    @IsNumber()
    @IsOptional()
    longitude?: number;

    // Settings
    @IsString()
    @IsOptional()
    timezone?: string;

    @IsString()
    @IsOptional()
    @MaxLength(3)
    currency?: string;

    @Type(() => WeeklyBusinessHoursDto)
    @IsObject()
    @IsOptional()
    business_hours?: WeeklyBusinessHoursDto;

    // Notification Settings
    @IsString()
    @IsOptional()
    @MaxLength(200)
    notification_email?: string;

    @IsBoolean()
    @IsOptional()
    cc_company_admin?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    notification_email_cc?: string;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean;

    @IsEnum(ENUM_LOCATION_STATUS)
    @IsOptional()
    status?: ENUM_LOCATION_STATUS;
}
