// Stats response for /admin/lead/stats — drives the 5-tile KPI strip on
// the lead listing page. Shape mirrors the cross-module contract in
// Docs/VOUCHER_STATS_PLAN.md §4.1 so other voucher modules adopting the
// same pattern can return an identical envelope.

export class LeadStatsResponseDto {
    total: number;
    // SUM(expected_value) over the filtered set, rendered Indian-format
    // in the FE tile. Returned as a string to dodge JS float drift on
    // large sums.
    total_expected_value: string;
    // Per-status counts. Keys are the ENUM_LEAD_STATUS values that
    // actually appear in the filtered result — missing keys = 0.
    by_status: Record<string, number>;
}
