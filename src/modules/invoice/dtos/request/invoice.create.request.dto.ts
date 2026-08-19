import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_INVOICE_TYPE,
    ENUM_SHIPPING_BILL_TYPE,
    ENUM_SHIPPING_MODE,
} from '@modules/invoice/enums/invoice.enum';

export class InvoiceLineDto {
    @IsUUID()
    @IsOptional()
    _id?: string;

    // Optional: a from-stock / imported / manual invoice line has no source SO
    // line. Validated as a UUID only when present + non-empty; empty or omitted
    // is accepted (the service treats it as a from-stock line — the SO qty guard
    // and source-PO snapshot both skip null purchase_order_line_id).
    @ValidateIf(
        (o) =>
            o.purchase_order_line_id !== undefined &&
            o.purchase_order_line_id !== null &&
            o.purchase_order_line_id !== '',
    )
    @IsUUID()
    @IsOptional()
    purchase_order_line_id?: string;

    @IsUUID()
    @IsOptional()
    po_vendor_line_id?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    seq?: number;

    // Product snapshot (most clients send IDs; service fills name/code/hsn from product master)
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    product_name?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    product_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    part_no?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    hsn_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    customer_reference?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    unit: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    uqc_code?: string;

    @IsNumberString()
    @IsNotEmpty()
    qty: string;

    @IsNumberString()
    @IsNotEmpty()
    unit_price: string;

    /** Multi-currency: native currency of unit_price (vendor/source) + frozen
     *  source→document rate (cost_doc = unit_price × cost_exchange_rate). */
    @IsString()
    @IsOptional()
    source_currency_code?: string;

    @IsNumberString()
    @IsOptional()
    cost_exchange_rate?: string;

    @IsNumberString()
    @IsOptional()
    discount_pct?: string;

    /** Per-line margin %, carried from the source Quotation/PO line. */
    @IsNumberString()
    @IsOptional()
    margin_pct?: string;

    @IsNumberString()
    @IsOptional()
    tax_pct?: string;

    /** HSN-derived IGST rate for refund-footer bucketing. */
    @IsNumberString()
    @IsOptional()
    igst_rate_pct?: string;

    /** Per-line rebates / expenses snapshot — same shape as PFI/PO lines.
     *  Skipped validation (any[]) since the snapshot is opaque jsonb at the
     *  Invoice layer; the upstream Q/PFI/PO is the source-of-truth schema. */
    @IsOptional()
    product_rebates_snapshot?: any;

    @IsOptional()
    product_expenses_snapshot?: any;

    // ── Packing List (per-line; SHIPPING_INVOICE_MERGE_PLAN §3b) ──
    @IsInt()
    @Min(0)
    @IsOptional()
    packages?: number;

    @IsNumberString()
    @IsOptional()
    net_weight?: string;

    @IsNumberString()
    @IsOptional()
    gross_weight?: string;

    // purchase_order_voucher_no / quotation_voucher_no are snapshotted
    // server-side from the source PO at create (not trusted from the client).
}

export class InvoiceBankSnapshotDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    account_no: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    beneficiary?: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    ad_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    swift_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    branch?: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    currency_code?: string;
}

export class InvoiceCreateRequestDto {
    @IsEnum(ENUM_INVOICE_TYPE)
    @IsOptional()
    invoice_type?: ENUM_INVOICE_TYPE;

    @IsDateString()
    @IsNotEmpty()
    invoice_date: string;

    @IsDateString()
    @IsOptional()
    due_date?: string;

    // Source linkage. Optional "primary SO" pointer — real per-line linkage
    // is purchase_order_line_id (a multi-SO invoice may span several POs).
    // (SHIPPING_INVOICE_MERGE_PLAN §5c)
    @IsUUID()
    @IsOptional()
    purchase_order_id?: string;

    @IsUUID()
    @IsOptional()
    pfi_id?: string;

    @IsUUID()
    @IsOptional()
    quotation_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    customer_po_no?: string;

    /** Manual alphanumeric tracking reference. Defaults from the source Sales
     *  Order's reference_no on Generate Invoice; operator can override. */
    @IsString()
    @IsOptional()
    @MaxLength(100)
    reference_no?: string;

    // Destination snapshot (defaults from Customer/Consignee on backend if omitted)
    @IsString()
    @IsOptional()
    @MaxLength(80)
    country_of_destination?: string;

    @IsString()
    @IsOptional()
    @MaxLength(80)
    country_of_origin?: string;

    // Shipping
    @IsUUID()
    @IsOptional()
    shipping_id?: string;

    // Parties
    @IsUUID()
    @IsNotEmpty()
    customer_id: string;

    @IsUUID()
    @IsOptional()
    customer_address_id?: string;

    /** Optional FK — set when the operator picked "From Customer Master".
     *  When absent, consignee is purely free-text (ad-hoc third party). */
    @IsUUID()
    @IsOptional()
    consignee_id?: string;

    @IsUUID()
    @IsOptional()
    consignee_address_id?: string;

    /** Structured snapshot — primary source of truth for the PDF block.
     *  Mirrors customer_addresses shape so "Load from customer" can copy
     *  fields one-to-one. */
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
    notify_party_id?: string;

    /** Structured snapshot — same shape as consignee_snapshot. Pre-fills
     *  from a customer master pick when "From Customer Master" is used,
     *  otherwise typed directly. */
    @IsOptional()
    notify_party_snapshot?: {
        name?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
    };

    /** Picked company address (shipper). Service builds the snapshot from
     *  this id at save time; PDF reads from the frozen snapshot. */
    @IsUUID()
    @IsOptional()
    company_address_id?: string;

    @IsOptional()
    company_address_snapshot?: any;

    // Money
    @IsString()
    @IsNotEmpty()
    @MaxLength(10)
    currency_code: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    currency_symbol?: string;

    @IsNumberString()
    @IsOptional()
    exchange_rate?: string;

    @IsNumberString()
    @IsOptional()
    discount_total?: string;

    @IsNumberString()
    @IsOptional()
    freight_charges?: string;

    @IsNumberString()
    @IsOptional()
    insurance_charges?: string;

    @IsNumberString()
    @IsOptional()
    other_charges?: string;

    @IsNumberString()
    @IsOptional()
    advance_received?: string;

    // GST / compliance
    @IsEnum(ENUM_INVOICE_GST_ROUTE)
    @IsOptional()
    gst_route?: ENUM_INVOICE_GST_ROUTE;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    lut_no?: string;

    @IsDateString()
    @IsOptional()
    lut_date?: string;

    // Trade terms
    @IsString()
    @IsOptional()
    @MaxLength(20)
    incoterm?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    delivery_terms?: string;

    // DGFT
    @IsString()
    @IsOptional()
    @MaxLength(60)
    end_use_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    preferential_agreement?: string;

    // ── Shipment & Shipping Bill (SHIPPING_INVOICE_MERGE_PLAN §3a) ──
    // All optional at create; filled in Phase B and editable post-ISSUED.
    @IsEnum(ENUM_SHIPPING_MODE)
    @IsOptional()
    mode?: ENUM_SHIPPING_MODE;

    @IsEnum(ENUM_SHIPPING_BILL_TYPE)
    @IsOptional()
    shipping_bill_type?: ENUM_SHIPPING_BILL_TYPE;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    shipping_bill_no?: string;

    @IsDateString()
    @IsOptional()
    shipping_bill_date?: string;

    @IsUUID()
    @IsOptional()
    port_of_loading_id?: string;

    @IsOptional()
    port_of_loading_snapshot?: any;

    @IsUUID()
    @IsOptional()
    port_of_discharge_id?: string;

    @IsOptional()
    port_of_discharge_snapshot?: any;

    @IsString()
    @IsOptional()
    @MaxLength(80)
    pre_carriage_by?: string;

    @IsString()
    @IsOptional()
    @MaxLength(80)
    place_of_receipt?: string;

    @IsString()
    @IsOptional()
    @MaxLength(80)
    place_of_delivery?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    total_packages?: number;

    @IsNumberString()
    @IsOptional()
    net_weight_kg?: string;

    @IsNumberString()
    @IsOptional()
    gross_weight_kg?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    bl_awb_no?: string;

    // Banks
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => InvoiceBankSnapshotDto)
    bank_snapshots?: InvoiceBankSnapshotDto[];

    // Notes
    @IsString()
    @IsOptional()
    notes_to_buyer?: string;

    @IsString()
    @IsOptional()
    internal_notes?: string;

    @IsString()
    @IsOptional()
    declaration_text?: string;

    @IsString()
    @IsOptional()
    terms?: string;

    // Lines
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineDto)
    lines: InvoiceLineDto[];

    /** Save/issue despite a line being outside qty/price tolerance vs its
     *  source SO line (audit-stamped). */
    @IsBoolean()
    @IsOptional()
    override?: boolean;
}
