// Stats response for /admin/pfi/stats — drives the KPI tile strip on
// the PFI listing. Same envelope as QuotationStatsResponseDto so the FE
// stays config-driven (see Docs/VOUCHER_STATS_PLAN.md §4.1).

export class PfiStatsResponseDto {
    total: number;
    // SUM(grand_total / exchange_rate) over non-rejected rows in the
    // filtered set. Returned as a string to avoid float drift.
    total_amount_inr: string;
    // Per-status counts. Keys are ENUM_PFI_STATUS values that actually
    // appear in the filtered result — missing keys = 0.
    by_status: Record<string, number>;
}
