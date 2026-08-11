/**
 * Lead → Invoice Duration.
 *
 * One row per issued invoice, tracing the conversion cycle back through the
 * documents that produced it:
 *
 *   Lead  →  Quotation  →  Sales Order  →  Invoice
 *
 * The chain is resolved header-first: invoice.purchase_order_id gives the
 * Sales Order, the quotation is invoice.quotation_id (falling back to the SO's
 * quotation_id), and the lead is quotation.lead_id. Any missing hop leaves that
 * document's columns and the durations that touch it null (a dash on screen),
 * so a partially-linked invoice still appears — nothing is silently dropped.
 *
 * Durations are whole days between the two document dates (Lead uses its
 * created date; Quotation `quotation_date`; SO `po_date`; Invoice
 * `invoice_date`). `total_days` is Lead → Invoice, the headline cycle time.
 */
export class LeadToInvoiceDurationRowDto {
    invoice_id: string;
    invoice_no: string | null;
    invoice_type: string; // 'export' | 'commercial'
    invoice_date: string;
    customer_name: string | null;

    so_no: string | null;
    so_date: string | null;

    quotation_no: string | null;
    quotation_date: string | null;

    lead_no: string | null;
    lead_date: string | null;

    /** Whole days between consecutive stages; null when either end is missing. */
    lead_to_quotation_days: number | null;
    quotation_to_so_days: number | null;
    so_to_invoice_days: number | null;
    /** Lead → Invoice, the full conversion cycle. Null unless the lead is known. */
    total_days: number | null;
}

export class LeadToInvoiceDurationTotalsDto {
    /** Invoices shown. */
    invoices: number;
    /** Invoices with a complete Lead → Invoice chain (total_days computable). */
    chained: number;
    /** Averages over the rows where each figure is computable (whole days, 1dp). */
    avg_total_days: number | null;
    avg_lead_to_quotation_days: number | null;
    avg_quotation_to_so_days: number | null;
    avg_so_to_invoice_days: number | null;
    /** Fastest / slowest full cycle (Lead → Invoice), over `chained` rows. */
    min_total_days: number | null;
    max_total_days: number | null;
}

export class LeadToInvoiceDurationResponseDto {
    period_label: string;
    rows: LeadToInvoiceDurationRowDto[];
    totals: LeadToInvoiceDurationTotalsDto;
    pagination: { total: number; perPage: number };
}
