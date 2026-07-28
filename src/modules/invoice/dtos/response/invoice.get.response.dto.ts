import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_INVOICE_STATUS,
    ENUM_INVOICE_TYPE,
    ENUM_SHIPPING_BILL_TYPE,
    ENUM_SHIPPING_MODE,
} from '@modules/invoice/enums/invoice.enum';

export class InvoiceLineResponseDto {
    _id?: string;
    seq?: number;
    purchase_order_line_id?: string;
    po_vendor_line_id?: string;
    product_id?: string;
    product_name?: string;
    product_code?: string;
    part_no?: string;
    description?: string;
    hsn_code?: string;
    customer_reference?: string;
    unit?: string;
    uqc_code?: string;
    qty?: string;
    unit_price?: string;
    discount_pct?: string;
    margin_pct?: string;
    tax_pct?: string;
    taxable_amount?: string;
    cgst_amount?: string;
    sgst_amount?: string;
    igst_amount?: string;
    line_total?: string;
    igst_rate_pct?: string;
    product_rebates_snapshot?: any;
    product_expenses_snapshot?: any;

    // Packing List (§3b)
    packages?: number;
    net_weight?: string;
    gross_weight?: string;
    // Source-doc voucher snapshots
    purchase_order_voucher_no?: string;
    quotation_voucher_no?: string;
}

export class InvoiceGetResponseDto {
    _id?: string;
    company_id?: string;
    voucher_no?: string;
    invoice_type?: ENUM_INVOICE_TYPE;
    status?: ENUM_INVOICE_STATUS;
    invoice_date?: string;
    due_date?: string;

    // Source
    purchase_order_id?: string;
    purchase_order_voucher_no?: string;
    pfi_id?: string;
    pfi_voucher_no?: string;
    quotation_id?: string;
    quotation_voucher_no?: string;
    customer_po_no?: string;
    reference_no?: string;
    /** Distinct reference numbers across every source SO + the invoice's own —
     *  a comma-joined list for multi-SO invoices (same as the PDFs). */
    reference_nos?: string;

    // Destination
    country_of_destination?: string;
    country_of_origin?: string;

    // Shipping
    shipping_id?: string;
    shipping_voucher_no?: string;

    // Shipment & Shipping Bill (§3a)
    mode?: ENUM_SHIPPING_MODE;
    shipping_bill_type?: ENUM_SHIPPING_BILL_TYPE;
    shipping_bill_no?: string;
    shipping_bill_date?: string;
    port_of_loading_id?: string;
    port_of_loading_snapshot?: any;
    port_of_discharge_id?: string;
    port_of_discharge_snapshot?: any;
    pre_carriage_by?: string;
    place_of_receipt?: string;
    place_of_delivery?: string;
    total_packages?: number;
    net_weight_kg?: string;
    gross_weight_kg?: string;
    bl_awb_no?: string;

    // Parties
    customer_id?: string;
    customer_address_id?: string;
    customer_snapshot?: any;
    consignee_id?: string;
    consignee_address_id?: string;
    consignee_snapshot?: any;
    notify_party_id?: string;
    notify_party_snapshot?: any;
    company_address_id?: string;
    company_address_snapshot?: any;

    // Money
    currency_code?: string;
    currency_symbol?: string;
    exchange_rate?: string;
    subtotal?: string;
    discount_total?: string;
    fob_value?: string;
    freight_charges?: string;
    insurance_charges?: string;
    other_charges?: string;
    grand_total?: string;
    grand_total_inr?: string;
    amount_in_words?: string;
    advance_received?: string;
    /** Net effect of linked Adjustment Notes (positive = receivable reduced). */
    adjustment_total?: string;
    balance_receivable?: string;

    // GST / compliance
    gst_route?: ENUM_INVOICE_GST_ROUTE;
    lut_no?: string;
    lut_date?: string;
    cgst_amount?: string;
    sgst_amount?: string;
    igst_amount?: string;
    igst_refund_amount?: string;
    igst_refund_buckets?: any;
    place_of_supply?: string;

    // Company snapshots
    gst_no?: string;
    pan_no?: string;
    iec_no?: string;
    ad_code?: string;

    // Trade terms
    incoterm?: string;
    payment_terms?: string;
    delivery_terms?: string;
    end_use_code?: string;
    preferential_agreement?: string;

    // Banks
    bank_snapshots?: any;

    // Notes
    notes_to_buyer?: string;
    internal_notes?: string;
    declaration_text?: string;
    terms?: string;

    // Audit
    issued_by?: string;
    issued_at?: Date;
    cancelled_by?: string;
    cancelled_at?: Date;
    cancelled_reason?: string;
    createdAt?: Date;
    updatedAt?: Date;

    lines?: InvoiceLineResponseDto[];
    payments?: any[];
}

export class InvoiceListResponseDto {
    _id?: string;
    voucher_no?: string;
    status?: ENUM_INVOICE_STATUS;
    invoice_date?: string;
    customer_id?: string;
    customer_name?: string;
    customer_contact_name?: string;
    customer_contact_email?: string;
    customer_contact_phone?: string;
    customer_contact_country_code?: any;
    purchase_order_voucher_no?: string;
    /** Every source Sales Order this invoice draws from — id + voucher — so the
     *  listing can link each SO to its OWN page (an invoice can span several). */
    source_orders?: Array<{ id: string; voucher_no: string }>;
    reference_no?: string;
    currency_code?: string;
    currency_symbol?: string;
    grand_total?: string;
    grand_total_inr?: string;
    balance_receivable?: string;
    advance_received?: string;
    createdAt?: Date;
}
