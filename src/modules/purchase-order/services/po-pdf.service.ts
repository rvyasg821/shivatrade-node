import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { PurchaseOrderGetResponseDto } from '../dtos/response/purchase-order.get.response.dto';

/**
 * Renders the PO PDF using the same neutral / professional layout as the
 * PFI PDF (white doc, hairline borders, 3-column party grid, only Grand
 * Total in totals). PO is a vendor-facing document — line and total
 * amounts are shown in INR since the line_total is stored in INR.
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
export class PoPdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly customerAddressRepository: CustomerAddressRepository
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

        // PO is multi-vendor at line level. Build the unique vendor list,
        // hydrating addresses where possible.
        const seen = new Set<string>();
        const vendors: VendorBlock[] = [];
        for (const ln of po.lines || []) {
            const vid: string | undefined = (ln as any).vendor_id;
            if (!vid || seen.has(vid)) continue;
            seen.add(vid);
            let addressStr: string | undefined;
            let gstin: string | undefined;
            try {
                const list = await this.vendorAddressRepository.findAll({
                    vendor_id: vid,
                    soft_delete: false,
                } as any);
                const a: any =
                    (list || []).find((x: any) => x.is_default) ||
                    (list || [])[0];
                if (a) {
                    addressStr = joinAddress({
                        address_line1: a.address_line1,
                        address_line2: a.address_line2,
                        city: a.city,
                        state: a.state,
                        postcode: a.postcode,
                        country: a.country,
                    });
                    gstin = a.gstin || undefined;
                }
            } catch {
                // ignore — degrade gracefully
            }
            vendors.push({
                name: (ln as any).vendor_name || vid,
                address: addressStr,
                gstin,
            });
        }
        // Legacy fallback to the header vendor if no line-level vendors.
        if (vendors.length === 0 && po.vendor_id) {
            let addressStr: string | undefined;
            let gstin: string | undefined;
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
                    addressStr = joinAddress({
                        address_line1: a.address_line1,
                        address_line2: a.address_line2,
                        city: a.city,
                        state: a.state,
                        postcode: a.postcode,
                        country: a.country,
                    });
                    gstin = a.gstin || undefined;
                }
            } catch {
                // ignore
            }
            vendors.push({
                name: po.vendor_name || '-',
                address: addressStr,
                gstin,
            });
        }

        // Customer (Buyer on the PDF): address comes from
        // customer_address_id if present, otherwise the default/first
        // address on the customer record.
        let customerAddress: string | undefined;
        if (po.customer_id) {
            try {
                const addr = po.customer_address_id
                    ? await this.customerAddressRepository.findOne({
                          _id: po.customer_address_id,
                      } as any)
                    : null;
                const fallbacks = !addr
                    ? await this.customerAddressRepository.findAll({
                          customer_id: po.customer_id,
                          soft_delete: false,
                      } as any)
                    : [];
                const a: any =
                    addr ||
                    (fallbacks || []).find((x: any) => x.is_default) ||
                    (fallbacks || [])[0];
                if (a) {
                    customerAddress = joinAddress({
                        address_line1: a.address_line1,
                        address_line2: a.address_line2,
                        city: a.city,
                        state: a.state,
                        postcode: a.postcode,
                        country: a.country,
                    });
                }
            } catch {
                // ignore — graceful degrade to name-only block
            }
        }

        // Grand total in INR: sum of line totals (they are stored in INR);
        // grand_total on the entity is in customer currency, so derive an
        // INR figure for the vendor-facing PDF.
        const linesInrTotal = (po.lines || []).reduce(
            (s, l) => s + (Number((l as any).line_total) || 0),
            0
        );

        return {
            po,
            company: {
                name: company?.company_name || '',
                email: company?.email || '',
                phone: company?.mobile || '',
                iec: company?.iec || '',
                gstin: companyGstin,
                address: companyAddress,
                // Terms removed 2026-05-27 — STIPL client spec has no
                // Terms block on PO PDFs. The text was moved to Invoice.
                terms: '',
                signatory: company?.authorised_signatory_name || '',
            },
            vendors,
            customer: {
                name: po.customer_name || '',
                contact_name: po.customer_contact_name || '',
                email: po.customer_contact_email || '',
                phone: po.customer_contact_phone || '',
                address: customerAddress,
            },
            inrTotal: linesInrTotal,
        };
    }
}

// ─── Types ──────────────────────────────────────────────────────────────

interface VendorBlock {
    name: string;
    gstin?: string;
    address?: string;
}

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
    vendors: VendorBlock[];
    customer: {
        name: string;
        contact_name?: string;
        email?: string;
        phone?: string;
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

const money = (v: any): string => `₹${fmt(v)}`;

// Currency-aware money formatter — used for amounts that have already
// been converted into the PO's customer currency.
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

function kv(label: string, value: any, full = false): string {
    if (value == null || value === '') return '';
    return `<div${full ? ' class="kv-full"' : ''}><span class="k">${esc(label)}:</span> <span class="v">${esc(value)}</span></div>`;
}

function buildHeaderTemplate(ctx: PoPdfContext): string {
    return `
    <div style="font-size:8.5px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(ctx.company.name)}</span>
      <span><strong style="color:#1f2937">PURCHASE ORDER</strong> · ${esc(ctx.po.voucher_no || '')}</span>
    </div>`;
}

function buildFooterTemplate(ctx: PoPdfContext): string {
    return `
    <div style="font-size:8px;width:100%;padding:0 12mm;color:#6b7280;
                display:flex;justify-content:space-between;align-items:center;">
      <span>${esc(ctx.po.voucher_no || '')}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
}

function buildPoHtml(ctx: PoPdfContext): string {
    const { po, company, vendors, customer, inrTotal } = ctx;
    const lines = po.lines || [];
    // PO line totals are stored in INR; convert to the PO's customer
    // currency so the vendor sees USD/EUR/etc. like the PFI PDF.
    const sym = po.currency_symbol || po.currency_code || '₹';
    const rate = Number(po.exchange_rate) || 1;
    const grandTotalCcy = inrTotal * rate;

    const linesRows = lines.length
        ? lines
              .map((l, i) => {
                  const qty = Number(l.qty) || 0;
                  const lineTotalInr = Number(l.line_total) || 0;
                  const lineTotalCcy = lineTotalInr * rate;
                  // Effective per-unit price = full line_total / qty (bakes
                  // in expense/rebate/margin/GST), matching the PFI table.
                  const effRate =
                      qty > 0
                          ? lineTotalCcy / qty
                          : (Number(l.unit_price) || 0) * rate;
                  return `
        <tr>
          <td class="muted">${i + 1}</td>
          <td>
            <div class="fw">${esc(l.product_name || '-')}</div>
          </td>
          <td class="num">${l.qty ? fmt(l.qty) : '-'}</td>
          <td>${esc(l.unit || '-')}</td>
          <td class="num">${ccyMoney(sym, effRate)}</td>
          <td class="num fw">${ccyMoney(sym, lineTotalCcy)}</td>
        </tr>`;
              })
              .join('')
        : `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No line items.</td></tr>`;

    const vendorBlocks = vendors.length
        ? vendors
              .map(
                  (v) => `
        <div class="vendor-card">
          <div class="party-name">${esc(v.name)}</div>
          ${v.address ? `<div class="party-line" style="white-space:pre-line">${esc(v.address)}</div>` : ''}
          ${v.gstin ? `<div class="party-line muted">GSTIN: ${esc(v.gstin)}</div>` : ''}
        </div>`
              )
              .join('')
        : `<div class="party-line muted">-</div>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(po.voucher_no || 'PO')}</title>
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
  .vendor-card { margin-bottom: 8px; }
  .vendor-card:last-child { margin-bottom: 0; }
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
        ${company.iec ? ' · IEC: ' + esc(company.iec) : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="qd-title">Purchase Order</div>
      <div class="voucher">#${esc(po.voucher_no || '-')}</div>
      <div class="voucher">
        Date: <span class="fw">${dateOnly(po.po_date) || '-'}</span>
        · Currency: <span class="fw">${esc(sym)} ${esc(po.currency_code || '-')}</span>
      </div>
      ${po.status ? `<span class="status-badge">${esc(po.status)}</span>` : ''}
    </div>
  </div>

  <div class="party-grid">
    <div>
      <div class="label">Seller</div>
      <div class="party-name">${esc(company.name || '-')}</div>
      ${company.address ? `<div class="party-line" style="white-space:pre-line">${esc(company.address)}</div>` : ''}
      ${company.phone ? `<div class="party-line">${esc(company.phone)}</div>` : ''}
      ${company.email ? `<div class="party-line">${esc(company.email)}</div>` : ''}
      ${company.gstin ? `<div class="party-line muted">GSTIN: ${esc(company.gstin)}</div>` : ''}
    </div>
    <div>
      <div class="label">Buyer</div>
      <div class="party-name">${esc(customer.name || '-')}</div>
      ${customer.contact_name ? `<div class="party-line">${esc(customer.contact_name)}</div>` : ''}
      ${customer.address ? `<div class="party-line" style="white-space:pre-line">${esc(customer.address)}</div>` : ''}
      ${customer.phone ? `<div class="party-line">${esc(customer.phone)}</div>` : ''}
      ${customer.email ? `<div class="party-line">${esc(customer.email)}</div>` : ''}
    </div>
    <div>
      <div class="label">Ship To</div>
      <div class="party-line" style="white-space:pre-line">${esc(po.delivery_address || customer.address || '-')}</div>
      ${po.expected_delivery_date ? `<div class="party-line muted">Expected: ${dateOnly(po.expected_delivery_date)}</div>` : ''}
      ${po.payment_terms ? `<div class="party-line muted">Payment: ${esc(po.payment_terms)}</div>` : ''}
      ${po.delivery_terms ? `<div class="party-line muted">Delivery: ${esc(po.delivery_terms)}</div>` : ''}
    </div>
  </div>

  <div class="section" style="border-top:none;padding-top:0;margin-top:18px">
    <table class="items">
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th>Product</th>
          <th class="num" style="width:60px">Qty</th>
          <th style="width:50px">Unit</th>
          <th class="num" style="width:90px">Rate</th>
          <th class="num" style="width:110px">Amount</th>
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
      po.notes_to_vendor
          ? `<div class="section"><div class="label">Notes to Vendor</div><div class="body">${esc(po.notes_to_vendor)}</div></div>`
          : ''
  }
  ${
      company.terms
          ? `<div class="section"><div class="label">Terms &amp; Conditions</div><div class="body">${esc(company.terms)}</div></div>`
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
