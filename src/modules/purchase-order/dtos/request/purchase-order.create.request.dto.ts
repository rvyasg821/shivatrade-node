import { Type, Transform } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ENUM_PURCHASE_ORDER_STATUS } from '../../enums/purchase-order.enum';

export class PurchaseOrderLineCreateDto {
    /** Present on update to keep the line's UUID stable. Omitted for new lines. */
    @IsUUID()
    @IsOptional()
    _id?: string;

    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsUUID()
    @IsOptional()
    source_quotation_line_id?: string;

    @IsUUID()
    @IsOptional()
    source_pfi_line_id?: string;

    /** Planned vendor for this line. PO is multi-vendor at line level. */
    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    customer_reference?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    part_no?: string;

    @IsString()
    @IsOptional()
    @MaxLength(15)
    hsn_code?: string;

    @IsNumberString({}, { message: 'qty must be a numeric string' })
    @IsNotEmpty()
    qty: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    unit?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsNotEmpty()
    unit_price: string;

    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;

    /** Per-line freight override (CNF). Empty/omitted = qty auto-split. */
    @IsOptional()
    freight?: string;

    // Costing worksheet inputs — the per-line margin and the expense/rebate
    // heads. These were previously absent from the DTO, so the global
    // whitelist stripped them and the SO recompute always saw margin_pct = 0
    // (the costing worksheet's margin/expenses/rebates never persisted). The
    // service recomputes margin_amount / expenses_amount / rebates_amount from
    // these raw inputs (see PurchaseOrderService.recompute()).
    @IsNumberString({}, { message: 'margin_pct must be a numeric string' })
    @IsOptional()
    margin_pct?: string;

    @IsArray()
    @IsOptional()
    product_rebates_snapshot?: Array<{
        rebate_id?: string | null;
        code?: string;
        name?: string;
        type: string;
        pct: string;
    }>;

    @IsArray()
    @IsOptional()
    product_expenses_snapshot?: Array<{
        expense_id?: string | null;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    @IsInt()
    @Min(0)
    @IsOptional()
    seq?: number;

    // Export / packing snapshot (carried from quotation/PFI line, editable in
    // the costing worksheet). Persisted by the service + flows into the invoice.
    @IsNumberString({}, { message: 'net_weight_kg must be a numeric string' })
    @IsOptional()
    net_weight_kg?: string;

    @IsNumberString({}, { message: 'gross_weight_kg must be a numeric string' })
    @IsOptional()
    gross_weight_kg?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    package_count?: number;
}

export class PurchaseOrderCreateRequestDto {
    /** Legacy header-level vendor. Kept optional for back-compat; new POs
     *  leave this null and store vendor per line instead. */
    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    @IsUUID()
    @IsOptional()
    customer_id?: string;

    @IsUUID()
    @IsOptional()
    customer_address_id?: string;

    // ── Consignee (Ship-to) — hybrid FK + snapshot ──
    @IsUUID()
    @IsOptional()
    consignee_id?: string;

    @IsBoolean()
    @IsOptional()
    consignee_same_as_buyer?: boolean;

    @IsUUID()
    @IsOptional()
    consignee_address_id?: string;

    @IsOptional()
    consignee_snapshot?: {
        name?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
    };

    @IsUUID()
    @IsOptional()
    quotation_id?: string;

    @IsUUID()
    @IsOptional()
    pfi_id?: string;

    @IsDateString()
    @IsNotEmpty()
    po_date: string;

    @IsDateString()
    @IsOptional()
    expected_delivery_date?: string;

    // ── Customer order reference + advance (S4) ──
    @IsString()
    @IsOptional()
    @MaxLength(100)
    customer_po_number?: string;

    /** Manual alphanumeric tracking reference (free text, optional). Distinct
     *  from the system voucher_no and from the buyer's customer_po_number. */
    @IsString()
    @IsOptional()
    @MaxLength(100)
    reference_no?: string;

    @IsNumberString({}, { message: 'advance_amount must be a numeric string' })
    @IsOptional()
    advance_amount?: string;

    @IsDateString()
    @IsOptional()
    advance_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    advance_notes?: string;

    /** Company bank account the advance was received into + a name snapshot. */
    @IsUUID()
    @IsOptional()
    advance_bank_account_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    advance_bank_name?: string;

    /** Free-text snapshot. Optional — if omitted, server resolves from
     *  `delivery_address_id` (preferred) or rejects. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Preferred: pick a company_addresses._id; server snapshots text. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    delivery_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    dispatched_through?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsString()
    @IsOptional()
    @MaxLength(4000)
    remarks?: string;

    @IsString()
    @IsOptional()
    @Matches(/^[A-Z]{3}$/, {
        message: 'currency_code must be 3 uppercase letters (e.g. INR)',
    })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value
    )
    currency_code?: string;

    /** Vendor (buy) currency — one per document (multi-currency rule). */
    @IsString()
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value
    )
    vendor_currency_code?: string;

    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;

    /** Shipment freight (document currency) for a CNF sales order. Passed
     *  through verbatim; split by qty at display time. Whitelist requires this
     *  to be declared or the global ValidationPipe strips it. */
    @IsNumberString({}, { message: 'freight_total must be a numeric string' })
    @IsOptional()
    freight_total?: string;

    @IsEnum(ENUM_PURCHASE_ORDER_STATUS)
    @IsOptional()
    status?: ENUM_PURCHASE_ORDER_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderLineCreateDto)
    @IsOptional()
    lines?: PurchaseOrderLineCreateDto[];
}
