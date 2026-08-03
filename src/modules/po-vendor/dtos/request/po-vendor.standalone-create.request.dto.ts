import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
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
 * Optional advance payment recorded against the new standalone POV at
 * creation time (advance paid to the vendor). Mirrors the Payments tab
 * fields; recorded as a normal vendor payment so it appears in the
 * Payments tab + timeline with a PV voucher.
 */
export class PoVendorAdvanceInputDto {
    @IsDateString()
    @IsOptional()
    payment_date?: string;

    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsOptional()
    amount?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    invoice_number?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;
}

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

    /** Optional per-line vendor discount % (applied before GST). Default 0. */
    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    part_no?: string;

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

    // ── Multi-currency (mirrors Quotation/SO) ────────────────────────
    /** POV display currency. Amounts stay stored in INR; this + the rate
     *  only drive how the POV renders (view / PDF). Omit for home. */
    @IsString()
    @IsOptional()
    @MaxLength(10)
    currency_code?: string;

    /** Foreign-per-₹1 rate for `currency_code`. Forced to 1 for home. */
    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;

    // ── Vendor terms printed on the POV PDF (free text) ──────────────
    @IsString()
    @IsOptional()
    @MaxLength(150)
    dispatched_through?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(1000)
    delivery_terms?: string;

    /** Optional: link this standalone POV to one or more Sales Orders (their
     *  `_id`s) for traceability. Server validates each belongs to the company
     *  and snapshots its voucher_no onto the POV header. */
    @IsArray()
    @IsOptional()
    @IsUUID('all', { each: true })
    linked_sales_order_ids?: string[];

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

    /** Optional advance paid to the vendor, recorded as a payment on create. */
    @IsOptional()
    @ValidateNested()
    @Type(() => PoVendorAdvanceInputDto)
    advance?: PoVendorAdvanceInputDto;
}
