/**
 * Single source of truth for an invoice's rounded Grand Total + Round Off —
 * used by BOTH the persisted recompute() (invoice.service.ts) and the live
 * PDF/Excel render (invoice-pdf.service.ts) so the detail page, the API
 * response, and every PDF/Excel always agree on the same figure.
 *
 * Grand Total is rounded to the nearest WHOLE currency unit — mirroring the
 * Quotation/Sales Order convention. When this invoice draws from one or more
 * source Sales Orders, the total is the SUM of each SO's own already-rounded
 * share (not an independent re-round of the invoice's own raw aggregate) —
 * rounding-the-whole vs. rounding-then-summing-the-parts can differ by ±1
 * unit, and the per-SO shares are what the source SO's own detail page/PDF
 * display, so they win. Falls back to rounding the raw aggregate only when
 * there's no resolvable source SO (e.g. a pure from-stock invoice).
 */
const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export interface GrandTotalLineInput {
    purchase_order_line_id?: any;
    line_total?: any;
}

export interface GrandTotalPoInput {
    _id: any;
    freight_total?: any;
}

export function computeInvoiceGrandTotal(opts: {
    lines: GrandTotalLineInput[];
    /** poLineId → { po } — from InvoiceService.loadSourcePoContext(). */
    byPoLineId: Map<string, { po: GrandTotalPoInput }>;
    /** subtotal − discount_total, in the DOCUMENT currency. */
    fobValue: number;
    freight: number;
    insurance: number;
    other: number;
}): { grand_total: number; round_off: number } {
    const rawGrand = opts.fobValue + opts.freight + opts.insurance + opts.other;
    const round_off_of = (grand_total: number) =>
        Math.round((grand_total - rawGrand + Number.EPSILON) * 100) / 100;

    const billedByPoId = new Map<string, number>();
    const poById = new Map<string, GrandTotalPoInput>();
    for (const l of opts.lines) {
        const plId =
            l.purchase_order_line_id?.toString?.() ?? l.purchase_order_line_id;
        if (!plId) continue;
        const entry = opts.byPoLineId.get(plId);
        const poId = entry?.po?._id?.toString?.();
        if (!poId) continue;
        billedByPoId.set(poId, (billedByPoId.get(poId) || 0) + num(l.line_total));
        if (!poById.has(poId)) poById.set(poId, entry.po);
    }

    if (!billedByPoId.size) {
        const grand_total = Math.round(rawGrand);
        return { grand_total, round_off: round_off_of(grand_total) };
    }

    const totalBilled = Array.from(billedByPoId.values()).reduce(
        (s, v) => s + v,
        0
    );
    const insuranceOther = opts.insurance + opts.other;
    let grand_total = 0;
    for (const [poId, billed] of billedByPoId) {
        const po = poById.get(poId);
        const soFreight = num(po?.freight_total);
        const share = totalBilled > 0 ? billed / totalBilled : 0;
        const raw = billed + soFreight + insuranceOther * share;
        grand_total += Math.round(raw);
    }
    return { grand_total, round_off: round_off_of(grand_total) };
}
