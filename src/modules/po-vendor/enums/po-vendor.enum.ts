/**
 * POV status workflow (POV plan §7):
 *
 *   draft → dispatched → closed
 *     ↓        ↓
 *   cancelled (from draft or dispatched; releases ordered_qty back to PO pending)
 *
 * No `in_transit`. No "Revert to Draft" — qty audit trail is immutable
 * once dispatched. Cancellation is the only escape and releases the
 * reserved qty back to the PO line's pending bucket.
 */
export enum ENUM_PO_VENDOR_STATUS {
    DRAFT = 'draft',
    DISPATCHED = 'dispatched',
    CLOSED = 'closed',
    CANCELLED = 'cancelled',
}

/**
 * Vendor payment status — runs INDEPENDENTLY of the dispatch `status`
 * above (a POV can be paid while still a draft, and dispatching never
 * changes this). Derived from the sum of active payments vs the live
 * order value (payable), never set directly by the user.
 */
export enum ENUM_PO_VENDOR_PAYMENT_STATUS {
    UNPAID = 'unpaid',
    PARTIALLY_PAID = 'partially_paid',
    PAID = 'paid',
}
