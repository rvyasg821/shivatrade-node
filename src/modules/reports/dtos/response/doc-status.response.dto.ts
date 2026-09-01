/**
 * Generic "document coverage status" report — shared by the Sales Order Status
 * report (order = Sales Order, coverage = Invoice) and the Purchase Order
 * Status report (order = Vendor PO, coverage = GRN). One row per order document,
 * classified by how much of its ordered qty has been covered:
 *   open    — nothing covered yet
 *   partial — some, but not all, of the ordered qty covered
 *   closed  — fully covered (covered qty ≥ ordered qty)
 *
 * Every report feeds the SAME shape here; only the SQL that produces the raw
 * rows differs per document type. Values are ₹-normalised (the SQL converts
 * each document at its own frozen rate) so a multi-currency book stays summable;
 * the per-document native currency is shown for context.
 */
export class DocStatusRowDto {
    doc_id: string;
    doc_no: string;
    doc_date: string;
    /** Customer (SO) or Vendor (POV). */
    party_id: string | null;
    party_name: string | null;
    /** The order document's own currency (context for the native amounts). */
    currency_code: string;
    /** open | partial | closed — derived from covered vs ordered qty. */
    status: 'open' | 'partial' | 'closed';

    ordered_qty: number;
    covered_qty: number;
    pending_qty: number;

    /** ₹-normalised selling/order values (summable across currencies). */
    ordered_value_inr: number;
    covered_value_inr: number;
    pending_value_inr: number;

    /** covered_qty ÷ ordered_qty × 100 (capped at 100). */
    coverage_pct: number;
    /** Distinct coverage documents (invoices / GRNs) for the drill-down count. */
    cover_count: number;
}

export class DocStatusTotalsDto {
    total_docs: number;
    open_count: number;
    partial_count: number;
    closed_count: number;
    ordered_value_inr: number;
    covered_value_inr: number;
    pending_value_inr: number;
}

/** A filter-dropdown option — a party's id and name. */
export class DocStatusOptionDto {
    id: string;
    name: string;
}

/** One coverage-document line under an order document (the drill-down). Money is
 *  in the coverage document's own currency; `*_inr` is the ₹ equivalent. */
export class DocStatusBreakdownRowDto {
    cover_id: string;
    cover_no: string;
    /** Coverage document sub-type — invoice_type (export/domestic) or GRN status. */
    cover_type: string;
    cover_date: string;
    currency_code: string;
    currency_symbol: string;

    product_name: string;
    product_code: string | null;
    hsn_code: string | null;

    /** Ordered qty/rate on the source order line (rate expressed in the coverage
     *  currency, for a like display). */
    order_qty: number | null;
    order_rate: number | null;

    cover_qty: number;
    /** Per-unit covered rate, coverage currency. */
    cover_rate: number;
    /** Line (taxable) amount, coverage currency. */
    cover_amount: number;
    /** Same amount, ₹-normalised. */
    cover_amount_inr: number;
    /** GST on the line, coverage currency — present only when the report
     *  carries GST (POV Status). Null on reports without GST (SO Status). */
    cover_gst?: number | null;
    /** GST-inclusive total (cover_amount + cover_gst), coverage currency. */
    cover_total?: number | null;
}

/** One PRODUCT LINE of the order document (the per-line drill-down) — ordered
 *  qty on that line vs however much of it has been covered so far, regardless
 *  of whether any coverage exists yet (unlike `DocStatusBreakdownRowDto`,
 *  which only lists lines a coverage document actually touched). */
export class DocStatusLineBreakdownRowDto {
    line_id: string;
    product_id: string | null;
    product_name: string;
    product_code: string | null;
    hsn_code: string | null;
    unit: string | null;

    ordered_qty: number;
    covered_qty: number;
    pending_qty: number;
    /** Per-unit selling (SO) / vendor cost (POV) rate, native document currency —
     *  same formula as `DocStatusBreakdownRowDto.order_rate`. */
    rate: number | null;
    /** pending_qty × rate, native document currency. */
    pending_amount: number;
    /** open | partial | closed — same classification as the doc-level status. */
    status: 'open' | 'partial' | 'closed';
}

export class DocStatusResponseDto {
    period_label: string;
    rows: DocStatusRowDto[];
    totals: DocStatusTotalsDto;
    /** Distinct parties in range — feeds the party filter dropdown. */
    party_options: DocStatusOptionDto[];
    pagination: { total: number; perPage: number };
}
