/**
 * Shared primitives for the Tally-style document PDFs (Sales Order,
 * Purchase Order / PO-Vendor). Kept framework-free so both the
 * `po-pdf.service` and `po-vendor-pdf.service` render an identical look
 * without duplicating the helpers.
 */

/** HTML-escape a value for safe interpolation into the template. */
export const escHtml = (v: any): string =>
    v == null
        ? ''
        : String(v)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');

/** 2-decimal money, Indian grouping (e.g. "1,578.15"). */
export const fmt2 = (v: any): string => {
    const n = Number(v);
    if (!isFinite(n)) return escHtml(v);
    return n.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/** 4-decimal money (Tally export rate/amount style, e.g. "2.6880"). */
export const fmt4 = (v: any): string => {
    const n = Number(v);
    if (!isFinite(n)) return escHtml(v);
    return n.toLocaleString('en-US', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
    });
};

const TALLY_MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-06-03" → "3-Jun-26" (Tally voucher date format). */
export const tallyDate = (v?: string | null): string => {
    if (!v) return '';
    const s = String(v).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return escHtml(s);
    return `${d}-${TALLY_MONTHS[m - 1] || m}-${String(y).slice(2)}`;
};

/** Multi-line address block from structured parts (blank parts skipped). */
export function joinAddress(a: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
}): string | undefined {
    const parts: string[] = [];
    if (a.address_line1) parts.push(a.address_line1);
    if (a.address_line2) parts.push(a.address_line2);
    const cityLine = [a.city, a.state, a.postcode].filter(Boolean).join(', ');
    if (cityLine) parts.push(cityLine);
    if (a.country) parts.push(a.country);
    return parts.length ? parts.join('\n') : undefined;
}

/** Centred "computer generated" note, repeated at the bottom of every page. */
export function buildTallyFooterTemplate(): string {
    return `<div style="width:100%;font-size:8px;color:#444;text-align:center;font-family:Arial,Helvetica,sans-serif;padding-top:2px;">This is a Computer Generated Document</div>`;
}
