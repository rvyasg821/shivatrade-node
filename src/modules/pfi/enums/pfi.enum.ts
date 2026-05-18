export enum ENUM_PFI_STATUS {
    DRAFT = 'draft',
    SENT = 'sent',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    /** Set automatically when a Commercial Invoice is generated from the PFI
     *  (CI module — future). Read-only; no further transitions. */
    CLOSED = 'closed',
}
