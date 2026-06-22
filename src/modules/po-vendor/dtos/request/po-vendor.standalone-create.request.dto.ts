import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

import { PoVendorExpenseInputDto } from './po-vendor.create.request.dto';

/**
 * Standalone POV line — not tied to any PO line. Carries its own
 * product + quantity + vendor (INR) price. Descriptive fields
 * (description / HSN / unit / tax) fall back to the product master
 * when omitted.
 */
export class PoVendorStandaloneLineDto {
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsNotEmpty()
    ordered_qty: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsNotEmpty()
    unit_price: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    hsn_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    unit?: string;

    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    seq?: number;
}

/**
 * Body for `POST /admin/po-vendor/create` — a POV raised directly against
 * a vendor with no source Sales Order. Vendor + delivery address are still
 * required; the POV is in the company's home currency.
 */
export class PoVendorStandaloneCreateRequestDto {
    @IsUUID()
    @IsNotEmpty()
    vendor_id: string;

    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    /** Free-text snapshot override; wins over `delivery_address_id`. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Pick a location / company address; server snapshots its text. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorStandaloneLineDto)
    lines: PoVendorStandaloneLineDto[];

    /** Optional vendor-side charges picked from the expense master. */
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PoVendorExpenseInputDto)
    expenses?: PoVendorExpenseInputDto[];
}
