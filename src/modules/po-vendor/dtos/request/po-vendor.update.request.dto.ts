import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ENUM_PO_VENDOR_STATUS } from '../../enums/po-vendor.enum';
import { PoVendorExpenseInputDto } from './po-vendor.create.request.dto';

/**
 * Per-line update payload. Editable fields depend on POV status
 * (POV plan §11). The service is the source of truth for the edit lock —
 * the DTO simply accepts everything and the service rejects what
 * cannot change at the current status.
 */
export class PoVendorLineUpdateDto {
    /** Existing POV line id when editing; omit to add a new line (draft only). */
    @IsUUID()
    @IsOptional()
    _id?: string;

    /** Required when adding a line (draft only). */
    @IsUUID()
    @IsOptional()
    purchase_order_line_id?: string;

    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsOptional()
    ordered_qty?: string;

    /**
     * GST rate for this line. DRAFT ONLY — the service refuses it at any other
     * status, because once the POV is dispatched the PDF is with the vendor and
     * changing the tax would make our copy disagree with theirs.
     *
     * The GST *amount* is never stored: `line_total` is qty × price with no tax
     * in it, and the PDF derives GST from this rate at render time. So updating
     * the rate is all that is needed — every downstream figure follows.
     */
    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;
}

/**
 * Targeted GST-rate edit for lines that ALREADY EXIST on a draft POV.
 *
 * Deliberately separate from `lines`: that path is a wholesale replace — it
 * DELETES every POV line and recreates them — and it requires a
 * `purchase_order_line_id`, which standalone POV lines do not have (the column
 * is nullable). Reusing it to change one number would destroy and rebuild the
 * lines, and would fail outright on a standalone POV.
 *
 * This patches `tax_pct` in place, keyed by the POV line's own `_id`.
 */
export class PoVendorLineTaxUpdateDto {
    /** The POV line's own id — always present, unlike purchase_order_line_id. */
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    /** GST rate. DRAFT only — frozen once the PDF is with the vendor. */
    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;

    /**
     * Vendor rate. Editable in DRAFT and — because suppliers revise rates after
     * the PO has gone out — in DISPATCHED too, but only while no GRN exists
     * (once goods are received the cost is baked into stock valuation).
     * The service recomputes line_total, the % vendor charges and the payment
     * status from it.
     */
    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    /**
     * Ordered quantity for the line. DRAFT only — once the PO is with the vendor
     * the quantity is committed (and a GRN would cost it into stock), so it is
     * frozen alongside HSN/GST. Blank = not sent; a value re-derives line_total,
     * vendor charges and the payable.
     */
    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsOptional()
    ordered_qty?: string;

    /**
     * HSN and part number. DRAFT only — both print on the vendor PDF, so they
     * are frozen for the same reason the header terms are.
     *
     * An empty string is a real value here (clear the field), which is why they
     * are plain optional strings rather than being skipped when falsy.
     */
    @IsString()
    @IsOptional()
    hsn_code?: string;

    @IsString()
    @IsOptional()
    part_no?: string;
}

export class PoVendorUpdateRequestDto {
    // ── Editable in DRAFT only ──────────────────────────────────────────

    /** GST rates for existing lines. Draft only — see PoVendorLineTaxUpdateDto. */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineTaxUpdateDto)
    @IsOptional()
    line_taxes?: PoVendorLineTaxUpdateDto[];

    /**
     * In-place per-line edits (rate and/or GST rate) keyed by the POV line's own
     * `_id`. Same shape as `line_taxes`, which it supersedes — both are still
     * accepted so an older client keeps working. Unlike `lines` this never
     * deletes/recreates rows and needs no `purchase_order_line_id`, so it works
     * on a STANDALONE POV too.
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineTaxUpdateDto)
    @IsOptional()
    line_edits?: PoVendorLineTaxUpdateDto[];

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Location id (or legacy company_address id) to re-snapshot from. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    // ── Vendor terms printed on the POV PDF (free text, draft only) ──
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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineUpdateDto)
    @IsOptional()
    lines?: PoVendorLineUpdateDto[];

    // ── Editable in DRAFT + DISPATCHED ──────────────────────────────────
    @IsDateString()
    @IsOptional()
    expected_arrival_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    transporter_name?: string;

    @IsString()
    @IsOptional()
    @MaxLength(40)
    vehicle_no?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    lr_no?: string;

    @IsDateString()
    @IsOptional()
    lr_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(40)
    eway_bill_no?: string;

    @IsDateString()
    @IsOptional()
    eway_bill_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    // ── Always editable ─────────────────────────────────────────────────
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    /** Replace the vendor-charges list. When provided, fully overrides
     *  the existing snapshot — the service resolves master fields and
     *  recomputes amounts. Editable only while POV is in `draft`. */
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PoVendorExpenseInputDto)
    expenses?: PoVendorExpenseInputDto[];

    // ── Status transitions (service enforces transition map) ────────────
    @IsEnum(ENUM_PO_VENDOR_STATUS)
    @IsOptional()
    status?: ENUM_PO_VENDOR_STATUS;
}
