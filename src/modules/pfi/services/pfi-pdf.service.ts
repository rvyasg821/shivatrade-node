import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { PfiPublicResponseDto } from '../dtos/response/pfi.public.response.dto';

/**
 * Build the HTML for a PFI PDF from its sanitized public DTO and hand it
 * to the generic PdfService. The HTML mirrors the public web view's
 * structure but is fully self-contained (inline styles) so Puppeteer can
 * render it without external assets.
 */
@Injectable()
export class PfiPdfService {
    constructor(private readonly pdfService: PdfService) {}

    async render(p: PfiPublicResponseDto): Promise<Buffer> {
        const html = buildPfiHtml(p);
        return this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '22mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildHeaderTemplate(p),
            footerTemplate: buildFooterTemplate(p),
        });
    }

    /** Derive the download filename from the voucher number (slashes → hyphens). */
    buildFilename(p: PfiPublicResponseDto): string {
        const safe = (p.voucher_no || 'PFI')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }
}

// ─── HTML builders ──────────────────────────────────────────────────────

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

function buildHeaderTemplate(p: PfiPublicResponseDto): string {
    // Puppeteer headerTemplate is rendered in its own little iframe per page —
    // styles must be inline. Keep it minimal: company name + voucher.
    return `
    <div style="font-size:9px;width:100%;padding:0 15mm;color:#444;
                border-bottom:1px solid #ccc;display:flex;
                justify-content:space-between;align-items:center;">
      <span>${esc(p.company_name || '')}</span>
      <span><strong>PROFORMA INVOICE</strong> &middot; ${esc(p.voucher_no || '')}</span>
    </div>`;
}

function buildFooterTemplate(p: PfiPublicResponseDto): string {
    return `
    <div style="font-size:8px;width:100%;padding:0 15mm;color:#555;
                border-top:1px solid #ccc;display:flex;
                justify-content:space-between;align-items:center;">
      <span>${esc(p.voucher_no || '')}</span>
      <span class="pageNumber"></span>/<span class="totalPages"></span>
    </div>`;
}

function buildPfiHtml(p: PfiPublicResponseDto): string {
    const lines = p.lines || [];
    const linesRows = lines.length
        ? lines
              .map(
                  (l, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div style="font-weight:600">${esc(l.product_name || '-')}</div>
            ${l.description ? `<div style="color:#666;font-size:10px">${esc(l.description)}</div>` : ''}
          </td>
          <td>${esc(l.hs_code || '-')}</td>
          <td class="num">${esc(l.qty || '-')}</td>
          <td>${esc(l.unit || '-')}</td>
          <td class="num">${money(p, l.unit_price)}</td>
          <td class="num">${fmt(l.net_weight_kg || 0)}</td>
          <td class="num">${fmt(l.gross_weight_kg || 0)}</td>
          <td class="num">${esc(String(l.package_count ?? 0))}</td>
          <td class="num" style="font-weight:600">${money(p, l.line_total)}</td>
        </tr>`
              )
              .join('')
        : `<tr><td colspan="10" style="text-align:center;color:#999;padding:14px">No line items.</td></tr>`;

    const shippingBlock =
        p.port_of_loading || p.port_of_discharge || p.mode_of_shipment
            ? `
      <div class="block">
        <div class="block-title">Shipping</div>
        <div class="grid">
          ${kv('Port of Loading', p.port_of_loading)}
          ${kv('Port of Discharge', p.port_of_discharge)}
          ${kv('Final Destination', p.final_destination)}
          ${kv('Mode', p.mode_of_shipment)}
          ${kv('Country of Origin', p.country_of_origin)}
          ${kv('Country of Destination', p.country_of_final_destination)}
          ${kv('Container', p.container_details)}
          ${kv('Est. Shipment', (p.est_shipment_date || '').slice(0, 10))}
          ${kv('Est. Delivery', (p.est_delivery_date || '').slice(0, 10))}
        </div>
      </div>`
            : '';

    const packingBlock =
        (p.total_packages || 0) > 0 || p.gross_weight_kg || p.packing_marks
            ? `
      <div class="block">
        <div class="block-title">Packing</div>
        <div class="grid">
          ${kv('Total Packages', `${p.total_packages || 0}${p.packing_type ? ` × ${esc(p.packing_type)}` : ''}`)}
          ${kv('Net Weight', `${fmt(p.net_weight_kg || 0)} kg`)}
          ${kv('Gross Weight', `${fmt(p.gross_weight_kg || 0)} kg`)}
          ${kv('Marks', p.packing_marks)}
        </div>
      </div>`
            : '';

    const bankBlock = p.bank
        ? `
      <div class="block">
        <div class="block-title">Beneficiary Bank Details</div>
        <div class="grid">
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
                        `${esc(p.bank.branch_name)}${p.bank.branch_address ? ', ' + esc(p.bank.branch_address) : ''}`,
                        true
                    )
                  : ''
          }
        </div>
      </div>`
        : '';

    const consigneeBlock =
        p.consignee_name || p.consignee_address
            ? `
      <div class="party">
        <div class="party-label">Consignee</div>
        <div class="party-name">${esc(p.consignee_name || '-')}</div>
        ${p.consignee_address ? `<div class="party-addr">${esc(p.consignee_address).replace(/\n/g, '<br/>')}</div>` : ''}
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
    font-size: 11px;
    color: #222;
    margin: 0;
  }
  h1, h2, h3, h4 { margin: 0; }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .title-row .doc-title {
    text-align: right;
  }
  .title-row .doc-title h2 {
    font-size: 18px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }
  .party { flex: 1; }
  .party-label { color: #777; font-size: 10px; text-transform: uppercase; }
  .party-name { font-weight: 600; font-size: 12px; }
  .party-addr { color: #555; font-size: 10px; white-space: pre-line; }
  .meta {
    text-align: right;
    font-size: 10px;
    color: #555;
  }
  .block {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 10px;
    background: #fafafa;
  }
  .block-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px 12px;
    font-size: 10.5px;
  }
  .grid .kv-full { grid-column: 1 / -1; }
  .grid .k { color: #777; }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  table.lines th {
    background: #eee;
    border: 1px solid #ccc;
    padding: 5px 6px;
    font-size: 10.5px;
    text-align: left;
  }
  table.lines td {
    border: 1px solid #ddd;
    padding: 5px 6px;
    font-size: 10.5px;
    vertical-align: top;
    page-break-inside: avoid;
  }
  table.lines td.num, table.lines th.num { text-align: right; }
  .totals {
    width: 50%;
    margin-left: auto;
    margin-bottom: 12px;
    font-size: 11px;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
  .totals .row.grand {
    border-top: 2px solid #333;
    padding-top: 6px;
    margin-top: 4px;
    font-weight: 700;
    font-size: 13px;
  }
  .declaration, .notes {
    border-top: 1px solid #ddd;
    padding-top: 6px;
    margin-top: 8px;
    font-size: 10.5px;
    white-space: pre-line;
  }
  .declaration .lbl, .notes .lbl {
    color: #777;
    text-transform: uppercase;
    font-size: 9.5px;
    margin-bottom: 2px;
  }
  .signature {
    margin-top: 30px;
    display: flex;
    justify-content: flex-end;
    font-size: 10.5px;
  }
  .signature .box {
    width: 220px;
    border-top: 1px solid #333;
    padding-top: 4px;
    text-align: center;
    color: #555;
  }
</style>
</head>
<body>

  <div class="title-row">
    <div>
      <h3>${esc(p.company_name || '')}</h3>
      ${p.company_address ? `<div style="font-size:10px;color:#555;white-space:pre-line">${esc(p.company_address)}</div>` : ''}
      <div style="font-size:10px;color:#555">
        ${p.company_phone ? esc(p.company_phone) + ' &middot; ' : ''}${esc(p.company_email || '')}
        ${p.company_iec ? ' &middot; IEC: ' + esc(p.company_iec) : ''}
      </div>
    </div>
    <div class="doc-title">
      <h2>Proforma Invoice</h2>
      <div style="font-weight:600">${esc(p.voucher_no || '')}</div>
      <div class="meta">
        Date: ${esc((p.pfi_date || '').slice(0, 10) || '-')}<br/>
        ${p.valid_until ? `Valid Until: ${esc(p.valid_until.slice(0, 10))}<br/>` : ''}
        Currency: ${esc(p.currency_code || '-')}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Exporter</div>
      <div class="party-name">${esc(p.company_name || '-')}</div>
      ${p.company_address ? `<div class="party-addr">${esc(p.company_address)}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Buyer</div>
      <div class="party-name">${esc(p.customer_name || '-')}</div>
      ${p.customer_contact_name ? `<div style="font-size:10px">${esc(p.customer_contact_name)}</div>` : ''}
      ${p.customer_address ? `<div class="party-addr">${esc(p.customer_address)}</div>` : ''}
      ${p.customer_phone ? `<div style="font-size:10px">${esc(p.customer_phone)}</div>` : ''}
      ${p.customer_email ? `<div style="font-size:10px">${esc(p.customer_email)}</div>` : ''}
    </div>
    ${consigneeBlock}
  </div>

  ${shippingBlock}

  <table class="lines">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>HS Code</th>
        <th class="num">Qty</th>
        <th>Unit</th>
        <th class="num">Rate</th>
        <th class="num">Net Wt</th>
        <th class="num">Gross Wt</th>
        <th class="num">Pkgs</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${linesRows}
    </tbody>
  </table>

  ${packingBlock}

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(p, p.subtotal)}</span></div>
    <div class="row"><span>GST</span><span>${money(p, p.gst_total)}</span></div>
    <div class="row grand"><span>Grand Total</span><span>${money(p, p.grand_total)}</span></div>
  </div>

  ${bankBlock}

  ${
      p.payment_terms_text
          ? `<div class="declaration"><div class="lbl">Payment Terms</div>${esc(p.payment_terms_text)}</div>`
          : ''
  }
  ${
      p.declaration_text
          ? `<div class="declaration"><div class="lbl">Declaration</div>${esc(p.declaration_text)}</div>`
          : ''
  }
  ${
      p.notes_to_client
          ? `<div class="notes"><div class="lbl">Notes</div>${esc(p.notes_to_client)}</div>`
          : ''
  }

  <div class="signature">
    <div class="box">For ${esc(p.company_name || '')}<br/><span style="color:#999">Authorised Signatory</span></div>
  </div>

</body>
</html>`;
}

function kv(label: string, value: any, full = false): string {
    if (value == null || value === '') return '';
    return `<div${full ? ' class="kv-full"' : ''}><span class="k">${esc(label)}:</span> ${esc(value)}</div>`;
}
