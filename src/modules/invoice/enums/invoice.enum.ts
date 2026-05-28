export enum ENUM_INVOICE_TYPE {
    /** Export invoice billed to a foreign buyer (Phase 1 default + only wired path). */
    EXPORT = 'export',
    /** Reserved for future domestic billing - not wired in Phase 1. */
    DOMESTIC = 'domestic',
}

export enum ENUM_INVOICE_STATUS {
    DRAFT = 'draft',
    ISSUED = 'issued',
    PARTIALLY_PAID = 'partially_paid',
    PAID = 'paid',
    CANCELLED = 'cancelled',
}

export enum ENUM_INVOICE_GST_ROUTE {
    /** Default for exports - IGST is paid to Govt then reclaimed as refund. */
    IGST_PAID = 'igst_paid',
    /** Zero-rated under Letter of Undertaking - lut_no + lut_date required. */
    LUT_ZERO_RATED = 'lut_zero_rated',
    /** Reserved for future domestic invoice (intra-state, CGST+SGST split). */
    DOMESTIC_INTRA = 'domestic_intra',
    /** Reserved for future domestic invoice (inter-state, IGST). */
    DOMESTIC_INTER = 'domestic_inter',
}

export const INVOICE_EDITABLE_AT_DRAFT = '*';

/** Fields that remain editable after ISSUED (everything else is frozen).
 *  Payments are recorded via the payment endpoints, NOT by editing
 *  advance_received / balance_receivable — those are derived. */
export const INVOICE_EDITABLE_AT_ISSUED: ReadonlyArray<string> = [
    'shipping_id',
    'shipping_voucher_no',
    'internal_notes',
    'notes_to_buyer',
];
