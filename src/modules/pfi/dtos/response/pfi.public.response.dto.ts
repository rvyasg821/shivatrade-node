/**
 * Client-facing sanitized PFI - served by the no-auth public route
 * (`GET /public/pfi/:token`). Built field-by-field in
 * `pfi.service.mapPublic()`; it deliberately omits every internal costing
 * detail: margin, expenses, rebates, internal_notes, exchange rate, and
 * home-currency (INR) figures. Every money value here is already in the
 * customer's currency.
 */

export class PfiPublicLineDto {
    product_name?: string;
    description?: string;
    /** HS / HSN code - printed on the customs documents at destination. */
    hs_code?: string;
    qty?: string;
    unit?: string;
    /** All-in costed rate per unit, in customer currency, excluding GST. */
    unit_price?: string;
    discount_pct?: string;
    tax_pct?: string;
    /** GST amount for this line, in customer currency. */
    gst_amount?: string;
    /** Line total in customer currency, including GST. */
    line_total?: string;
    net_weight_kg?: string;
    gross_weight_kg?: string;
    package_count?: number;
}

export class PfiPublicBankDto {
    beneficiary_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc?: string;
    swift_code?: string;
    iban?: string;
    branch_name?: string;
    branch_address?: string;
    ad_code?: string;
    /** Currency code of the receiving account (e.g. USD). */
    currency_code?: string;
}

export class PfiPublicResponseDto {
    voucher_no?: string;
    pfi_date?: string;
    valid_until?: string;
    /** True when valid_until is in the past - the renderer shows a banner. */
    is_expired?: boolean;
    status?: string;

    currency_code?: string;
    currency_symbol?: string;

    /** Seller (us) - the "Exporter" block + letterhead. */
    company_name?: string;
    company_email?: string;
    company_phone?: string;
    company_iec?: string;
    /** Seller corporate address - newline-separated lines. */
    company_address?: string;

    /** Buyer. */
    customer_name?: string;
    customer_contact_name?: string;
    customer_email?: string;
    customer_phone?: string;
    /** Bill-to address - newline-separated lines. */
    customer_address?: string;

    /** Consignee block - falls back to buyer when consignee fields blank. */
    consignee_name?: string;
    consignee_address?: string;

    // Shipping
    port_of_loading?: string;
    port_of_discharge?: string;
    port_of_loading_snapshot?: any;
    port_of_discharge_snapshot?: any;
    final_destination?: string;
    country_of_origin?: string;
    country_of_final_destination?: string;
    mode_of_shipment?: string;
    container_details?: string;
    est_shipment_date?: string;
    est_delivery_date?: string;

    // Packing
    packing_marks?: string;
    total_packages?: number;
    packing_type?: string;
    container_used?: boolean | null;
    container_no?: string;
    seal_no?: string;
    container_load_type?: string;
    gross_weight_kg?: string;
    net_weight_kg?: string;

    payment_terms_text?: string;
    declaration_text?: string;
    notes_to_client?: string;

    lines?: PfiPublicLineDto[];

    /** Sum of line amounts, customer currency, excluding GST. */
    subtotal?: string;
    /** Sum of line GST, customer currency (will be 0 on LUT-zero-rated
     *  foreign-currency exports). */
    gst_total?: string;
    /** Final payable, customer currency. */
    grand_total?: string;

    bank?: PfiPublicBankDto;
}
