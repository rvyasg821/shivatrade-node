/**
 * Client-facing sanitized quotation — served by the no-auth public route
 * (`GET /public/quotation/:token`). Built field-by-field in
 * `quotation.service.mapPublic()`; it deliberately omits every internal
 * costing detail: margin, expenses, rebates, internal_notes, exchange rate,
 * and all home-currency (INR) figures. Every money value here is already in
 * the customer's currency.
 */

export class QuotationPublicLineDto {
    product_name?: string;
    part_no?: string;
    hs_code?: string;
    description?: string;
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
}

export class QuotationPublicResponseDto {
    voucher_no?: string;
    quotation_date?: string;
    valid_until?: string;
    /** True when valid_until is in the past — the renderer shows a banner. */
    is_expired?: boolean;
    status?: string;

    currency_code?: string;
    currency_symbol?: string;

    /** Seller (us) — the "Billed From" block + letterhead. */
    company_name?: string;
    company_email?: string;
    company_phone?: string;
    company_iec?: string;
    /** Seller corporate address — newline-separated lines. */
    company_address?: string;
    /** Letterhead logo (resolved URL) + footer identity fields, so the
     *  web preview can render the same header/footer as the server PDF. */
    company_logo_url?: string;
    company_gstin?: string;
    company_pan?: string;
    company_cin?: string;
    company_website?: string;
    company_footer_address?: string;

    /** Buyer. */
    customer_name?: string;
    customer_contact_name?: string;
    customer_email?: string;
    customer_phone?: string;
    /** Bill-to address — newline-separated lines. */
    customer_address?: string;

    /** Consignee (Ship-to). Falls back to the buyer when same-as-buyer. */
    consignee_name?: string;
    /** Ship-to address — newline-separated lines. */
    consignee_address?: string;
    consignee_same_as_buyer?: boolean;

    payment_terms?: string;
    delivery_terms?: string;
    delivery_location?: string;
    notes_to_client?: string;

    lines?: QuotationPublicLineDto[];

    /** Sum of line amounts, customer currency, excluding GST. */
    subtotal?: string;
    /** Sum of line GST, customer currency. */
    gst_total?: string;
    /** Final payable, customer currency. */
    grand_total?: string;
}
