/**
 * RFQ lifecycle:
 *   draft     → being prepared (vendors / lines editable)
 *   sent      → "please quote" issued to the invited vendors
 *   quoting   → at least one vendor price captured
 *   completed → a best price selected for every line (ready to make a Quotation)
 *   cancelled → abandoned
 */
export enum ENUM_RFQ_STATUS {
    DRAFT = 'draft',
    SENT = 'sent',
    QUOTING = 'quoting',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

/** Per-vendor invitation state on an RFQ. */
export enum ENUM_RFQ_VENDOR_STATUS {
    INVITED = 'invited',
    QUOTED = 'quoted',
}
