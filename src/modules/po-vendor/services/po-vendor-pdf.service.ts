import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { PoVendorGetResponseDto } from '../dtos/response/po-vendor.get.response.dto';

/**
 * Renders the POV (PO Vendor / dispatch slip) PDF using the same
 * neutral / professional layout as the PO and PFI PDFs: white doc,
 * hairline borders, 3-column party grid, only Grand Total in totals.
 */
const LOGO_DATA_URI: string = (() => {
    try {
        const p = path.resolve(process.cwd(), 'public', 'shivatrade-logo.png');
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
        return '';
    }
})();

@Injectable()
export class PoVendorPdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorAddressRepository: VendorAddressRepository
    ) {}

    async render(
        pov: PoVendorGetResponseDto,
        companyId: string
    ): Promise<Buffer> {
        const ctx = await this.buildContext(pov, companyId);
        const html = buildPovHtml(ctx);
        return this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '18mm',
                right: '12mm',
                bottom: '18mm',
                left: '12mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildHeaderTemplate(ctx),
            footerTemplate: buildFooterTemplate(ctx),
        });
    }

    buildFilename(pov: PoVendorGetResponseDto): string {
        const safe = (pov.voucher_no || 'POV')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }

    private async buildContext(
        pov: PoVendorGetResponseDto,
        companyId: string
    ): Promise<PovPdfContext> {
        let company: any = null;
        try {
            company = await this.companyService.findOneById(companyId);
        } catch {
            /* graceful */
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
            /* graceful */
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

        // Vendor address (preferred → vendor_address_id; fallback → default).
        let vendorAddress: string | undefined;
        let vendorGstin: string | undefined;
        if (pov.vendor_id) {
            try {
                const addr = pov.vendor_address_id
                    ? await this.vendorAddressRepository.findOne({
                          _id: pov.vendor_address_id,
                      } as any)
                    : null;
                const fallbacks = !addr
                    ? await this.vendorAddressRepository.findAll({
                          vendor_id: pov.vendor_id,
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
                /* graceful */
            }
        }

        const linesInrTotal = (pov.lines || []).reduce(
            (s, l) => s + (Number((l as any).line_total) || 0),
            0
        );

        return {
            pov,
            company: {
                name: company?.company_name || '',
                email: company?.email || '',
                phone: company?.mobile || '',
                gstin: companyGstin,
                address: companyAddress,
                signatory: company?.authorised_signatory_name || '',
            },
            vendor: {
                name: pov.vendor_name || '',
                contact_name: pov.vendor_contact_name || '',
                email: pov.vendor_contact_email || '',
                phone: pov.vendor_contact_phone || '',
                gstin: vendorGstin,
                address: vendorAddress,
            },
            inrTotal: linesInrTotal,
        };
    }
}

// ─── types ──────────────────────────────────────────────────────────────

interface PovPdfContext {
    pov: PoVendorGetResponseDto;
    company: {
        name: string;
        email: string;
        phone: string;
        gstin?: string;
        address?: string;
        signatory?: string;
    };
    vendor: {
        name: string;
        contact_name?: string;
        email?: string;
        phone?: string;
        gstin?: string;
        address?: string;
    };
    inrTotal: number;
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

const ccyMoney = (sym: string, v: any): string => `${sym}${fmt(v)}`;

const dateOnly = (v?: string | null): string =>
    v ? esc(String(v).slice(0, 10)) : '';

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

function buildHeaderTemplate(ctx: PovPdfContext): string {
    return `
    <div style="font-size:8.5px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(ctx.company.name)}</span>
      <span><strong style="color:#1f2937">DISPATCH ADVICE</strong> · ${esc(ctx.pov.voucher_no || '')}</span>
    </div>`;
}

function buildFooterTemplate(ctx: PovPdfContext): string {
    return `
    <div style="font-size:8px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(ctx.pov.voucher_no || '')}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
}

function buildPovHtml(ctx: PovPdfContext): string {
    const { pov, company, vendor, inrTotal } = ctx;
    const lines = pov.lines || [];
    const sym = pov.currency_symbol || pov.currency_code || '₹';
    const rate = Number(pov.exchange_rate) || 1;
    const grandTotalCcy = inrTotal * rate;

    const linesRows = lines.length
        ? lines
              .map((l, i) => {
                  const qty = Number(l.ordered_qty) || 0;
                  const lineTotalCcy = (Number(l.line_total) || 0) * rate;
                  const effRate =
                      qty > 0
                          ? lineTotalCcy / qty
                          : (Number(l.unit_price) || 0) * rate;
                  return `
        <tr>
          <td class="muted">${i + 1}</td>
          <td><div class="fw">${esc(l.product_name || '-')}</div></td>
          <td class="num">${l.ordered_qty ? fmt(l.ordered_qty) : '-'}</td>
          <td class="num">${l.dispatched_qty ? fmt(l.dispatched_qty) : '-'}</td>
          <td class="num">${l.received_qty ? fmt(l.received_qty) : '-'}</td>
          <td>${esc(l.unit || '-')}</td>
          <td class="num">${ccyMoney(sym, effRate)}</td>
          <td class="num fw">${ccyMoney(sym, lineTotalCcy)}</td>
        </tr>`;
              })
              .join('')
        : `<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">No line items.</td></tr>`;

    const transportRows: Array<[string, any]> = [
        ['Transporter', pov.transporter_name],
        ['Vehicle No.', pov.vehicle_no],
        ['LR No.', pov.lr_no],
        ['LR Date', dateOnly(pov.lr_date)],
        ['E-way Bill', pov.eway_bill_no],
        ['E-way Date', dateOnly(pov.eway_bill_date)],
    ].filter((r) => !!r[1]) as Array<[string, any]>;

    const transportBlock = transportRows.length
        ? `
      <div class="section">
        <div class="label">Transport</div>
        <div class="kv-grid">${transportRows
            .map(
                ([k, v]) =>
                    `<div><span class="k">${esc(k)}:</span> <span class="v">${esc(v)}</span></div>`
            )
            .join('')}</div>
      </div>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(pov.voucher_no || 'POV')}</title>
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
  .muted { color: #6b7280; }
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
  .totals {
    width: 280px;
    margin-left: auto;
    margin-top: 14px;
    margin-bottom: 4px;
  }
  .totals .row-grand {
    display: flex;
    justify-content: space-between;
    padding: 10px 0 4px;
    border-top: 2px solid #1f2937;
    font-weight: 700;
    font-size: 12px;
    color: #1f2937;
  }
  .section {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
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
</style>
</head>
<body>
<div class="doc">

  <div class="qd-header">
    <div>
      ${LOGO_DATA_URI ? `<img src="${LOGO_DATA_URI}" alt="ShivaTrade" style="height:34px;margin-bottom:8px;display:block" />` : ''}
      <div class="company-name">${esc(company.name || '-')}</div>
      ${company.address ? `<div class="party-line muted" style="white-space:pre-line">${esc(company.address)}</div>` : ''}
      <div class="party-line muted">
        ${company.phone ? esc(company.phone) + ' · ' : ''}${esc(company.email || '')}
        ${company.gstin ? ' · GSTIN: ' + esc(company.gstin) : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="qd-title">Dispatch Advice</div>
      <div class="voucher">#${esc(pov.voucher_no || '-')}</div>
      ${pov.status ? `<span class="status-badge">${esc(pov.status)}</span>` : ''}
    </div>
  </div>

  <div class="party-grid">
    <div>
      <div class="label">Buyer</div>
      <div class="party-name">${esc(company.name || '-')}</div>
      ${company.address ? `<div class="party-line" style="white-space:pre-line">${esc(company.address)}</div>` : ''}
      ${company.phone ? `<div class="party-line">${esc(company.phone)}</div>` : ''}
      ${company.email ? `<div class="party-line">${esc(company.email)}</div>` : ''}
      ${company.gstin ? `<div class="party-line muted">GSTIN: ${esc(company.gstin)}</div>` : ''}
    </div>
    <div>
      <div class="label">Vendor</div>
      <div class="party-name">${esc(vendor.name || '-')}</div>
      ${vendor.contact_name ? `<div class="party-line">${esc(vendor.contact_name)}</div>` : ''}
      ${vendor.address ? `<div class="party-line" style="white-space:pre-line">${esc(vendor.address)}</div>` : ''}
      ${vendor.phone ? `<div class="party-line">${esc(vendor.phone)}</div>` : ''}
      ${vendor.email ? `<div class="party-line">${esc(vendor.email)}</div>` : ''}
      ${vendor.gstin ? `<div class="party-line muted">GSTIN: ${esc(vendor.gstin)}</div>` : ''}
    </div>
    <div>
      <div class="label">Dispatch</div>
      ${pov.purchase_order_voucher_no ? `<div class="party-line"><span class="muted">PO #: </span><span class="fw">${esc(pov.purchase_order_voucher_no)}</span></div>` : ''}
      ${pov.dispatch_date ? `<div class="party-line"><span class="muted">Dispatch: </span><span class="fw">${dateOnly(pov.dispatch_date)}</span></div>` : ''}
      ${pov.expected_arrival_date ? `<div class="party-line"><span class="muted">Expected: </span><span class="fw">${dateOnly(pov.expected_arrival_date)}</span></div>` : ''}
      ${pov.actual_arrival_date ? `<div class="party-line"><span class="muted">Arrived: </span><span class="fw">${dateOnly(pov.actual_arrival_date)}</span></div>` : ''}
      <div class="party-line"><span class="muted">Currency: </span><span class="fw">${esc(sym)} ${esc(pov.currency_code || '-')}</span></div>
    </div>
  </div>

  ${
      pov.delivery_address
          ? `<div class="section"><div class="label">Deliver To</div><div class="body">${esc(pov.delivery_address)}</div></div>`
          : ''
  }

  ${transportBlock}

  <div class="section" style="border-top:none;padding-top:0;margin-top:18px">
    <table class="items">
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th>Product</th>
          <th class="num" style="width:60px">Ordered</th>
          <th class="num" style="width:70px">Dispatched</th>
          <th class="num" style="width:65px">Received</th>
          <th style="width:50px">Unit</th>
          <th class="num" style="width:80px">Rate</th>
          <th class="num" style="width:100px">Amount</th>
        </tr>
      </thead>
      <tbody>${linesRows}</tbody>
    </table>
  </div>

  <div class="totals">
    <div class="row-grand">
      <span>Grand Total</span>
      <span>${ccyMoney(sym, grandTotalCcy)}</span>
    </div>
  </div>

  ${
      pov.notes
          ? `<div class="section"><div class="label">Notes</div><div class="body">${esc(pov.notes)}</div></div>`
          : ''
  }

  <div class="signature">
    <div class="box">
      For ${esc(company.name || '')}
      <div style="height:30px"></div>
      ${company.signatory ? `<div class="fw" style="color:#1f2937;margin-bottom:2px">${esc(company.signatory)}</div>` : ''}
      <span style="color:#9ca3af">Authorised Signatory</span>
    </div>
  </div>

</div>
</body>
</html>`;
}
