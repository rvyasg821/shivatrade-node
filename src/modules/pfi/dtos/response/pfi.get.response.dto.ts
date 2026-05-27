import { ENUM_PFI_STATUS } from '../../enums/pfi.enum';

export class PfiLineResponseDto {
    _id?: string;
    product_id?: string;
    product_code?: string;
    product_name?: string;
    vendor_id?: string;
    vendor_name?: string;
    vendor_code?: string;
    description?: string;
    customer_reference?: string;
    qty?: string;
    unit?: string;
    unit_price?: string;
    discount_pct?: string;
    tax_pct?: string;
    cgst?: string;
    sgst?: string;
    igst?: string;
    taxable?: string;
    line_total?: string;
    product_rebates_snapshot?: Array<{
        rebate_id: string;
        code?: string;
        name?: string;
        pct: string;
    }>;
    product_expenses_snapshot?: Array<{
        expense_id: string;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;
    product_rebates_amount?: string;
    product_expenses_amount?: string;
    margin_pct?: string;
    margin_amount?: string;
    seq?: number;

    // ── Export-document line fields (Phase 2) ──
    hs_code?: string;
    net_weight_kg?: string;
    gross_weight_kg?: string;
    package_count?: number;
}

export class PfiGetResponseDto {
    _id?: string;
    voucher_no?: string;
    quotation_id?: string;
    quotation_voucher_no?: string;
    lead_id?: string;
    customer_id?: string;
    customer_name?: string;
    customer_contact_name?: string;
    customer_contact_email?: string;
    customer_contact_phone?: string;
    customer_contact_country_code?: any;
    customer_address_id?: string;
    pfi_date?: string;
    valid_until?: string;
    currency_code?: string;
    currency_symbol?: string;
    exchange_rate?: string;
    payment_terms?: string;
    delivery_terms?: string;
    delivery_location?: string;
    notes_to_client?: string;
    internal_notes?: string;

    subtotal?: string;
    product_expenses_total?: string;
    product_rebates_total?: string;
    skip_product_costing?: boolean;
    margin_pct?: string;
    margin_amount?: string;
    tax_total?: string;
    round_off?: string;
    grand_total?: string;

    status?: ENUM_PFI_STATUS;
    version?: number;
    parent_version_id?: string;

    // ── Consignee / shipping / packing / commercial (Phase 1) ──
    port_of_loading?: string;
    port_of_discharge?: string;
    port_of_loading_id?: string;
    port_of_loading_snapshot?: any;
    port_of_discharge_id?: string;
    port_of_discharge_snapshot?: any;
    consignee_id?: string;
    consignee_snapshot?: {
        name?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
    };
    final_destination?: string;
    country_of_origin?: string;
    country_of_final_destination?: string;
    mode_of_shipment?: string;
    container_details?: string;
    est_shipment_date?: string;
    est_delivery_date?: string;
    packing_marks?: string;
    total_packages?: number;
    packing_type?: string;
    container_used?: boolean | null;
    container_no?: string;
    seal_no?: string;
    container_load_type?: string;
    gross_weight_kg?: string;
    net_weight_kg?: string;
    bank_account_id?: string;
    bank_account?: {
        _id?: string;
        bank_name?: string;
        beneficiary_name?: string;
        account_number?: string;
        branch_name?: string;
        branch_address?: string;
        swift_code?: string;
        ifsc?: string;
        iban?: string;
        ad_code?: string;
        currency_code?: string;
    };
    payment_terms_text?: string;
    declaration_text?: string;
    validity_days?: number;
    public_token?: string;
    public_view_count?: number;
    public_last_viewed_at?: Date;

    created_by?: string;
    createdAt?: Date;
    updatedAt?: Date;

    lines?: PfiLineResponseDto[];
}
