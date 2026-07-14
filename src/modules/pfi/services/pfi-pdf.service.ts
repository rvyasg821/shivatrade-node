import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { docDate } from '@common/pdf/tally-pdf.util';
import { PfiPublicResponseDto } from '../dtos/response/pfi.public.response.dto';

// Embed the ShivaTrade logo once at module load. Puppeteer renders the
// HTML in a fresh chrome context so external file:// URLs are flaky —
// a data URI is the most reliable transport.
const LOGO_DATA_URI: string = (() => {
    try {
        const p = path.resolve(process.cwd(), 'public', 'shivatrade-logo.png');
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
        return '';
    }
})();

/**
 * Renders the PFI PDF using the same neutral / professional layout as the
 * public web preview (white doc on light-grey background, hairline
 * borders, 3-column party grid, only Grand Total in totals).
 */
@Injectable()
export class PfiPdfService {
    constructor(private readonly pdfService: PdfService) {}

    async render(p: PfiPublicResponseDto): Promise<Buffer> {
        const html = buildPfiHtml(p);
        return this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '18mm',
                right: '12mm',
                bottom: '18mm',
                left: '12mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildHeaderTemplate(p),
            footerTemplate: buildFooterTemplate(p),
        });
    }

    buildFilename(p: PfiPublicResponseDto): string {
        const safe = (p.voucher_no || 'PFI')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }
}

// ─── helpers ────────────────────────────────────────────────────────────

const esc = (v: any): string =>
    v == null
        ? ''
        : String(v)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');

const fmt = (v: any): string => {
    const n = Number(v);
    if (!isFinite(n)) return esc(v);
    return n.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const sym = (p: PfiPublicResponseDto): string =>
    p.currency_symbol || p.currency_code || '';

const money = (p: PfiPublicResponseDto, v: any): string =>
    `${esc(sym(p))}${fmt(v)}`;

/** DD-MM-YYYY, same as every other printed document. Was the raw ISO slice. */
const dateOnly = (v?: string | null): string => (v ? esc(docDate(v)) : '');

function buildHeaderTemplate(p: PfiPublicResponseDto): string {
    return `
    <div style="font-size:8.5px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(p.company_name || '')}</span>
      <span><strong style="color:#1f2937">PROFORMA INVOICE</strong> · ${esc(p.voucher_no || '')}</span>
    </div>`;
}

function buildFooterTemplate(p: PfiPublicResponseDto): string {
    return `
    <div style="font-size:8px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(p.voucher_no || '')}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
}

function kv(label: string, value: any, full = false): string {
    if (value == null || value === '') return '';
    return `<div${full ? ' class="kv-full"' : ''}><span class="k">${esc(label)}:</span> <span class="v">${esc(value)}</span></div>`;
}

function buildPfiHtml(p: PfiPublicResponseDto): string {
    const lines = p.lines || [];
    const linesRows = lines.length
        ? lines
              .map(
                  (l, i) => `
        <tr>
          <td class="muted">${i + 1}</td>
          <td>
            <div class="fw">${esc(l.product_name || '-')}</div>
          </td>
          <td class="num">${esc(l.qty || '-')}</td>
          <td>${esc(l.unit || '-')}</td>
          <td class="num">${money(p, l.unit_price)}</td>
          <td class="num">${fmt(l.net_weight_kg || 0)}</td>
          <td class="num">${fmt(l.gross_weight_kg || 0)}</td>
          <td class="num">${esc(String(l.package_count ?? 0))}</td>
          <td class="num fw">${money(p, l.line_total)}</td>
        </tr>`
              )
              .join('')
        : `<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">No line items.</td></tr>`;

    const shippingRows: Array<[string, any]> = [
        ['Port of Loading', p.port_of_loading],
        ['Port of Discharge', p.port_of_discharge],
        ['Final Destination', p.final_destination],
        ['Mode', p.mode_of_shipment],
        ['Country of Origin', p.country_of_origin],
        ['Country of Destination', p.country_of_final_destination],
        // Container details inline with the rest of the shipping rows.
        ['Container', p.container_used === true ? 'Yes' : 'No'],
        ...(p.container_used === true
            ? ([
                  ['Container Qty × Size', p.container_details],
                  ['Container No.', p.container_no],
                  ['Seal No.', p.seal_no],
                  ['Load Type', p.container_load_type],
              ] as Array<[string, any]>)
            : []),
        ['Est. Shipment', dateOnly(p.est_shipment_date as any)],
        ['Est. Delivery', dateOnly(p.est_delivery_date as any)],
    ].filter((r) => !!r[1]) as Array<[string, any]>;

    const shippingBlock = shippingRows.length
        ? `
      <div class="section">
        <div class="label">Shipping</div>
        <div class="kv-grid">${shippingRows.map(([k, v]) => kv(k, v)).join('')}</div>
      </div>`
        : '';

    const hasPacking =
        (p.total_packages || 0) > 0 ||
        !!p.net_weight_kg ||
        !!p.gross_weight_kg ||
        !!p.packing_marks;

    const packingBlock = hasPacking
        ? `
      <div class="section">
        <div class="label">Packing</div>
        <div class="kv-grid">
          ${kv('Total Packages', `${p.total_packages || 0}${p.packing_type ? ` × ${esc(p.packing_type)}` : ''}`)}
          ${kv('Net Wt', `${fmt(p.net_weight_kg || 0)} kg`)}
          ${kv('Gross Wt', `${fmt(p.gross_weight_kg || 0)} kg`)}
          ${kv('Marks', p.packing_marks)}
        </div>
      </div>`
        : '';

    const bankBlock = p.bank
        ? `
      <div class="section">
        <div class="label">Beneficiary Bank Details</div>
        <div class="kv-grid">
          ${kv('Beneficiary', p.bank.beneficiary_name)}
          ${kv('Bank', p.bank.bank_name)}
          ${kv('Account No.', p.bank.account_number)}
          ${kv('SWIFT', p.bank.swift_code)}
          ${kv('IFSC', p.bank.ifsc)}
          ${kv('IBAN', p.bank.iban)}
          ${kv('AD Code', p.bank.ad_code)}
          ${kv('Account Currency', p.bank.currency_code)}
          ${
              p.bank.branch_name
                  ? kv(
                        'Branch',
                        `${p.bank.branch_name}${p.bank.branch_address ? ', ' + p.bank.branch_address : ''}`,
                        true
                    )
                  : ''
          }
        </div>
      </div>`
        : '';

    // Consignee block — uses p.consignee_name / p.consignee_address which
    // mapPublic populates from consignee_snapshot when set, else falls
    // back to the buyer (customer) for single-party PFIs.
    const consigneeBlock = p.consignee_name
        ? `
      <div class="section">
        <div class="label">Consignee</div>
        <div class="party-name">${esc(p.consignee_name)}</div>
        ${p.consignee_address ? `<div class="party-line" style="white-space:pre-line">${esc(p.consignee_address)}</div>` : ''}
      </div>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(p.voucher_no || 'PFI')}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5px;
    color: #1f2937;
    margin: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc { width: 100%; }
  .qd-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .qd-title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 2px;
    margin: 0;
    color: #1f2937;
    text-transform: uppercase;
  }
  .voucher { color: #6b7280; font-size: 10px; margin-top: 2px; }
  .status-badge {
    display: inline-block;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
    text-transform: capitalize;
    letter-spacing: 0.2px;
    margin-top: 5px;
  }
  .company-name { font-weight: 600; color: #1f2937; font-size: 11.5px; margin-top: 4px; }
  .party-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 22px;
    margin-bottom: 18px;
  }
  .label {
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    font-size: 8.5px;
    letter-spacing: 0.6px;
    margin-bottom: 5px;
  }
  .party-name { font-weight: 600; color: #1f2937; margin-bottom: 3px; font-size: 10.5px; }
  .party-line { font-size: 9.8px; color: #4b5563; line-height: 1.5; }
  .muted, .party-muted { color: #6b7280; }
  .sm { font-size: 9.5px; }
  .fw { font-weight: 600; color: #1f2937; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 0;
  }
  table.items thead th {
    background: #f9fafb;
    color: #4b5563;
    font-weight: 600;
    font-size: 8.5px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 8px 7px;
    text-align: left;
  }
  table.items td {
    border-bottom: 1px solid #f1f2f4;
    padding: 8px 7px;
    font-size: 10px;
    vertical-align: top;
    page-break-inside: avoid;
  }
  table.items tbody tr:last-child td { border-bottom: 1px solid #e5e7eb; }
  table.items th.num, table.items td.num { text-align: right; }
  /* Grand-total row sits inside <tbody> (not <tfoot>) so it does NOT
     repeat on every printed page — puppeteer renders <tfoot> as a
     per-page footer by default. */
  table.items tr.row-grand-tr td {
    padding: 12px 7px 6px;
    font-size: 12px;
    font-weight: 700;
    color: #09418b;
    background: transparent;
    border: 0;
  }
  table.items tr.row-grand-tr td.grand-label,
  table.items tr.row-grand-tr td.grand-value {
    border-top: 2px solid #1f2937;
    white-space: nowrap;
    text-align: right;
  }
  .section {
    margin-top: 14px;
    padding-top: 0;
    border-top: 0;
  }
  .section .body {
    font-size: 10px;
    color: #4b5563;
    line-height: 1.55;
    white-space: pre-line;
  }
  .kv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px 22px;
    font-size: 9.8px;
    color: #4b5563;
  }
  .kv-grid .kv-full { grid-column: 1 / -1; }
  .kv-grid .k { color: #6b7280; }
  .kv-grid .v { color: #1f2937; font-weight: 600; }
  .signature {
    margin-top: 26px;
    display: flex;
    justify-content: flex-end;
    font-size: 9.5px;
  }
  .signature .box {
    width: 200px;
    border-top: 1px solid #9ca3af;
    padding-top: 4px;
    text-align: center;
    color: #6b7280;
  }
  .footer-note {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    color: #6b7280;
    font-size: 9px;
  }
</style>
</head>
<body>
<div class="doc">

  <div class="qd-header">
    <div>
      ${LOGO_DATA_URI ? `<img src="${LOGO_DATA_URI}" alt="ShivaTrade" style="height:34px;margin-bottom:8px;display:block" />` : ''}
      <div class="company-name">${esc(p.company_name || '-')}</div>
      ${p.company_address ? `<div class="party-line muted" style="white-space:pre-line">${esc(p.company_address)}</div>` : ''}
      <div class="party-line muted">
        ${p.company_phone ? esc(p.company_phone) + ' · ' : ''}${esc(p.company_email || '')}
        ${p.company_iec ? ' · IEC: ' + esc(p.company_iec) : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="qd-title">Proforma Invoice</div>
      <div class="voucher">#${esc(p.voucher_no || '-')}</div>
      <div class="voucher">
        Date: <span class="fw">${dateOnly(p.pfi_date as any) || '-'}</span>
        · Currency: <span class="fw">${esc(sym(p))} ${esc(p.currency_code || '-')}</span>
      </div>
      ${p.status ? `<span class="status-badge">${esc(p.status)}</span>` : ''}
    </div>
  </div>

  <div class="party-grid">
    <div>
      <div class="label">Exporter</div>
      <div class="party-name">${esc(p.company_name || '-')}</div>
      ${p.company_address ? `<div class="party-line" style="white-space:pre-line">${esc(p.company_address)}</div>` : ''}
      ${p.company_phone ? `<div class="party-line">${esc(p.company_phone)}</div>` : ''}
      ${p.company_email ? `<div class="party-line">${esc(p.company_email)}</div>` : ''}
      ${p.company_iec ? `<div class="party-line muted">IEC: ${esc(p.company_iec)}</div>` : ''}
    </div>
    <div>
      <div class="label">Buyer</div>
      <div class="party-name">${esc(p.customer_name || '-')}</div>
      ${p.customer_contact_name ? `<div class="party-line">${esc(p.customer_contact_name)}</div>` : ''}
      ${p.customer_address ? `<div class="party-line" style="white-space:pre-line">${esc(p.customer_address)}</div>` : ''}
      ${p.customer_phone ? `<div class="party-line">${esc(p.customer_phone)}</div>` : ''}
      ${p.customer_email ? `<div class="party-line">${esc(p.customer_email)}</div>` : ''}
    </div>
    <div>
      <div class="label">Consignee</div>
      <div class="party-name">${esc(p.consignee_name || p.customer_name || '-')}</div>
      ${
          p.consignee_address || p.customer_address
              ? `<div class="party-line" style="white-space:pre-line">${esc((p.consignee_address || p.customer_address) as string)}</div>`
              : ''
      }
      ${p.valid_until ? `<div class="party-line muted">Valid Until: ${dateOnly(p.valid_until as any)}</div>` : ''}
    </div>
  </div>

  ${shippingBlock}

  <div class="section" style="border-top:none;padding-top:0;margin-top:18px">
    <table class="items">
      <thead>
        <tr>
          <th style="width:22px">#</th>
          <th>Product / Description</th>
          <th class="num" style="width:42px">Qty</th>
          <th style="width:36px">Unit</th>
          <th class="num" style="width:58px">Rate</th>
          <th class="num" style="width:50px">Net Wt</th>
          <th class="num" style="width:72px">Gross Wt</th>
          <th class="num" style="width:40px">Pkgs</th>
          <th class="num" style="width:66px">Amount</th>
        </tr>
      </thead>
      <tbody>${linesRows}
        <tr class="row-grand-tr">
          <td colspan="7"></td>
          <td class="grand-label">Grand Total</td>
          <td class="grand-value">${money(p, p.grand_total)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${packingBlock}

  ${bankBlock}

  ${
      p.payment_terms
          ? `<div class="section"><div class="label">Payment Terms</div><div class="body">${esc(p.payment_terms)}</div></div>`
          : ''
  }
  ${
      p.declaration_text
          ? `<div class="section"><div class="label">Declaration</div><div class="body">${esc(p.declaration_text)}</div></div>`
          : ''
  }
  ${
      p.notes_to_client
          ? `<div class="section"><div class="label">Notes</div><div class="body">${esc(p.notes_to_client)}</div></div>`
          : ''
  }

  <div class="signature">
    <div class="box">For ${esc(p.company_name || '')}<br/><span style="color:#9ca3af">Authorised Signatory</span></div>
  </div>


</div>
</body>
</html>`;
}
