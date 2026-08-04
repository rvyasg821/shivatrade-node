import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
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

/**
 * Per-vendor expense pick at POV creation. The server resolves
 * `expense_id` against the expense master to fill code/name, then
 * snapshots the row onto the POV (`expenses_snapshot`).
 */
export class PoVendorExpenseInputDto {
    @IsUUID()
    @IsNotEmpty()
    expense_id: string;

    /** Override; falls back to the master's type if omitted. */
    @IsIn(['percent', 'fixed'])
    @IsOptional()
    type?: 'percent' | 'fixed';

    /** Override; falls back to the master's value if omitted. */
    @IsNumberString({}, { message: 'value must be a numeric string' })
    @IsOptional()
    value?: string;

    /** Per-charge GST % (operator-entered). Charge master has no GST, so 0
     *  when omitted. Snapshotted onto the POV's expenses_snapshot. */
    @IsNumberString({}, { message: 'gst_pct must be a numeric string' })
    @IsOptional()
    gst_pct?: string;
}

/**
 * POV line — covers a single PO line by an `ordered_qty` quantity.
 * Backend validates `ordered_qty ≤ pending_qty` per PO line (POV plan §8).
 */
export class PoVendorLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    purchase_order_line_id: string;

    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsNotEmpty()
    ordered_qty: string;

    /** Optional override for POV-side (vendor / INR) unit price. When
     *  omitted the POV line inherits unit_price from the PO line, which
     *  is correct only when PO is in INR. PFI→PO uses customer currency
     *  on the PO, so the vendor's INR price must be passed explicitly. */
    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    /** Optional per-line vendor discount % (applied before GST). Default 0. */
    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    /**
     * Optional HSN override for this POV line. Omitted when the operator did
     * not touch it, so the PO line → product master fallback still applies.
     *
     * LOCAL to this POV: the Sales Order line and the product master are never
     * written back, because the vendor-facing document can legitimately carry a
     * different classification.
     */
    @IsString()
    @IsOptional()
    hsn_code?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    seq?: number;

    /**
     * When true, skip the `ordered_qty ≤ pending_qty` over-shipment guard (§8)
     * for this line. Set ONLY by the Generate-POV flow when the operator has
     * explicitly edited the "To Procure" quantity above what the Sales Order
     * still needs (deliberate over-procurement / MOQ). Standalone create and the
     * source-generation flow leave it unset, so the guard still holds there.
     */
    @IsBoolean()
    @IsOptional()
    allow_over_pending?: boolean;
}

/**
 * Body for `POST /admin/po-vendor/from-po/:poId` (POV plan §10).
 * As of 2026-05-21 the PO no longer carries a header-level vendor;
 * vendor lives on the PO line. The client now passes `vendor_id`
 * explicitly so the POV knows which vendor it's procuring from.
 * Vendor address auto-resolves to the vendor's default if not provided.
 */
export class PoVendorCreateRequestDto {
    /** Vendor for this POV. Required — POs are multi-vendor at line level. */
    @IsUUID()
    @IsNotEmpty()
    vendor_id: string;

    /** Vendor's invoice number — optional free text. */
    @IsString()
    @IsOptional()
    @MaxLength(120)
    invoice_number?: string;

    /** Optional vendor address; defaults to the vendor's default bill-from. */
    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    /** Free-text snapshot override. Wins over `delivery_address_id`
     *  and the inherited PO snapshot when filled. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Pick a company_addresses._id; server snapshots text. Wins over
     *  inherited PO snapshot when filled and `delivery_address` text
     *  is not. */
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
     *  only drive how the POV renders (view / PDF). Defaults to the source
     *  Sales Order's currency; omit for the company home currency. */
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

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineCreateDto)
    lines: PoVendorLineCreateDto[];

    /** Optional vendor-side charges (Packing, Transport, etc.) picked
     *  from the expense master. Server resolves code/name, computes
     *  per-row `amount`, and stores the snapshot. */
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PoVendorExpenseInputDto)
    expenses?: PoVendorExpenseInputDto[];
}
