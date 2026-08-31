/**
 * Single source of truth for an invoice's rounded Grand Total + Round Off,
 * and its per-source-SO "Invoice Value" breakdown — used by BOTH the
 * persisted recompute() (invoice.service.ts) and the live PDF/Excel render
 * (invoice-pdf.service.ts) so the detail page, the API response, and every
 * PDF/Excel always agree.
 *
 * Grand Total is a single round of the combined raw total (FOB + freight +
 * insurance + other) to the nearest WHOLE currency unit — mirroring the
 * Quotation/Sales Order convention, and matching the Step 3 editor's own
 * live preview EXACTLY (add/index.js's `totals` memo does the identical
 * Math.round), so what an operator sees before saving never disagrees with
 * what gets persisted/printed.
 *
 * Per-SO breakdown: when a source SO is billed IN FULL on this invoice (its
 * own subtotal matches what's billed here), that row reuses the SO's own
 * already-rounded `grand_total` VERBATIM — no re-rounding. That SO's own
 * total was already real, already collected (e.g. as an advance); the
 * invoice must show the exact same number, not a recomputed one that can
 * drift by a dollar. Only a genuinely PARTIAL slice of a SO (this invoice
 * covers less than the whole SO) computes its own share of freight/
 * insurance/other and rounds once — there's no pre-existing "already
 * rounded" figure to reuse for a partial slice. That shared pool EXCLUDES
 * whatever freight a fully-billed SO already brought (its own freight_total
 * is already inside its reused grand_total) — otherwise a partial SO gets
 * handed a slice of freight that was already fully accounted for by the
 * fully-billed SO sitting next to it on the same invoice.
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
    /** Σ this SO's own line totals — used to detect "billed in full". */
    subtotal?: any;
    /** This SO's own already-rounded total — reused verbatim when fully billed. */
    grand_total?: any;
    /** This SO's own freight — a fully-billed SO's frozen grand_total above
     *  already includes this, so it must be subtracted from the invoice's
     *  shared freight pool before splitting the rest across PARTIAL SOs
     *  (else a partial SO gets handed a slice of freight a fully-billed SO
     *  already carried in its own total — the invoice only actually paid
     *  freight once, not once per SO). */
    freight_total?: any;
}

export interface GrandTotalChargeInputs {
    lines: GrandTotalLineInput[];
    /** poLineId → { po } — from InvoiceService.loadSourcePoContext(). */
    byPoLineId: Map<string, { po: GrandTotalPoInput }>;
    freight: number;
    insurance: number;
    other: number;
}

export function computeInvoiceGrandTotal(opts: {
    fobValue: number;
    freight: number;
    insurance: number;
    other: number;
}): { grand_total: number; round_off: number } {
    const rawGrand = opts.fobValue + opts.freight + opts.insurance + opts.other;
    const grand_total = Math.round(rawGrand);
    const round_off =
        Math.round((grand_total - rawGrand + Number.EPSILON) * 100) / 100;
    return { grand_total, round_off };
}

/**
 * Per-SO "Invoice Value" rows for the PDF/Excel's Sales-Order-wise Advance
 * table. See file doc comment for the "fully billed → reuse the SO's own
 * total" rule.
 */
export function computeInvoiceSoShares(
    opts: GrandTotalChargeInputs
): Array<{ poId: string; billed: number; invoiceValue: number }> {
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
    if (!billedByPoId.size) return [];

    const rows = Array.from(billedByPoId.entries()).map(([poId, billed]) => {
        const po = poById.get(poId);
        const fullyBilled =
            po?.subtotal != null &&
            Math.abs(num(po.subtotal) - billed) < 0.01 &&
            num(po.grand_total) > 0;
        return { poId, billed, po, fullyBilled };
    });

    // Freight pool left for PARTIAL SOs to share = the invoice's actual
    // freight minus what every fully-billed SO already brought (and already
    // has baked into its own frozen grand_total, reused verbatim below).
    // Insurance/other have no per-SO source field, so those stay shared
    // across only the partial SOs too (a fully-billed row never gets a
    // slice of either — it's reused verbatim, nothing added on top).
    const fullyBilledFreight = rows
        .filter((r) => r.fullyBilled)
        .reduce((s, r) => s + num(r.po?.freight_total), 0);
    const leftoverFreight = Math.max(0, opts.freight - fullyBilledFreight);
    const insuranceOther = opts.insurance + opts.other;
    const partialRows = rows.filter((r) => !r.fullyBilled);
    const partialTotalBilled = partialRows.reduce((s, r) => s + r.billed, 0);

    return rows.map((r) => {
        if (r.fullyBilled) {
            return { poId: r.poId, billed: r.billed, invoiceValue: num(r.po!.grand_total) };
        }
        // Partial slice of this SO — its own billed amount plus its share
        // of whatever freight/insurance/other is left for partial SOs,
        // rounded once. Not forced to reconcile with the invoice's own
        // Grand Total; a small informational gap here is normal when
        // combining multiple SOs' independently-rounded figures.
        const share = partialTotalBilled > 0 ? r.billed / partialTotalBilled : 0;
        const raw = r.billed + (leftoverFreight + insuranceOther) * share;
        return { poId: r.poId, billed: r.billed, invoiceValue: Math.round(raw) };
    });
}
