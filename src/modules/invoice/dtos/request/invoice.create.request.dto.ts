import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_INVOICE_TYPE,
} from '@modules/invoice/enums/invoice.enum';

export class InvoiceLineDto {
    @IsUUID()
    @IsOptional()
    _id?: string;

    @IsUUID()
    @IsNotEmpty()
    purchase_order_line_id: string;

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

    @IsNumberString()
    @IsOptional()
    discount_pct?: string;

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

    // Source linkage
    @IsUUID()
    @IsNotEmpty()
    purchase_order_id: string;

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

    @IsUUID()
    @IsNotEmpty()
    consignee_id: string;

    @IsUUID()
    @IsOptional()
    consignee_address_id?: string;

    @IsUUID()
    @IsOptional()
    notify_party_id?: string;

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

    // Lines
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineDto)
    lines: InvoiceLineDto[];
}
