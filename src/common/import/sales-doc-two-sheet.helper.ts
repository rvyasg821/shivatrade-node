// Shared helpers for the two-sheet document importers (Quotation, Sales Order,
// and later Invoice). The header sheet is one row per document; the "LineItems"
// sheet carries the full costing worksheet, joined to a document by voucher_no.
// Quotation and Sales Order use an IDENTICAL LineItems shape (SO adds only the
// vendor column, which lives here too) — so line parsing lives here once.
//
// See Docs/Build-Plans/BULK_HISTORICAL_DATA_IMPORT_PLAN.md.

/**
 * The FIXED LineItems columns (vendor_code applies to Quotation AND SO).
 * Rebate / expense columns are NOT fixed — they follow the costing-worksheet
 * convention: one column PER master code, header `CODE` (or `CODE(%)` for a
 * percent-type code), cell = the per-line value. Those dynamic columns are
 * appended after these by the export / sample builders and detected on import.
 */
export const LINE_ITEM_FIXED_HEADERS = [
    'voucher_no',
    'product_code',
    'vendor_code',
    'qty',
    'unit_price',
    'discount_pct',
    'tax_pct',
    'margin_pct',
    'part_no',
    'hs_code',
    'unit',
    'description',
    'customer_reference',
    'net_weight_kg',
    'gross_weight_kg',
    'package_count',
];

/** Lower-cased fixed columns — anything else is a candidate rebate/expense code. */
const FIXED_SET = new Set(LINE_ITEM_FIXED_HEADERS.map((h) => h.toLowerCase()));

/** Costing-worksheet column header for a rebate/expense code. */
export function costingColHeader(code: string, type?: string): string {
    return String(type || '').toLowerCase() === 'percent'
        ? `${code}(%)`
        : String(code);
}

/** Strip a trailing "(%)" from a costing column header → bare code. */
function stripPct(h: string): string {
    return h
        .trim()
        .replace(/\(%\)\s*$/, '')
        .trim();
}

/** Parse a date cell to ISO yyyy-mm-dd (Excel serial, DD/MM/YYYY, ISO). */
export function parseDateCell(v: any): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
        const ms = Math.round((v - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
        let [, dd, mm, yy] = m;
        if (yy.length === 2) yy = `20${yy}`;
        const day = dd.padStart(2, '0');
        const mon = mm.padStart(2, '0');
        if (Number(mon) < 1 || Number(mon) > 12) return null;
        if (Number(day) < 1 || Number(day) > 31) return null;
        return `${yy}-${mon}-${day}`;
    }
    return null;
}

/** Normalise free text for lenient comparison (lowercase, collapse spaces). */
export function norm(s: any): string {
    return String(s ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Build a comparable formatted string for a saved customer address. */
export function formatAddressText(a: any): string {
    return [
        a?.address_line1,
        a?.address_line2,
        a?.city,
        a?.state,
        a?.country,
        a?.postcode,
    ]
        .filter((x) => x && String(x).trim())
        .join(', ');
}

/**
 * Resolve a typed Bill-to against a customer's saved addresses (lenient: match
 * on label OR formatted text, normalised). Returns:
 *   { id }            — a match (or the default when the cell was blank)
 *   { error: msg }    — a typed value that matched nothing (policy A: caller
 *                       turns this into a per-document error, never a silent
 *                       substitution — Bill-to has no snapshot field).
 */
export function resolveBillTo(
    typed: string,
    addresses: any[]
): { id?: string; error?: string } {
    if (!typed) {
        const def =
            addresses.find((a) => a.is_default && a.type === 'bill_to') ||
            addresses.find((a) => a.is_default) ||
            addresses.find((a) => a.type === 'bill_to') ||
            addresses[0];
        return { id: def ? def._id.toString() : undefined };
    }
    const t = norm(typed);
    const match = addresses.find(
        (a) => norm(a.label) === t || norm(formatAddressText(a)) === t
    );
    if (match) return { id: match._id.toString() };
    return {
        error: `bill_to_address "${typed}" is not a saved address for this customer — blank it to use the default, or add it to the customer first`,
    };
}

export interface ResolvedRebate {
    rebate_id: string | null;
    code: string;
    name: string;
    type: string;
    pct: string;
}
export interface ResolvedExpense {
    expense_id: string | null;
    code: string;
    name: string;
    type: string;
    value: string;
}

export interface ResolvedDocLine {
    rowNum: number;
    product_id: string;
    product_code: string;
    vendor_id?: string;
    vendor_code?: string;
    qty: string;
    unit_price: string;
    discount_pct?: string;
    tax_pct?: string;
    margin_pct?: string;
    part_no?: string;
    hs_code?: string;
    unit?: string;
    description?: string;
    customer_reference?: string;
    net_weight_kg?: string;
    gross_weight_kg?: string;
    package_count?: number;
    product_rebates_snapshot: ResolvedRebate[];
    product_expenses_snapshot: ResolvedExpense[];
}

export interface ParsedLineGroups {
    /** voucher_no (lowercased) → resolved lines */
    byVoucher: Map<string, ResolvedDocLine[]>;
    /** voucher_no (lowercased) → line-level errors */
    errorsByVoucher: Map<string, string[]>;
    /** voucher_no (lowercased) → line-level warnings */
    warningsByVoucher: Map<string, string[]>;
}

const cell = (raw: Record<string, any>, col: string): string => {
    const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === col);
    return key ? String(raw[key] ?? '').trim() : '';
};

/**
 * Parse the LineItems sheet into resolved lines grouped by voucher_no. Products
 * are resolved by code (unknown → per-line error); vendors and rebate/expense
 * codes are resolved best-effort (unknown → warning, skipped). part_no / hs_code
 * / unit blank cells are left null so the create path can fall back to the
 * product master.
 */
export function parseLineItemsSheet(
    lineRows: Record<string, any>[],
    maps: {
        productByCode: Map<string, any>;
        vendorByCode: Map<string, any>;
        rebateByCode: Map<string, any>;
        expenseByCode: Map<string, any>;
    }
): ParsedLineGroups {
    const byVoucher = new Map<string, ResolvedDocLine[]>();
    const errorsByVoucher = new Map<string, string[]>();
    const warningsByVoucher = new Map<string, string[]>();

    const pushErr = (v: string, msg: string) => {
        if (!errorsByVoucher.has(v)) errorsByVoucher.set(v, []);
        errorsByVoucher.get(v).push(msg);
    };
    const pushWarn = (v: string, msg: string) => {
        if (!warningsByVoucher.has(v)) warningsByVoucher.set(v, []);
        warningsByVoucher.get(v).push(msg);
    };

    for (let i = 0; i < lineRows.length; i++) {
        const raw = lineRows[i];
        const rowNum = i + 2;
        const voucher = cell(raw, 'voucher_no');
        const vkey = voucher.toLowerCase();
        if (!voucher) continue; // stray blank line row — ignore
        if (!byVoucher.has(vkey)) byVoucher.set(vkey, []);

        const productCode = cell(raw, 'product_code');
        if (!productCode) continue;
        const product = maps.productByCode.get(productCode.toLowerCase());
        if (!product) {
            pushErr(
                vkey,
                `LineItems row ${rowNum}: product_code "${productCode}" not found`
            );
            continue;
        }

        const qty = cell(raw, 'qty');
        const unit_price = cell(raw, 'unit_price');
        if (!qty || !Number.isFinite(Number(qty)) || Number(qty) <= 0)
            pushErr(vkey, `LineItems row ${rowNum}: qty must be greater than 0`);
        if (
            !unit_price ||
            !Number.isFinite(Number(unit_price)) ||
            Number(unit_price) < 0
        )
            pushErr(
                vkey,
                `LineItems row ${rowNum}: unit_price is required and must be numeric`
            );

        // Vendor (optional, best-effort).
        let vendor_id: string | undefined;
        const vendorCode = cell(raw, 'vendor_code');
        if (vendorCode) {
            const v = maps.vendorByCode.get(vendorCode.toLowerCase());
            if (!v)
                pushWarn(
                    vkey,
                    `LineItems row ${rowNum}: vendor_code "${vendorCode}" not found — left blank`
                );
            else vendor_id = v._id.toString();
        }

        // Rebate / expense: costing-worksheet per-code columns. Each column
        // whose header (minus a trailing "(%)") matches a rebate/expense master
        // code applies that code to the line using the TYPED cell value (a
        // per-line override); a blank cell skips it. Fixed columns are excluded.
        const rebates: ResolvedRebate[] = [];
        const expenses: ResolvedExpense[] = [];
        for (const key of Object.keys(raw)) {
            const kl = key.trim().toLowerCase();
            if (FIXED_SET.has(kl)) continue;
            const bare = stripPct(key).toLowerCase();
            if (!bare) continue;
            const cellRaw = raw[key];
            const em = maps.expenseByCode.get(bare);
            if (em) {
                if (cellRaw === '' || cellRaw === null || cellRaw === undefined)
                    continue; // blank → not applied
                const v = Number(cellRaw);
                if (!Number.isFinite(v)) {
                    pushErr(
                        vkey,
                        `LineItems row ${rowNum}: expense "${em.code}" value "${cellRaw}" is not numeric`
                    );
                    continue;
                }
                expenses.push({
                    expense_id: em._id.toString(),
                    code: em.code,
                    name: em.name,
                    type: String(em.type || 'fixed').toLowerCase(),
                    value: String(v),
                });
                continue;
            }
            const rm = maps.rebateByCode.get(bare);
            if (rm) {
                if (cellRaw === '' || cellRaw === null || cellRaw === undefined)
                    continue; // blank → not applied
                const v = Number(cellRaw);
                if (!Number.isFinite(v)) {
                    pushErr(
                        vkey,
                        `LineItems row ${rowNum}: rebate "${rm.code}" value "${cellRaw}" is not numeric`
                    );
                    continue;
                }
                rebates.push({
                    rebate_id: rm._id.toString(),
                    code: rm.code,
                    name: rm.name,
                    type: String(rm.type || 'percent').toLowerCase(),
                    pct: String(v),
                });
            }
        }

        const pkg = cell(raw, 'package_count');

        byVoucher.get(vkey).push({
            rowNum,
            product_id: product._id.toString(),
            product_code: productCode,
            vendor_id,
            vendor_code: vendorCode || undefined,
            qty,
            unit_price,
            discount_pct: cell(raw, 'discount_pct') || undefined,
            tax_pct: cell(raw, 'tax_pct') || undefined,
            margin_pct: cell(raw, 'margin_pct') || undefined,
            part_no: cell(raw, 'part_no') || undefined,
            hs_code: cell(raw, 'hs_code') || undefined,
            unit: cell(raw, 'unit') || undefined,
            description: cell(raw, 'description') || undefined,
            customer_reference: cell(raw, 'customer_reference') || undefined,
            net_weight_kg: cell(raw, 'net_weight_kg') || undefined,
            gross_weight_kg: cell(raw, 'gross_weight_kg') || undefined,
            package_count: pkg ? Number(pkg) : undefined,
            product_rebates_snapshot: rebates,
            product_expenses_snapshot: expenses,
        });
    }

    return { byVoucher, errorsByVoucher, warningsByVoucher };
}

export interface CostingCodeColumn {
    header: string;
    code: string;
    kind: 'rebate' | 'expense';
}

/**
 * The dynamic per-code costing columns for export / sample, in the same order
 * the costing worksheet uses (active expenses first, then active rebates; each
 * sorted by code). Header carries a "(%)" suffix for percent-type codes.
 */
export function buildCostingCodeColumns(
    rebateMasters: any[],
    expenseMasters: any[]
): CostingCodeColumn[] {
    const isActive = (m: any): boolean =>
        m?.is_active !== false &&
        String(m?.status ?? '').toUpperCase() !== 'INACTIVE';
    const byCode = (a: any, b: any) =>
        String(a.code).localeCompare(String(b.code));
    const cols: CostingCodeColumn[] = [];
    for (const m of (expenseMasters || [])
        .filter((m) => isActive(m) && m.code)
        .sort(byCode))
        cols.push({
            header: costingColHeader(m.code, m.type),
            code: String(m.code),
            kind: 'expense',
        });
    for (const m of (rebateMasters || [])
        .filter((m) => isActive(m) && m.code)
        .sort(byCode))
        cols.push({
            header: costingColHeader(m.code, m.type),
            code: String(m.code),
            kind: 'rebate',
        });
    return cols;
}

/** Find a sheet by (case-insensitive) name, else fall back to a positional index. */
export function pickSheet(
    sheets: Array<{ data: any[]; sheetName?: string }>,
    names: string[],
    fallbackIndex: number
): any[] | null {
    const wanted = names.map((n) => n.toLowerCase());
    const named = sheets.find((s) =>
        wanted.includes(String(s.sheetName || '').trim().toLowerCase())
    );
    if (named) return named.data || [];
    const byIdx = sheets[fallbackIndex];
    return byIdx ? byIdx.data || [] : null;
}
