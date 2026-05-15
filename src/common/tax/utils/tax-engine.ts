/**
 * Indian GST tax engine - pure utility, no DB or DI.
 *
 * Decides intra-state vs. inter-state from customer/company state strings
 * and splits the tax accordingly:
 *   - Intra-state (same state)  → 50/50 CGST + SGST
 *   - Inter-state (different)   → 100% IGST
 *   - Export / LUT / nil-rated  → caller passes `tax_pct: 0`
 *
 * Does NOT determine `tax_pct` itself - caller decides that from the
 * Product master (HSN-based) or manual entry.
 */

export type TaxType = 'INTRA' | 'INTER';

export interface ComputeLineTaxInput {
    qty: number;
    unit_price: number;
    /** % discount on (qty × unit_price). Default 0. */
    discount_pct?: number;
    /** Tax rate as a percentage (e.g. 18 for 18%). 0 for export/LUT. */
    tax_pct: number;
    /** Customer's billing-address state. Optional - missing → INTER. */
    customer_state?: string;
    /** Company's registered state. Optional - missing → INTER. */
    company_state?: string;
}

export interface ComputeLineTaxOutput {
    gross: number;            // qty × unit_price
    discount_amount: number;
    taxable: number;          // gross − discount
    cgst: number;
    sgst: number;
    igst: number;
    total_tax: number;
    line_total: number;       // taxable + total_tax
    tax_type: TaxType;
}

/** Common alias map - handles dirty real-world data so a typo doesn't flip
 *  intra-state to inter-state (which would silently overcharge IGST). */
const STATE_ALIASES: Record<string, string> = {
    orissa: 'odisha',
    pondicherry: 'puducherry',
    uttaranchal: 'uttarakhand',
    'jammu and kashmir': 'jammu & kashmir',
};

function normalizeState(s?: string): string {
    if (!s) return '';
    const trimmed = s.trim().toLowerCase();
    return STATE_ALIASES[trimmed] || trimmed;
}

function decideTaxType(customerState?: string, companyState?: string): TaxType {
    const a = normalizeState(customerState);
    const b = normalizeState(companyState);
    if (!a || !b) return 'INTER'; // safer default - IGST covers cross-state.
    return a === b ? 'INTRA' : 'INTER';
}

function round2(n: number): number {
    if (!isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineTax(input: ComputeLineTaxInput): ComputeLineTaxOutput {
    const qty = Number(input.qty || 0);
    const unitPrice = Number(input.unit_price || 0);
    const discPct = Number(input.discount_pct || 0);
    const taxPct = Number(input.tax_pct || 0);

    const gross = round2(qty * unitPrice);
    const discount_amount = round2(gross * (discPct / 100));
    const taxable = round2(gross - discount_amount);
    const total_tax = round2(taxable * (taxPct / 100));

    const tax_type = decideTaxType(input.customer_state, input.company_state);

    let cgst = 0,
        sgst = 0,
        igst = 0;
    if (total_tax > 0) {
        if (tax_type === 'INTRA') {
            cgst = round2(total_tax / 2);
            // Absorb rounding remainder into SGST so cgst+sgst === total_tax exactly.
            sgst = round2(total_tax - cgst);
        } else {
            igst = total_tax;
        }
    }

    const line_total = round2(taxable + total_tax);
    return { gross, discount_amount, taxable, cgst, sgst, igst, total_tax, line_total, tax_type };
}

export interface AggregateTaxInput
    extends Pick<ComputeLineTaxOutput, 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total_tax'> {}

export interface AggregateTaxOutput {
    total_taxable: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_tax: number;
    grand_total: number;
}

/** Sum across an array of computed lines for header-level totals. */
export function aggregateTaxes(lines: AggregateTaxInput[]): AggregateTaxOutput {
    const out = {
        total_taxable: 0,
        total_cgst: 0,
        total_sgst: 0,
        total_igst: 0,
        total_tax: 0,
        grand_total: 0,
    };
    for (const l of lines) {
        out.total_taxable += Number(l.taxable || 0);
        out.total_cgst += Number(l.cgst || 0);
        out.total_sgst += Number(l.sgst || 0);
        out.total_igst += Number(l.igst || 0);
        out.total_tax += Number(l.total_tax || 0);
    }
    out.total_taxable = round2(out.total_taxable);
    out.total_cgst = round2(out.total_cgst);
    out.total_sgst = round2(out.total_sgst);
    out.total_igst = round2(out.total_igst);
    out.total_tax = round2(out.total_tax);
    out.grand_total = round2(out.total_taxable + out.total_tax);
    return out;
}
