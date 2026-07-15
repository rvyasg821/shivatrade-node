/**
 * Product-wise Profitability report (PRODUCT_PROFITABILITY_REPORT_PLAN.md).
 *
 * All money is INR. Line amounts are stored in INR base, so they are summed
 * directly — NO exchange-rate conversion (unlike header totals). See the plan
 * §5-§6: cost = taxable_amount / (1 + margin_pct/100), profit = revenue − cost.
 */

export class ProductProfitabilityRowDto {
    product_id: string;
    product_code: string | null;
    product_name: string;
    hsn_code: string | null;
    category_id: string | null;
    category_name: string | null;
    qty_sold: number;
    revenue_inr: number;
    cost_inr: number;
    profit_inr: number;
    /** profit / cost × 100 (0 when cost = 0). */
    margin_pct: number;
}

export class ProductProfitabilityTotalsDto {
    qty_sold: number;
    revenue_inr: number;
    cost_inr: number;
    profit_inr: number;
    margin_pct: number;
}

export class ProductProfitabilityResponseDto {
    /** e.g. "01-04-2026 → 15-07-2026". */
    period_label: string;
    rows: ProductProfitabilityRowDto[];
    totals: ProductProfitabilityTotalsDto;
    currency: 'INR';
    pagination: { total: number; perPage: number; orderBy: string };
}
