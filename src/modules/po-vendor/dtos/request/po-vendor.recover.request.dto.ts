import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Single line assignment in a recover-from-PO batch.
 * vendor_id can differ from po_line.vendor_id — in that case the PO line's
 * vendor_id is updated to match (line is re-assigned).
 */
export class PoVendorRecoverAssignmentDto {
    @ApiProperty({ required: true, type: String })
    @IsString()
    @IsNotEmpty()
    purchase_order_line_id: string;

    @ApiProperty({ required: true, type: String })
    @IsString()
    @IsNotEmpty()
    vendor_id: string;

    // Optional GST% override. Defaults from the product/HSN master when omitted;
    // sent when the operator edits the GST % column on the generate-POV screen.
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;

    /**
     * Optional quantity override for the spawned POV line. Sent only when the
     * operator edits the "To Procure" column on the generate-POV screen. When
     * omitted, the service computes the qty as pending − free stock (the default
     * auto-deduct behaviour). May exceed the SO line's pending qty (deliberate
     * over-procurement); the service flags such lines so the over-shipment guard
     * is bypassed for them.
     */
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsOptional()
    ordered_qty?: string;

    /**
     * Optional unit-price override (INR) for the spawned POV line. Sent when the
     * operator edits the Rate column on the generate-POV screen — the client
     * enters it in the vendor's currency and converts back to ₹. When omitted,
     * the service keeps its price-list → PO-line fallback.
     */
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    /** Optional per-line vendor discount % (applied before GST). Default 0. */
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    /**
     * Optional HSN override for the spawned POV line. Omitted when the operator
     * did not touch it, so the existing fallback chain (SO line → product
     * master) still applies.
     *
     * LOCAL to this POV: neither the Sales Order line nor the product master is
     * written back, because a line can legitimately be classified differently
     * on the vendor-facing document.
     */
    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    hsn_code?: string;
}

/**
 * Per-vendor expense pick (charge) attached to the spawned POV. Mirrors the
 * shape used by the quotation → SO generate flow.
 */
export class PoVendorRecoverExpensePickDto {
    @ApiProperty({ required: true, type: String })
    @IsUUID()
    @IsNotEmpty()
    expense_id: string;

    @ApiProperty({ required: false, enum: ['percent', 'fixed'] })
    @IsIn(['percent', 'fixed'])
    @IsOptional()
    type?: 'percent' | 'fixed';

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'value must be a numeric string' })
    @IsOptional()
    value?: string;

    /** Per-charge GST % — carried into the spawned POV's expenses_snapshot. */
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'gst_pct must be a numeric string' })
    @IsOptional()
    gst_pct?: string;
}

/**
 * Optional advance paid to a vendor, recorded against that vendor's spawned
 * POV at creation. Mirrors the Payments tab fields.
 */
export class PoVendorRecoverAdvanceDto {
    @ApiProperty({ required: false, type: String })
    @IsDateString()
    @IsOptional()
    payment_date?: string;

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsOptional()
    amount?: string;

    /** Company bank account the advance was paid from. */
    @ApiProperty({ required: false, type: String })
    @IsUUID()
    @IsOptional()
    company_bank_account_id?: string;

    /** TDS on the advance (Gross → TDS → Net). Optional; omit for no TDS. */
    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    tds_section?: string;

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'tds_rate_pct must be a numeric string' })
    @IsOptional()
    tds_rate_pct?: string;

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'tds_amount must be a numeric string' })
    @IsOptional()
    tds_amount?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    invoice_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    notes?: string;
}

/**
 * Per-vendor terms typed on the Generate-POV screen, stamped onto that
 * vendor's spawned POV and printed on its PDF. Free text — the POV's terms are
 * the vendor's, not the parent Sales Order's (those are the customer's).
 */
export class PoVendorRecoverTermsDto {
    /** Vendor's invoice number — optional; stamped on the spawned POV header. */
    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    invoice_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    dispatched_through?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    payment_terms?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    delivery_terms?: string;
}

/**
 * Per-vendor display currency for that vendor's spawned POV. Amounts stay
 * stored in INR; currency + rate only drive view/PDF rendering, mirroring
 * Quotation/SO. Each vendor's POV can be in a different currency; omit to
 * fall back to the source Sales Order's currency.
 */
export class PoVendorRecoverCurrencyDto {
    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    currency_code?: string;

    /** Foreign-per-₹1 rate for `currency_code`. Forced to 1 for home. */
    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;
}

/**
 * Batch recover request — used by `POST /admin/po-vendor/recover/:poId`.
 * Groups assignments by vendor_id and spawns one POV per vendor in a
 * single logical operation.
 */
export class PoVendorRecoverRequestDto {
    @ApiProperty({ required: true, type: [PoVendorRecoverAssignmentDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorRecoverAssignmentDto)
    assignments: PoVendorRecoverAssignmentDto[];

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    delivery_address_id?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    delivery_address?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    internal_notes?: string;

    /** Per-vendor display currency + rate. Key = vendor_id (UUID). Each
     *  spawned POV can be in its own currency; a vendor omitted here falls
     *  back to the source Sales Order's currency. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_currencies?: Record<string, PoVendorRecoverCurrencyDto>;

    /** Optional per-vendor expense list applied to each spawned POV.
     *  Key = vendor_id (UUID), value = array of expense picks. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_expenses?: Record<string, PoVendorRecoverExpensePickDto[]>;

    /** Optional per-vendor advance paid, recorded on each spawned POV.
     *  Key = vendor_id (UUID). */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_advances?: Record<string, PoVendorRecoverAdvanceDto>;

    /** Per-vendor deliver-to location — ShivaTrade's receiving location (a
     *  Locations-master id) where that vendor's goods land. Becomes the
     *  spawned POV's `delivery_address_id`, which the GRN propagates to the
     *  stock ledger (`grn_in.location_id`) so on-hand is location-scoped.
     *  Key = vendor_id (UUID), value = location id. The UI fills it per
     *  vendor (auto-selected to the default location); the service falls
     *  back to the company default so a POV is never created location-less. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_delivery_locations?: Record<string, string>;

    /** Per-vendor terms stamped onto each spawned POV. Key = vendor_id. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_terms?: Record<string, PoVendorRecoverTermsDto>;
}
