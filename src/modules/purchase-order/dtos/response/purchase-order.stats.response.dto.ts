// Stats response for /admin/purchase-order/stats — drives the KPI tile
// strip on the PO listing. Same envelope as QuotationStatsResponseDto so
// the FE stays config-driven (see Docs/VOUCHER_STATS_PLAN.md §4.1).

export class PurchaseOrderStatsResponseDto {
    total: number;
    // SUM(grand_total / exchange_rate) over non-cancelled rows in the
    // filtered set, converted to INR. Returned as a string to avoid
    // float drift.
    total_amount_inr: string;
    // Per-status counts. Keys are ENUM_PURCHASE_ORDER_STATUS values that
    // actually appear in the filtered result — missing keys = 0.
    by_status: Record<string, number>;
    // Count of confirmed / in_process Sales Orders not yet fully covered by
    // active Vendor POs — drives the dashboard "Waiting for POV" tile.
    pending_pov: number;
}
