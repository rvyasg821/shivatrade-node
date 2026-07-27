/**
 * SO vs Invoice — Price Reconciliation.
 *
 * One row per invoiced line (matched to its Sales Order line via
 * `purchase_order_line_id`). Compares the FINAL CUSTOMER SELLING price on the
 * Sales Order line against the actual invoiced price, in the invoice's own
 * currency (FX included — a difference can come from a price change OR a
 * rate change between the SO and the invoice).
 *
 * Selling value definition (identical both sides, so the comparison is fair):
 *   invoice line  = invoice_line.taxable_amount                          (INR)
 *   SO line       = pol.taxable + expenses − rebates + margin            (INR)
 * Per-unit rate = selling value ÷ qty, then × the document's exchange_rate.
 *
 * Row-level amounts are in the invoice currency; the TOTALS are in INR so they
 * stay summable even when invoices span multiple currencies.
 */
export class SoInvoiceReconRowDto {
    invoice_id: string;
    invoice_no: string;
    invoice_type: string; // 'export' | 'commercial'
    invoice_date: string;
    customer_name: string | null;
    so_no: string | null;

    product_id: string | null;
    product_name: string;
    product_code: string | null;
    hsn_code: string | null;

    /** Invoice document currency — the row amounts below are in this currency. */
    currency_code: string;
    currency_symbol: string;
    /** True when the SO's currency differs from the invoice's, so the SO value
     *  was converted at the invoice rate (its own FX can't be shown). */
    currency_mismatch: boolean;

    so_qty: number | null;
    /** Per-unit SO selling price, invoice currency. */
    so_rate: number | null;
    inv_qty: number;
    /** Per-unit invoice selling price, invoice currency. */
    inv_rate: number;

    /** inv_rate − so_rate (invoice currency). */
    rate_diff: number | null;
    /** rate_diff × inv_qty (invoice currency) — the money impact on this line. */
    amount_diff: number | null;
    /** rate_diff ÷ so_rate × 100. */
    diff_pct: number | null;

    /** INR-equivalent selling values (used to build the summable totals). */
    so_value_inr: number | null;
    invoice_value_inr: number;
    variance_inr: number | null;
}

export class SoInvoiceReconTotalsDto {
    /** Number of reconciled (SO-linked) lines. */
    lines: number;
    /** Σ SO expected value for the invoiced qty (INR). */
    so_value_inr: number;
    /** Σ invoiced value (INR). */
    invoice_value_inr: number;
    /** invoice_value_inr − so_value_inr (INR) — the reconciliation figure. */
    variance_inr: number;
    /** Invoice lines in range that had NO Sales Order link (not shown, not
     *  reconcilable) — surfaced so nothing looks silently dropped. */
    unlinked_lines: number;
}

export class SoInvoiceReconciliationResponseDto {
    period_label: string;
    rows: SoInvoiceReconRowDto[];
    totals: SoInvoiceReconTotalsDto;
    pagination: { total: number; perPage: number };
}
