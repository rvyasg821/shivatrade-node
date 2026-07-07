// Stats response for /admin/customer/stats — drives the KPI tile strip on
// the customer listing page. Customers have no status workflow (only an
// is_active flag), so `by_status` carries just ACTIVE / INACTIVE counts to
// reuse the shared VoucherStatsTiles clickable-tile contract. `new_30d` is
// a cross-cutting metric (customers created in the last 30 days).

export class CustomerStatsResponseDto {
    total: number;
    // { ACTIVE: n, INACTIVE: m } — mirrors the by_status envelope used by
    // voucher modules so the shared tile strip can render active/inactive
    // as click-to-filter tiles.
    by_status: Record<string, number>;
    // Customers created in the last 30 days (over the same creator/search
    // scope as the rest of the tiles).
    new_30d: number;
}
