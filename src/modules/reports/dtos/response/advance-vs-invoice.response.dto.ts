/**
 * Advance vs Invoice.
 *
 * One row per Sales Order (that carries an advance and/or has been invoiced),
 * comparing the advance taken up-front on the SO against the invoices later
 * raised against it — so you can see advances still to be billed, and how much
 * remains receivable after the advance is applied.
 *
 *   Advance Received = SO.advance_amount            (SO currency)
 *   Invoiced         = Σ invoice-line value billed against the SO's lines
 *                      (across non-cancelled invoices), shown in the SO currency
 *   Balance          = Invoiced − Advance           (>0 still receivable,
 *                                                     <0 advance not yet billed)
 *
 * Row amounts are in each SO's own currency; the TOTALS are INR so they stay
 * summable across currencies.
 */
export class AdvanceVsInvoiceRowDto {
    so_id: string;
    so_no: string;
    so_date: string;
    customer_name: string | null;

    currency_code: string;
    currency_symbol: string;

    so_value: number;
    advance: number;
    advance_date: string | null;
    invoiced: number;
    /** Invoiced − Advance, in the SO currency. */
    balance: number;
    invoice_count: number;
    /** The invoices raised against this SO — id + voucher for clickable links. */
    invoices: Array<{ id: string; no: string }>;

    /** advance_unbilled | partly_adjusted | fully_adjusted | no_advance */
    status: string;

    /** INR-normalised copies used to build the summable totals. */
    so_value_inr: number;
    advance_inr: number;
    invoiced_inr: number;
    balance_inr: number;
}

export class AdvanceVsInvoiceTotalsDto {
    /** Sales Orders shown. */
    orders: number;
    so_value_inr: number;
    advance_inr: number;
    invoiced_inr: number;
    /** Σ (Invoiced − Advance), INR. */
    balance_inr: number;
    /** Advances taken but not yet invoiced at all (count). */
    advance_unbilled: number;
}

export class AdvanceVsInvoiceResponseDto {
    period_label: string;
    rows: AdvanceVsInvoiceRowDto[];
    totals: AdvanceVsInvoiceTotalsDto;
    pagination: { total: number; perPage: number };
}
