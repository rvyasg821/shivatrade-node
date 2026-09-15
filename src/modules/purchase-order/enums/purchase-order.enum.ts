export enum ENUM_PURCHASE_ORDER_STATUS {
    DRAFT = 'draft',
    CONFIRMED = 'confirmed',
    /** Set automatically when first GRN is posted (GRN module — future). */
    IN_PROCESS = 'in_process',
    /** Set automatically when final GRN closes the PO (GRN module — future). */
    COMPLETED = 'completed',
    /**
     * Manually closed at less than the ordered qty — the vendor confirmed no
     * more is coming, or the client confirmed the order is done. Never
     * rewrites `purchase_order_line.qty`; see PRE_CLOSE_MODULE_PLAN.md.
     */
    PRE_CLOSED = 'pre_closed',
    CANCELLED = 'cancelled',
}
