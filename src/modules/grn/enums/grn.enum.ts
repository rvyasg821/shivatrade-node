/**
 * GRN (Goods Receipt Note) lifecycle. A GRN is a document raised against an
 * already-received (closed) POV — it does NOT change the POV receipt or the
 * derived inventory; it formalises the receipt + quality check.
 *   draft     → being filled (accepted / rejected qty editable)
 *   confirmed → quality check finalised
 *   cancelled → voided
 */
export enum ENUM_GRN_STATUS {
    DRAFT = 'draft',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
}
