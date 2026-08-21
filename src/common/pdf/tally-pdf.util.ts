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

/**
 * Exchange-rate display — up to 5dp (only as many as needed, Indian
 * grouping) so a manual hand-check (doc value × this printed rate)
 * reproduces a PDF's precise ₹ figure exactly, instead of landing a few
 * rupees short from a 2dp-rounded rate. Shared by every doc PDF that prints
 * a "1 {ccy} = X INR" line (Invoice, Sales Order, ...).
 */
export const fmtRate = (v: any): string => {
    const n = Number(v);
    if (!isFinite(n)) return escHtml(v);
    return n.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 5,
    });
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * THE date format for every printed document: "2026-06-03" → "03-06-2026".
 *
 * One function, used by every PDF. Before this the documents disagreed with each
 * other: the Invoice and PFI printed the raw ISO string ("2026-06-03"), the
 * Sales Order and Vendor PO printed Tally's "3-Jun-26", and the payslip printed
 * "03/06/2026" — so the same customer could receive three date formats from one
 * business.
 *
 * Accepts a plain date ("2026-06-03") or a full ISO datetime; the time part is
 * sliced off BEFORE parsing so a UTC timestamp can never roll the day backwards
 * in a positive-offset timezone.
 */
export const docDate = (v?: string | null | Date): string => {
    if (!v) return '';

    const fromParts = (dt: Date): string =>
        `${pad2(dt.getDate())}-${pad2(dt.getMonth() + 1)}-${dt.getFullYear()}`;

    if (v instanceof Date) {
        return isNaN(v.getTime()) ? '' : fromParts(v);
    }

    // ISO-ish ("2026-06-03" or "2026-06-03T…"): read the parts by hand rather
    // than through `new Date()`, which treats a bare date as UTC midnight and
    // shifts the day backwards west of Greenwich.
    const s = String(v);
    const iso = s.slice(0, 10).split('-').map(Number);
    if (iso.length === 3 && iso.every(n => n > 0)) {
        const [y, m, d] = iso;
        return `${pad2(d)}-${pad2(m)}-${y}`;
    }

    // Anything else — a Date that was already String()'d ("Tue Jul 14 2026
    // 17:43:19 GMT+0530 (India Standard Time)"), a locale string, a timestamp.
    // Parse it rather than echoing it: this fallback used to return the input
    // verbatim, which is exactly how that GMT+0530 monster reached a customer's
    // Purchase Order.
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return fromParts(parsed);

    // Genuinely not a date. Return nothing — a blank cell is honest; the raw
    // string is not a date and must never be printed as though it were one.
    return '';
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
