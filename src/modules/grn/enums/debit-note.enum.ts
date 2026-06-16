/**
 * Debit Note lifecycle. A Debit Note is raised against a CONFIRMED GRN to
 * return QC-rejected goods to the vendor and claim the money back. It is a
 * standalone financial record — it does NOT change the GRN, the POV, or the
 * derived inventory (rejected qty is already excluded from stock).
 *   draft     → being filled (returned qty / unit price editable)
 *   issued    → finalised and sent to the vendor
 *   cancelled → voided
 */
export enum ENUM_DEBIT_NOTE_STATUS {
    DRAFT = 'draft',
    ISSUED = 'issued',
    CANCELLED = 'cancelled',
}
