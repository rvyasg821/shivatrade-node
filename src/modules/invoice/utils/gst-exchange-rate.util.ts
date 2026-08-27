/**
 * Single source of truth for which exchange rate feeds the Commercial
 * Invoice's GST / Assessable-Value figures — used by BOTH the frozen-at-issue
 * IGST-refund-bucket computation (invoice.service.ts) and the live PDF/Excel
 * render (invoice-pdf.service.ts) so draft-live and issued-frozen numbers
 * always agree.
 *
 * IMPORTANT — the two rates use DIFFERENT conventions, by design:
 *   - `exchange_rate` (the invoice's own rate) = document-currency-per-₹1,
 *     a SMALL number for USD (e.g. ~0.0105). `inr = doc / exchange_rate`.
 *     This is the "reports/ledger" convention used everywhere else on a
 *     sales document (see CLAUDE.md §4).
 *   - `custom_exchange_rate` (the optional GST-only override) is entered by
 *     the operator the way a real customs/bank rate is normally quoted —
 *     INR-per-1-unit, a LARGE number for USD (e.g. ~91). `inr = doc × rate`.
 *     This mirrors the POV header's `exchange_rate` convention, which is the
 *     same natural "$1 = ₹91" shape a human types in.
 * Mixing these up (dividing when a custom rate is set, or vice versa) is
 * exactly the bug this file exists to prevent — always go through
 * `convertToInrForGst` / `formatGstExchangeRateForDisplay` below, never do
 * the arithmetic inline at a call site.
 */

const isPositive = (v: any): v is number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
};

export interface GstRateInvoice {
    exchange_rate?: any;
    custom_exchange_rate?: any;
}

/** Converts a DOCUMENT-currency amount to INR for GST purposes. */
export function convertToInrForGst(
    amountInDocCurrency: number,
    inv: GstRateInvoice
): number {
    if (isPositive(inv?.custom_exchange_rate)) {
        // INR-per-unit convention (large number) → multiply.
        return amountInDocCurrency * Number(inv.custom_exchange_rate);
    }
    const er = isPositive(inv?.exchange_rate) ? Number(inv.exchange_rate) : 1;
    // document-per-₹1 convention (small number) → divide.
    return amountInDocCurrency / er;
}

/** Header "Exchange Rate" line for the Commercial doc — shows whichever
 *  rate GST actually used, formatted for ITS OWN convention (no blind 1/x
 *  inversion, since the two rates are quoted in opposite directions). */
export function formatGstExchangeRateForDisplay(
    inv: GstRateInvoice,
    sym: string,
    fmtRate: (n: number) => string
): string {
    if (isPositive(inv?.custom_exchange_rate)) {
        return `${sym}1 = ₹${fmtRate(Number(inv.custom_exchange_rate))}`;
    }
    const er = isPositive(inv?.exchange_rate) ? Number(inv.exchange_rate) : 0;
    return er > 0 ? `${sym}1 = ₹${fmtRate(1 / er)}` : '-';
}
