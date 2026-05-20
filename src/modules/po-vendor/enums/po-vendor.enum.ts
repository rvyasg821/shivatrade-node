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
