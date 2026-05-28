// Stats response for /admin/quotation/stats — drives the KPI tile strip
// on the quotation listing. Same envelope as LeadStatsResponseDto to keep
// the FE config-driven (see Docs/VOUCHER_STATS_PLAN.md §4.1).

export class QuotationStatsResponseDto {
    total: number;
    // SUM(grand_total × exchange_rate) over the filtered set, in INR.
    // Returned as a string to avoid float drift on large sums.
    total_amount_inr: string;
    // Per-status counts. Keys are ENUM_QUOTATION_STATUS values that
    // actually appear in the filtered result — missing keys = 0.
    by_status: Record<string, number>;
}
