import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { PurchaseOrderGetResponseDto } from '../dtos/response/purchase-order.get.response.dto';

/**
 * Generates the vendor-facing PO PDF.
 * Mirrors the PFI PDF pattern: this thin wrapper assembles a self-contained
 * HTML document and hands it to the generic Puppeteer-based `PdfService`.
 */
@Injectable()
export class PoPdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository
    ) {}

    async render(
        po: PurchaseOrderGetResponseDto,
        companyId: string
    ): Promise<Buffer> {
        const ctx = await this.buildContext(po, companyId);
        const html = buildPoHtml(ctx);
        return this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '22mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildHeaderTemplate(ctx),
            footerTemplate: buildFooterTemplate(ctx),
        });
    }

    /** STIPL/OS0001/2026-27 → STIPL-OS0001-2026-27.pdf */
    buildFilename(po: PurchaseOrderGetResponseDto): string {
        const safe = (po.voucher_no || 'PO')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }

    private async buildContext(
        po: PurchaseOrderGetResponseDto,
        companyId: string
    ): Promise<PoPdfContext> {
        let company: any = null;
        try {
            company = await this.companyService.findOneById(companyId);
        } catch {
            // graceful — header degrades to blank seller block
        }

        let companyAddress: string | undefined;
        let companyGstin: string | undefined;
        try {
            const addresses =
                await this.companyAddressRepository.findByCompanyId(companyId);
            const corp =
                (addresses || []).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a: any) => a.type === 'corporate') ||
                (addresses || []).find((a: any) => a.is_default) ||
                (addresses || [])[0];
            if (corp) {
                companyAddress = joinAddress({
                    address_line1: (corp as any).address_line1,
                    address_line2: (corp as any).address_line2,
                    city: (corp as any).city,
                    state: (corp as any).state,
                    postcode: (corp as any).postcode,
                    country: (corp as any).country,
                });
                companyGstin = (corp as any).gstin || undefined;
            }
        } catch {
            // ignore
        }
        if (!companyAddress && company) {
            companyAddress = joinAddress({
                address_line1: company.address_1,
                address_line2: company.address_2,
                city: company.city,
                state: company.state,
                postcode: company.zipcode,
                country: company.country,
            });
        }
        if (!companyGstin && company?.tax_number) {
            companyGstin = company.tax_number;
        }

        let vendorAddress: string | undefined;
        let vendorGstin: string | undefined;
        if (po.vendor_id) {
            try {
                const addr = po.vendor_address_id
                    ? await this.vendorAddressRepository.findOne({
                          _id: po.vendor_address_id,
                      } as any)
                    : null;
                const fallbacks = !addr
                    ? await this.vendorAddressRepository.findAll({
                          vendor_id: po.vendor_id,
                          soft_delete: false,
                      } as any)
                    : [];
                const a: any =
                    addr ||
                    (fallbacks || []).find((x: any) => x.is_default) ||
                    (fallbacks || [])[0];
                if (a) {
                    vendorAddress = joinAddress({
                        address_line1: a.address_line1,
                        address_line2: a.address_line2,
                        city: a.city,
                        state: a.state,
                        postcode: a.postcode,
                        country: a.country,
                    });
                    vendorGstin = a.gstin || undefined;
                }
            } catch {
                // ignore
            }
        }

        const intraState =
            Number(po.cgst_total || 0) + Number(po.sgst_total || 0) > 0 &&
            Number(po.igst_total || 0) === 0;

        return {
            po,
            company: {
                name: company?.company_name || '',
                email: company?.email || '',
                phone: company?.mobile || '',
                iec: company?.iec || '',
                gstin: companyGstin,
                address: companyAddress,
                terms: company?.default_po_terms || '',
                signatory: company?.authorised_signatory_name || '',
            },
            vendor: {
                name: po.vendor_name || '',
                gstin: vendorGstin,
                address: vendorAddress,
                contact_name: po.vendor_contact_name,
                email: po.vendor_contact_email,
                phone: po.vendor_contact_phone,
            },
            intraState,
        };
    }
}

// ─── Types ──────────────────────────────────────────────────────────────

interface PoPdfContext {
    po: PurchaseOrderGetResponseDto;
    company: {
        name: string;
        email: string;
        phone: string;
        iec?: string;
        gstin?: string;
        address?: string;
        terms?: string;
        signatory?: string;
    };
    vendor: {
        name: string;
        gstin?: string;
        address?: string;
        contact_name?: string;
        email?: string;
        phone?: string;
    };
    intraState: boolean;
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

const money = (v: any): string => `₹${fmt(v)}`;

function joinAddress(a: {
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

// Indian numbering: lakh / crore, integer rupees only (paise rounded).
function rupeesInWords(amount: number): string {
    const n = Math.round(Number(amount) || 0);
    if (n === 0) return 'Rupees Zero Only';
    const a = [
        '',
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
        'Ten',
        'Eleven',
        'Twelve',
        'Thirteen',
        'Fourteen',
        'Fifteen',
        'Sixteen',
        'Seventeen',
        'Eighteen',
        'Nineteen',
    ];
    const b = [
        '',
        '',
        'Twenty',
        'Thirty',
        'Forty',
        'Fifty',
        'Sixty',
        'Seventy',
        'Eighty',
        'Ninety',
    ];
    const twoDigits = (num: number): string => {
        if (num < 20) return a[num];
        return `${b[Math.floor(num / 10)]}${num % 10 ? ' ' + a[num % 10] : ''}`;
    };
    const threeDigits = (num: number): string => {
        const h = Math.floor(num / 100);
        const r = num % 100;
        return `${h ? a[h] + ' Hundred' + (r ? ' ' : '') : ''}${
            r ? twoDigits(r) : ''
        }`;
    };
    let num = n;
    const parts: string[] = [];
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    const hundred = num;
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (hundred) parts.push(threeDigits(hundred));
    return `Rupees ${parts.join(' ').trim()} Only`;
}

function buildHeaderTemplate(ctx: PoPdfContext): string {
    return `
    <div style="font-size:9px;width:100%;padding:0 15mm;color:#444;
                border-bottom:1px solid #ccc;display:flex;
                justify-content:space-between;align-items:center;">
      <span>${esc(ctx.company.name)}</span>
      <span><strong>PURCHASE ORDER</strong> &middot; ${esc(ctx.po.voucher_no || '')}</span>
    </div>`;
}

function buildFooterTemplate(ctx: PoPdfContext): string {
    return `
    <div style="font-size:8px;width:100%;padding:0 15mm;color:#555;
                border-top:1px solid #ccc;display:flex;
                justify-content:space-between;align-items:center;">
      <span>${esc(ctx.po.voucher_no || '')}</span>
      <span class="pageNumber"></span>/<span class="totalPages"></span>
    </div>`;
}

function buildPoHtml(ctx: PoPdfContext): string {
    const { po, company, vendor, intraState } = ctx;
    const lines = po.lines || [];

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
          <td>${esc(l.hsn_code || '-')}</td>
          <td class="num">${esc(l.qty || '-')}</td>
          <td>${esc(l.unit || '-')}</td>
          <td class="num">${money(l.unit_price)}</td>
          <td class="num">${esc(l.tax_pct || '0')}%</td>
          <td class="num" style="font-weight:600">${money(l.line_total)}</td>
        </tr>`
              )
              .join('')
        : `<tr><td colspan="8" style="text-align:center;color:#999;padding:14px">No line items.</td></tr>`;

    const taxRows = intraState
        ? `
            <div class="row"><span>CGST</span><span>${money(po.cgst_total)}</span></div>
            <div class="row"><span>SGST</span><span>${money(po.sgst_total)}</span></div>`
        : `
            <div class="row"><span>IGST</span><span>${money(po.igst_total)}</span></div>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(po.voucher_no || 'PO')}</title>
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
  .title-row .doc-title { text-align: right; }
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
  .meta { text-align: right; font-size: 10px; color: #555; }
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
    grid-template-columns: repeat(2, 1fr);
    gap: 4px 12px;
    font-size: 10.5px;
  }
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
    width: 45%;
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
  .words {
    border: 1px dashed #999;
    padding: 6px 10px;
    margin-bottom: 12px;
    font-size: 10.5px;
    background: #fcfcfc;
  }
  .words .lbl {
    color: #777; font-size: 9.5px;
    text-transform: uppercase;
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
    width: 240px;
    border-top: 1px solid #333;
    padding-top: 4px;
    text-align: center;
    color: #555;
  }
  .signature .box .signatory {
    color: #222;
    font-weight: 600;
    margin-bottom: 2px;
  }
</style>
</head>
<body>

  <div class="title-row">
    <div>
      <h3>${esc(company.name || '')}</h3>
      ${company.address ? `<div style="font-size:10px;color:#555;white-space:pre-line">${esc(company.address)}</div>` : ''}
      <div style="font-size:10px;color:#555">
        ${company.phone ? esc(company.phone) + ' &middot; ' : ''}${esc(company.email || '')}
        ${company.gstin ? ' &middot; GSTIN: ' + esc(company.gstin) : ''}
        ${company.iec ? ' &middot; IEC: ' + esc(company.iec) : ''}
      </div>
    </div>
    <div class="doc-title">
      <h2>Purchase Order</h2>
      <div style="font-weight:600">${esc(po.voucher_no || '')}</div>
      <div class="meta">
        Date: ${esc((po.po_date || '').slice(0, 10) || '-')}<br/>
        ${po.expected_delivery_date ? `Expected: ${esc(po.expected_delivery_date.slice(0, 10))}<br/>` : ''}
        Currency: ${esc(po.currency_code || 'INR')}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Vendor (Bill From)</div>
      <div class="party-name">${esc(vendor.name || '-')}</div>
      ${vendor.contact_name ? `<div style="font-size:10px">${esc(vendor.contact_name)}</div>` : ''}
      ${vendor.address ? `<div class="party-addr">${esc(vendor.address)}</div>` : ''}
      ${vendor.email ? `<div style="font-size:10px">${esc(vendor.email)}</div>` : ''}
      ${vendor.phone ? `<div style="font-size:10px">${esc(vendor.phone)}</div>` : ''}
      ${vendor.gstin ? `<div style="font-size:10px"><strong>GSTIN:</strong> ${esc(vendor.gstin)}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Deliver To</div>
      <div class="party-addr" style="font-weight:500;color:#222">${esc(po.delivery_address || '-')}</div>
    </div>
  </div>

  <div class="block">
    <div class="block-title">Terms</div>
    <div class="grid">
      ${kv('Payment Terms', po.payment_terms)}
      ${kv('Delivery Terms', po.delivery_terms)}
      ${kv('Expected Delivery', (po.expected_delivery_date || '').slice(0, 10))}
      ${kv('PO Date', (po.po_date || '').slice(0, 10))}
    </div>
  </div>

  <table class="lines">
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th>HSN</th>
        <th class="num">Qty</th>
        <th>Unit</th>
        <th class="num">Rate</th>
        <th class="num">GST%</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${linesRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(po.subtotal)}</span></div>
    ${taxRows}
    <div class="row"><span>Round-off</span><span>${money(po.round_off)}</span></div>
    <div class="row grand"><span>Grand Total</span><span>${money(po.grand_total)}</span></div>
  </div>

  <div class="words">
    <div class="lbl">Amount in Words</div>
    ${esc(rupeesInWords(Number(po.grand_total || 0)))}
  </div>

  ${
      po.notes_to_vendor
          ? `<div class="notes"><div class="lbl">Notes</div>${esc(po.notes_to_vendor)}</div>`
          : ''
  }

  ${
      company.terms
          ? `<div class="declaration"><div class="lbl">Terms &amp; Conditions</div>${esc(company.terms)}</div>`
          : ''
  }

  <div class="signature">
    <div class="box">
      For <strong>${esc(company.name || '')}</strong>
      <div style="height:36px"></div>
      ${
          company.signatory
              ? `<div class="signatory">${esc(company.signatory)}</div>`
              : ''
      }
      <span style="color:#999">Authorised Signatory</span>
    </div>
  </div>

</body>
</html>`;
}

function kv(label: string, value: any): string {
    if (value == null || value === '') return '';
    return `<div><span class="k">${esc(label)}:</span> ${esc(value)}</div>`;
}
