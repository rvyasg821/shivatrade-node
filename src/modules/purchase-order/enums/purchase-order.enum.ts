export enum ENUM_PURCHASE_ORDER_STATUS {
    DRAFT = 'draft',
    CONFIRMED = 'confirmed',
    /** Set automatically when first GRN is posted (GRN module — future). */
    IN_PROCESS = 'in_process',
    /** Set automatically when final GRN closes the PO (GRN module — future). */
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}
