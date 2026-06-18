import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared PDF letterhead (header) + running footer builders.
 *
 * One source of truth for the sales-document PDF look so every doc
 * (Quotation today; Sales Order / Invoice / etc. later) renders the same
 * professional letterhead. The header carries the company identity — logo,
 * name, address, phone, email — sourced from the company profile. The footer
 * shows the voucher number and page numbers (no marketing copy).
 */

export interface PdfLetterheadCompany {
    /** Embedded logo (data: URI). Use `loadCompanyLogoDataUri` to build it. */
    logoDataUri?: string;
    name?: string;
    /** Multi-line address (newlines become <br/>). */
    address?: string;
    phone?: string;
    email?: string;
    /** Extra muted identity lines, e.g. `['IEC: …', 'GSTIN: …']`. */
    extraLines?: string[];
}

export interface PdfLetterheadDoc {
    /** Document label, e.g. `'Quotation'`. */
    title: string;
    voucherNo?: string;
    /** Extra right-aligned meta lines, e.g. `['Date: 2026-06-18', 'Source RFQ: …']`. */
    metaLines?: string[];
    /** Optional status pill text. */
    statusBadge?: string;
}

export function escapePdfHtml(s: any): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Read a company logo into a `data:` URI for embedding (Puppeteer can't be
 * relied on to fetch over the network). `logoUrl` is the value stored on
 * company-settings, e.g. `/assets/logos/logo_xxx.png` → `public/logos/…`.
 * Falls back to the bundled ShivaTrade logo when the company has none.
 */
export function loadCompanyLogoDataUri(logoUrl?: string): string {
    // Remote logo — hand the URL straight through (rare).
    if (logoUrl && /^https?:\/\//i.test(logoUrl)) return logoUrl;

    const candidates: string[] = [];
    if (logoUrl) {
        const rel = logoUrl.replace(/^\/assets\//, 'public/').replace(/^\/+/, '');
        candidates.push(path.resolve(process.cwd(), rel));
    }
    // Fallback to the bundled brand logo.
    candidates.push(path.resolve(process.cwd(), 'public', 'shivatrade-logo.png'));

    for (const file of candidates) {
        try {
            const buf = fs.readFileSync(file);
            const ext = path.extname(file).toLowerCase();
            const mime =
                ext === '.svg'
                    ? 'image/svg+xml'
                    : ext === '.jpg' || ext === '.jpeg'
                      ? 'image/jpeg'
                      : ext === '.webp'
                        ? 'image/webp'
                        : 'image/png';
            return `data:${mime};base64,${buf.toString('base64')}`;
        } catch {
            // try next candidate
        }
    }
    return '';
}

/**
 * The in-document letterhead block: logo + company identity on the left,
 * document title / voucher / meta / status on the right. Fully inline-styled
 * so any PDF template can drop it in without extra CSS.
 */
export function buildPdfLetterhead(
    company: PdfLetterheadCompany,
    doc: PdfLetterheadDoc
): string {
    const e = escapePdfHtml;
    const addressHtml = company.address
        ? `<div style="font-size:9.8px;color:#4b5563;line-height:1.5;white-space:pre-line">${e(
              company.address
          ).replace(/\n/g, '<br/>')}</div>`
        : '';
    const phoneHtml = company.phone
        ? `<div style="font-size:9.8px;color:#4b5563;line-height:1.5">${e(company.phone)}</div>`
        : '';
    const emailHtml = company.email
        ? `<div style="font-size:9.8px;color:#4b5563;line-height:1.5">${e(company.email)}</div>`
        : '';
    const extraHtml = (company.extraLines || [])
        .filter(Boolean)
        .map(
            (l) =>
                `<div style="font-size:9.8px;color:#6b7280;line-height:1.5">${e(l)}</div>`
        )
        .join('');

    const metaHtml = (doc.metaLines || [])
        .filter(Boolean)
        .map((l) => `<div style="color:#6b7280;font-size:10px;margin-top:2px">${l}</div>`)
        .join('');
    const statusHtml = doc.statusBadge
        ? `<span style="display:inline-block;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;padding:2px 9px;border-radius:999px;font-size:9px;font-weight:600;text-transform:capitalize;letter-spacing:0.2px;margin-top:5px">${e(
              doc.statusBadge
          )}</span>`
        : '';

    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e5e7eb;padding-bottom:14px;margin-bottom:18px">
  <div style="max-width:60%">
    ${company.logoDataUri ? `<img src="${company.logoDataUri}" alt="logo" style="max-height:48px;max-width:170px;width:auto;height:auto;object-fit:contain;display:block;margin-bottom:8px" />` : ''}
    ${company.name ? `<div style="font-weight:600;color:#1f2937;font-size:11.5px;margin-bottom:3px">${e(company.name)}</div>` : ''}
    ${addressHtml}
    ${phoneHtml}
    ${emailHtml}
    ${extraHtml}
  </div>
  <div style="text-align:right">
    <div style="font-size:16px;font-weight:600;letter-spacing:2px;color:#1f2937;text-transform:uppercase">${e(doc.title)}</div>
    ${doc.voucherNo ? `<div style="color:#6b7280;font-size:10px;margin-top:2px">#${e(doc.voucherNo)}</div>` : ''}
    ${metaHtml}
    ${statusHtml}
  </div>
</div>`;
}

/**
 * Puppeteer running page header (top of every page). Mirrors the quotation
 * style: company name on the left, `<DOC> · voucher` on the right.
 */
export function buildPdfHeaderTemplate(opts: {
    companyName?: string;
    docLabel: string;
    voucherNo?: string;
}): string {
    const e = escapePdfHtml;
    return `<div style="font-size:8.5px;width:100%;padding:0 12mm;color:#6b7280;display:flex;justify-content:space-between;align-items:center;"><span>${e(
        opts.companyName || ''
    )}</span><span><strong style="color:#1f2937">${e(
        opts.docLabel
    )}</strong> · ${e(opts.voucherNo || '')}</span></div>`;
}

/**
 * Puppeteer running page footer. Optional single-line company address and a
 * muted identity line (GSTIN · PAN · CIN · IEC · website) centered on top,
 * then voucher number (left) + page numbers (right). Intentionally carries
 * no "Thank you for your business" line.
 */
export function buildPdfFooterTemplate(opts: {
    voucherNo?: string;
    addressLine?: string;
    idLine?: string;
}): string {
    const e = escapePdfHtml;
    const addressRow = opts.addressLine
        ? `<div style="text-align:center;margin-bottom:1px;color:#4b5563">${e(opts.addressLine)}</div>`
        : '';
    const idRow = opts.idLine
        ? `<div style="text-align:center;margin-bottom:2px;color:#9ca3af">${e(opts.idLine)}</div>`
        : '';
    return `<div style="font-size:8px;width:100%;padding:0 12mm;color:#6b7280;">${addressRow}${idRow}<div style="display:flex;justify-content:space-between;align-items:center;"><span>${e(
        opts.voucherNo || ''
    )}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div></div>`;
}
