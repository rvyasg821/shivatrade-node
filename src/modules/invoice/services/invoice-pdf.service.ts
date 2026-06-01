import * as fs from 'fs';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_SHIPPING_MODE,
    SEA_MODES,
} from '../enums/invoice.enum';

// Embed logo as data URI - puppeteer's file:// loads are flaky.
const LOGO_DATA_URI: string = (() => {
    try {
        const p = path.resolve(process.cwd(), 'public', 'shivatrade-logo.png');
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
        return '';
    }
})();

const esc = (v: any): string =>
    v == null
        ? ''
        : String(v)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');

const num = (v: any) => Number(v || 0);
const fmt = (v: any, dp = 2) =>
    num(v).toLocaleString('en-IN', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
    });

const lines2br = (s: string | undefined): string =>
    esc(s || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('<br/>');

export type InvoicePdfDocType = 'commercial' | 'packing-list' | 'export';

/**
 * Renders the export Commercial Invoice + Packing List PDFs from the same
 * Invoice + Company + Customer data. Layout follows the STIPL119 template.
 */
@Injectable()
export class InvoicePdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoiceLineRepository: InvoiceLineRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository
    ) {}

    async render(
        companyId: string,
        invoiceId: string,
        doc: InvoicePdfDocType
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.loadRenderData(companyId, invoiceId);

        const html =
            doc === 'packing-list'
                ? buildPackingListHtml(data)
                : doc === 'export'
                ? buildExportInvoiceHtml(data)
                : buildCommercialInvoiceHtml(data);

        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '12mm',
                right: '10mm',
                bottom: '12mm',
                left: '10mm',
            },
            displayHeaderFooter: false,
        });

        const safe = (data.invoice.voucher_no || 'INVOICE')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        const suffix =
            doc === 'packing-list'
                ? '-PackingList'
                : doc === 'export'
                ? '-Export'
                : '';
        return { buffer, filename: `${safe}${suffix}.pdf` };
    }

    /** Hydrates everything the templates need into a flat shape. */
    private async loadRenderData(companyId: string, invoiceId: string) {
        const invoice: any = await this.invoiceRepository.findOne({
            _id: invoiceId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!invoice) throw new NotFoundException('Invoice not found');

        const lines = await this.invoiceLineRepository.findByInvoiceId(
            invoiceId
        );

        const company: any =
            (await this.companyRepository.findOneById(companyId)) || {};
        // Prefer the frozen snapshot on the invoice — historical doc must
        // print the address as it was at issue time. Fall back to current
        // master only when no snapshot exists (legacy / draft / unset).
        let companyAddr: any = invoice.company_address_snapshot || null;
        if (!companyAddr) {
            const companyAddresses =
                await this.companyAddressRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                } as any);
            companyAddr =
                (companyAddresses as any[]).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (companyAddresses as any[]).find(
                    (a: any) => a.type === 'corporate'
                ) ||
                (companyAddresses as any[]).find((a: any) => a.is_default) ||
                (companyAddresses as any[])[0] ||
                {};
        }

        const customer: any =
            invoice.consignee_id
                ? await this.customerRepository.findOneById(
                      invoice.consignee_id.toString()
                  )
                : null;
        const consigneeAddresses = customer
            ? await this.customerAddressRepository.findAll({
                  customer_id: customer._id.toString(),
                  soft_delete: false,
              } as any)
            : [];
        const consigneeAddr: any =
            invoice.consignee_address_id
                ? (consigneeAddresses as any[]).find(
                      (a: any) =>
                          a._id?.toString() ===
                          invoice.consignee_address_id?.toString()
                  )
                : (consigneeAddresses as any[]).find((a: any) => a.is_default) ||
                  (consigneeAddresses as any[])[0];

        return {
            invoice,
            lines: lines as any[],
            company,
            companyAddr,
            customer,
            consigneeAddr,
            // Snapshot is the primary source of truth for the Consignee /
            // Notify Party blocks. Falls back to FK lookup (customer +
            // consigneeAddr) when missing (legacy invoices, drafts saved
            // before the snapshot pattern landed).
            consigneeSnapshot: invoice.consignee_snapshot,
            notifySnapshot: invoice.notify_party_snapshot,
        };
    }
}

// ─── HTML templates ─────────────────────────────────────────────────────

interface RenderData {
    invoice: any;
    lines: any[];
    company: any;
    companyAddr: any;
    customer: any;
    consigneeAddr: any;
    consigneeSnapshot: any;
    notifySnapshot: any;
}

/** AWB/BL transport-doc label, derived from invoice.mode (sea→BL, air-courier
 *  →Courier, air→AWB). Replaces the dropped `bl_awb_type` field. */
function awbLabel(mode?: ENUM_SHIPPING_MODE): string {
    if (mode && SEA_MODES.includes(mode)) return 'BL';
    if (mode === ENUM_SHIPPING_MODE.AIR_COURIER) return 'Courier';
    return 'AWB';
}

const baseStyles = `
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9.5px; color: #222; margin: 0; }
    .doc { width: 100%; }
    .title {
        text-align: center; font-weight: 700; font-size: 13px;
        padding: 6px 0; border: 1px solid #222;
    }
    .subtitle {
        text-align: center; font-size: 10px; font-weight: 600;
        padding: 3px 0; border-bottom: 1px solid #222;
        border-left: 1px solid #222; border-right: 1px solid #222;
    }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #222; padding: 4px 6px; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 700; text-align: center; }
    .nob td, .nob th { border: none; padding: 1px 0; }
    .lbl { font-weight: 700; }
    .small { font-size: 8.5px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .strong { font-weight: 700; }
    .muted { color: #555; }
    .row { display: flex; }
    .col { flex: 1 1 0; }
    .pad { padding: 4px 6px; }
    .h6 { font-weight: 700; font-size: 10.5px; }
    .sigbox { height: 60px; }
`;

/** Render the BANK DETAILS table from `bank_snapshots[]`. Only fields with
 *  a value are emitted — empty optional fields (SWIFT / AD Code / Branch)
 *  are dropped, then remaining pairs are reflowed into a 3-column grid so
 *  there are no gaps at the right edge. */
function bankDetailsBlock(banks: any[] | undefined): string {
    if (!Array.isArray(banks) || !banks.length) return '';
    const renderBank = (b: any): string => {
        const pairs: Array<[string, any]> = [
            ['Bank Name', b.name],
            ['Account No.', b.account_no],
            ['Beneficiary', b.beneficiary],
            ['Branch', b.branch],
            ['SWIFT', b.swift_code],
            ['AD Code', b.ad_code],
        ].filter(([, v]) => !!v) as Array<[string, any]>;
        if (!pairs.length) return '';
        // Pack 3 pairs per row; pad the last row with an empty 2-cell block
        // so widths stay aligned without leaving a visible gap.
        const PAIRS_PER_ROW = 3;
        let html = '';
        for (let i = 0; i < pairs.length; i += PAIRS_PER_ROW) {
            const slice = pairs.slice(i, i + PAIRS_PER_ROW);
            const cells = slice
                .map(
                    ([label, value]) =>
                        `<td class="lbl" style="width:14%;">${label}</td><td style="width:19%;">${esc(value)}</td>`
                )
                .join('');
            const padPairs = PAIRS_PER_ROW - slice.length;
            const padding =
                padPairs > 0
                    ? `<td colspan="${padPairs * 2}"></td>`
                    : '';
            html += `<tr>${cells}${padding}</tr>`;
        }
        return html;
    };
    return `<table style="margin-top: 6px;">
        <tr><th colspan="6">BANK DETAILS</th></tr>
        ${banks.map(renderBank).join('')}
    </table>`;
}

/** Pre-Carriage / Place of Receipt / Port of Loading / Port of Discharge /
 *  Place of Delivery — read from the invoice's own shipment block (§10).
 *  Returns empty string when no route/port field has been recorded yet. */
function shippingRouteBlock(d: RenderData): string {
    const inv = d.invoice || {};
    const pol = inv.port_of_loading_snapshot || {};
    const pod = inv.port_of_discharge_snapshot || {};
    const polLabel = pol.name || pol.port_name || pol.code || '';
    const podLabel = pod.name || pod.port_name || pod.code || '';
    const hasAny =
        inv.pre_carriage_by ||
        inv.place_of_receipt ||
        inv.place_of_delivery ||
        polLabel ||
        podLabel;
    if (!hasAny) return '';
    return `
    <table style="margin-top: 0;">
        <tr>
            <td style="width:20%;"><span class="lbl">Pre-Carriage By</span><br/>${esc(inv.pre_carriage_by)}</td>
            <td style="width:20%;"><span class="lbl">Place of Receipt</span><br/>${esc(inv.place_of_receipt)}</td>
            <td style="width:20%;"><span class="lbl">Port of Loading</span><br/>${esc(polLabel)}</td>
            <td style="width:20%;"><span class="lbl">Port of Discharge</span><br/>${esc(podLabel)}</td>
            <td><span class="lbl">Place of Delivery</span><br/>${esc(inv.place_of_delivery)}</td>
        </tr>
    </table>`;
}

function partiesBlock(d: RenderData, includeNotify = true): string {
    const c = d.company || {};
    const ca = d.companyAddr || {};
    const cust = d.customer || {};
    const cad = d.consigneeAddr || {};
    const cSnap = d.consigneeSnapshot || null;
    const notify = d.notifySnapshot || {};

    const shipperLines = [
        ca.address_line1,
        ca.address_line2,
        [ca.city, ca.state].filter(Boolean).join(', '),
        [ca.country, ca.postcode].filter(Boolean).join(' - '),
    ]
        .filter(Boolean)
        .join('<br/>');

    // Prefer the snapshot (operator-typed or pre-filled from customer);
    // fall back to FK lookup for legacy invoices where snapshot is null.
    const consigneeLines = cSnap
        ? [
              cSnap.name,
              cSnap.address_line1,
              cSnap.address_line2,
              [cSnap.city, cSnap.state].filter(Boolean).join(', '),
              [cSnap.country, cSnap.postcode].filter(Boolean).join(' - '),
          ]
              .filter(Boolean)
              .join('<br/>')
        : [
              cust.company_name,
              cad?.address_line1,
              cad?.address_line2,
              [cad?.city, cad?.state].filter(Boolean).join(', '),
              cad?.country,
          ]
              .filter(Boolean)
              .join('<br/>');

    const notifyLines =
        notify && (notify.name || notify.address_line1 || notify.address)
            ? [
                  notify.name,
                  notify.address_line1 || notify.address,
                  notify.address_line2,
                  [notify.city, notify.state].filter(Boolean).join(', '),
                  [notify.country, notify.postcode].filter(Boolean).join(' - '),
              ]
                  .filter(Boolean)
                  .join('<br/>')
            : '';

    return `
    <table>
        <tr>
            <td style="width: 50%;">
                <div class="lbl">SHIPPER:</div>
                <div class="strong">${esc(c.company_name)}</div>
                <div>${shipperLines}</div>
                <table class="nob small" style="margin-top: 4px;">
                    <tr><td class="lbl" style="width:90px;">GST No</td><td>${esc(ca.gstin || c.tax_number)}</td></tr>
                    <tr><td class="lbl">PAN No.</td><td>${esc(c.pan)}</td></tr>
                    <tr><td class="lbl">IEC No.</td><td>${esc(c.iec)}</td></tr>
                    <tr><td class="lbl">LUT No. and date</td><td>${esc(d.invoice.lut_no)}${d.invoice.lut_date ? ' / ' + esc(String(d.invoice.lut_date).slice(0, 10)) : ''}</td></tr>
                </table>
            </td>
            <td style="width: 50%;">
                <div class="lbl">CONSIGNEE:</div>
                <div>${consigneeLines}</div>
                ${
                    includeNotify && notifyLines
                        ? `<div class="lbl" style="margin-top: 6px;">Buyer(s) / Notify Party</div>
                           <div>${notifyLines}</div>`
                        : ''
                }
            </td>
        </tr>
        <tr>
            <td><span class="lbl">Country of Origin</span><br/>${esc(d.invoice.country_of_origin || 'India')}</td>
            <td><span class="lbl">Terms of Delivery and Payment</span><br/>${esc(d.invoice.delivery_terms || d.invoice.incoterm || '')}${d.invoice.payment_terms ? '<br/>Payment: ' + esc(d.invoice.payment_terms) : ''}</td>
        </tr>
        <tr>
            <td><span class="lbl">Country of Destination</span><br/>${esc(d.invoice.country_of_destination)}</td>
            <td>
                <span class="lbl">Export Route</span><br/>${d.invoice.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED ? 'Export Under LUT (Without Payment of IGST)' : 'Export With Payment of IGST'}
                ${
                    d.invoice.shipping_bill_type
                        ? `<br/>Export Under ${esc(SHIPPING_BILL_TYPE_LABELS[d.invoice.shipping_bill_type] || d.invoice.shipping_bill_type)}`
                        : ''
                }
            </td>
        </tr>
    </table>`;
}

// Indian export-scheme labels shown next to "Export Route" on the
// Commercial Invoice. Driven by invoice.shipping_bill_type (independent of
// gst_route) — renders on both IGST-paid and LUT invoices.
const SHIPPING_BILL_TYPE_LABELS: Record<string, string> = {
    free: 'Free Scheme',
    dbk: 'Drawback',
    rodtep: 'RoDTEP',
    rosctl: 'RoSCTL',
    seis: 'SEIS',
};

function buildCommercialInvoiceHtml(d: RenderData): string {
    const inv = d.invoice;
    const isLut = inv.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED;
    const subtitle = isLut
        ? 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST'
        : 'SUPPLY MEANT FOR EXPORT WITH PAYMENT OF IGST';
    const sym = esc(inv.currency_symbol || inv.currency_code || '');

    // Per-line IGST is shown in INR (matches the refund bucket basis).
    // For LUT route IGST is 0% — we drop the two columns entirely.
    const showIgst = !isLut;
    const er = Number(inv.exchange_rate || 0);
    let totalIgstInr = 0;
    const lineIgstInr = (l: any): number => {
        const rate = Number(l.igst_rate_pct || 0);
        if (!showIgst || rate <= 0 || er <= 0) return 0;
        const taxableInr = Number(l.taxable_amount || 0) / er;
        return taxableInr * (rate / 100);
    };
    const linesHtml = (d.lines || [])
        .map((l: any, i: number) => {
            const igstAmt = lineIgstInr(l);
            totalIgstInr += igstAmt;
            return `
            <tr>
                <td class="center">${i + 1}</td>
                <td class="center">${esc(l.hsn_code)}</td>
                <td>${esc(l.product_name)}${l.product_code ? ' (' + esc(l.product_code) + ')' : ''}${l.description ? '<br/><span class="small muted">' + esc(l.description) + '</span>' : ''}</td>
                <td class="right">${fmt(l.qty, 4)} ${esc(l.uqc_code || l.unit)}</td>
                <td class="right">${sym}${fmt(l.unit_price, 2)}</td>
                <td class="right strong">${sym}${fmt(l.line_total, 2)}</td>
                ${showIgst ? `<td class="right">${fmt(l.igst_rate_pct || 0, 2)}%</td>` : ''}
                ${showIgst ? `<td class="right">₹${fmt(igstAmt, 2)}</td>` : ''}
            </tr>`;
        })
        .join('');

    const bucketsHtml =
        Array.isArray(inv.igst_refund_buckets) && inv.igst_refund_buckets.length
            ? `<table style="margin-top: 6px;">
                <tr>
                    <th class="right">Assessable Value (INR)</th>
                    <th class="right">IGST Rate</th>
                    <th class="right">IGST Amount (INR)</th>
                </tr>
                ${inv.igst_refund_buckets
                    .map(
                        (b: any) => `
                    <tr>
                        <td class="right">₹${fmt(b.assessable_value_inr, 2)}</td>
                        <td class="right">${fmt(b.rate, 2)}%</td>
                        <td class="right strong">₹${fmt(b.igst_amount_inr, 2)}</td>
                    </tr>`
                    )
                    .join('')}
                <tr>
                    <td colspan="2" class="right strong">Total IGST Refund</td>
                    <td class="right strong">₹${fmt(inv.igst_refund_amount, 2)}</td>
                </tr>
            </table>`
            : '';

    const banksHtml = bankDetailsBlock(inv.bank_snapshots);

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>${baseStyles}</style></head>
<body><div class="doc">
    <div class="title">COMMERCIAL INVOICE</div>
    <div class="subtitle">${subtitle}</div>

    <table>
        <tr>
            <td style="width:60%;"><span class="lbl">Invoice No.:</span> ${esc(inv.voucher_no || '(DRAFT)')}</td>
            <td><span class="lbl">Date:</span> ${esc(String(inv.invoice_date || '').slice(0, 10))}</td>
        </tr>
    </table>

    ${partiesBlock(d, true)}

    ${shippingRouteBlock(d)}

    <table style="margin-top: 0;">
        <tr>
            <td style="width:33%;"><span class="lbl">Incoterm</span><br/>${esc(inv.incoterm)}</td>
            <td style="width:33%;"><span class="lbl">Buyer's PO #</span><br/>${esc(inv.customer_po_no)}</td>
            <td><span class="lbl">Exchange Rate</span><br/>1 ${esc(inv.currency_code)} = ₹${fmt(inv.exchange_rate, 4)}</td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <th style="width:36px;">SR NO</th>
            <th style="width:80px;">HSN CODE</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:100px;">QTY</th>
            <th style="width:110px;">PRICE / UNIT</th>
            <th style="width:130px;">AMOUNT</th>
            ${showIgst ? '<th style="width:60px;">IGST</th>' : ''}
            ${showIgst ? '<th style="width:110px;">IGST Amt.</th>' : ''}
        </tr>
        ${linesHtml}
        <tr>
            <td colspan="${showIgst ? 7 : 5}" class="right lbl">Subtotal</td>
            <td class="right strong">${sym}${fmt(inv.subtotal, 2)}</td>
        </tr>
        ${num(inv.discount_total) > 0 ? `<tr><td colspan="${showIgst ? 7 : 5}" class="right lbl">Discount</td><td class="right">− ${sym}${fmt(inv.discount_total, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="${showIgst ? 7 : 5}" class="right lbl">FOB Value</td>
            <td class="right strong">${sym}${fmt(inv.fob_value, 2)}</td>
        </tr>
        ${num(inv.freight_charges) > 0 ? `<tr><td colspan="${showIgst ? 7 : 5}" class="right lbl">Freight</td><td class="right">${sym}${fmt(inv.freight_charges, 2)}</td></tr>` : ''}
        ${num(inv.insurance_charges) > 0 ? `<tr><td colspan="${showIgst ? 7 : 5}" class="right lbl">Insurance</td><td class="right">${sym}${fmt(inv.insurance_charges, 2)}</td></tr>` : ''}
        ${num(inv.other_charges) > 0 ? `<tr><td colspan="${showIgst ? 7 : 5}" class="right lbl">Other</td><td class="right">${sym}${fmt(inv.other_charges, 2)}</td></tr>` : ''}
        ${showIgst ? `<tr><td colspan="7" class="right lbl">Total IGST Amt. (INR)</td><td class="right strong">₹${fmt(totalIgstInr, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="${showIgst ? 7 : 5}" class="right strong" style="background:#f0f0f0;">TOTAL ${esc(inv.incoterm) || 'CNF'} Amount</td>
            <td class="right strong" style="background:#f0f0f0;">${sym}${fmt(inv.grand_total, 2)}</td>
        </tr>
    </table>

    ${inv.amount_in_words ? `<div class="pad" style="border:1px solid #222; border-top:none;"><span class="lbl">Amount in Words:</span> ${esc(inv.amount_in_words)}</div>` : ''}

    ${bucketsHtml}

    <table style="margin-top: 6px;">
        <tr>
            <td style="width:25%;"><span class="lbl">End Use Code</span><br/>${esc(inv.end_use_code)}</td>
            <td style="width:25%;"><span class="lbl">Preferential Agreement</span><br/>${esc(inv.preferential_agreement || 'N/A')}</td>
            <td style="width:25%;"><span class="lbl">Place of Supply</span><br/>${esc(inv.place_of_supply || '96')} - Other Territory</td>
            <td><span class="lbl">Advance Received</span><br/>${sym}${fmt(inv.advance_received, 2)}</td>
        </tr>
    </table>

    ${banksHtml}

    ${
        d.invoice?.terms
            ? `<div class="pad" style="border:1px solid #222; border-top:none; margin-top: 6px;">
                 <div class="lbl">Terms &amp; Conditions:</div>
                 <div class="small" style="white-space: pre-line">${esc(d.invoice.terms)}</div>
               </div>`
            : ''
    }

    <div class="pad" style="border:1px solid #222; border-top:none; margin-top: 6px;">
        <div class="lbl">Declaration:</div>
        <div class="small">${esc(inv.declaration_text || 'We declare that invoice shows the actual price of the goods described and that all particulars are true and correct.')}</div>
    </div>

    <table style="margin-top: 6px;">
        <tr>
            <td class="sigbox">
                <div class="small muted">For, ${esc(d.company.company_name)}</div>
            </td>
            <td class="sigbox right">
                <div class="small muted">Authorized Signatory</div>
            </td>
        </tr>
    </table>
</div></body></html>`;
}

/**
 * EXPORT INVOICE — the buyer-facing variant of the same Invoice record.
 * Differences vs Commercial Invoice (client's STIPL119 EXPORT INVOICE template):
 *   - Title: "EXPORT INVOICE"
 *   - Per-line table gains a "Requirement #" column (customer_reference)
 *   - Header strip surfaces buyer's PO # + AWB # (from invoice.bl_awb_no)
 *   - Footer adds Advance Received + Balance Receivable rows
 *   - IGST refund buckets are intentionally OMITTED (buyer doesn't see
 *     Indian tax refund machinery)
 */
function buildExportInvoiceHtml(d: RenderData): string {
    const inv = d.invoice;
    const isLut = inv.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED;
    const subtitle = isLut
        ? 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST'
        : 'SUPPLY MEANT FOR EXPORT WITH PAYMENT OF IGST';
    const sym = esc(inv.currency_symbol || inv.currency_code || '');

    const linesHtml = (d.lines || [])
        .map(
            (l, i) => `
            <tr>
                <td class="center">${i + 1}</td>
                <td class="center">${esc(l.hsn_code)}</td>
                <td>${esc(l.product_name)}${l.product_code ? ' (' + esc(l.product_code) + ')' : ''}${l.description ? '<br/><span class="small muted">' + esc(l.description) + '</span>' : ''}</td>
                <td>${esc(l.customer_reference)}</td>
                <td class="right">${fmt(l.qty, 4)} ${esc(l.uqc_code || l.unit)}</td>
                <td class="right">${sym}${fmt(l.unit_price, 2)}</td>
                <td class="right strong">${sym}${fmt(l.line_total, 2)}</td>
            </tr>`
        )
        .join('');

    const banksHtml = bankDetailsBlock(inv.bank_snapshots);

    // AWB / BL # is recorded on the invoice (§10); label derives from mode.
    const awbNo = inv.bl_awb_no || '';
    const awbType = awbLabel(inv.mode);

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>${baseStyles}</style></head>
<body><div class="doc">
    <div class="title">EXPORT INVOICE</div>
    <div class="subtitle">${subtitle}</div>

    <table>
        <tr>
            <td style="width:60%;"><span class="lbl">Invoice No.:</span> ${esc(inv.voucher_no || '(DRAFT)')}</td>
            <td><span class="lbl">Date:</span> ${esc(String(inv.invoice_date || '').slice(0, 10))}</td>
        </tr>
    </table>

    ${partiesBlock(d, true)}

    ${shippingRouteBlock(d)}

    <table style="margin-top: 0;">
        <tr>
            <td style="width:33%;"><span class="lbl">Incoterm</span><br/>${esc(inv.incoterm)}</td>
            <td style="width:33%;"><span class="lbl">PO # Raised by Customer</span><br/>${esc(inv.customer_po_no)}</td>
            <td><span class="lbl">${esc(awbType)} No.</span><br/>${esc(awbNo)}</td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <th style="width:36px;">SR NO</th>
            <th style="width:80px;">HSN CODE</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:120px;">REQUIREMENT # (PFI)</th>
            <th style="width:100px;">QTY</th>
            <th style="width:110px;">PRICE / UNIT</th>
            <th style="width:130px;">AMOUNT</th>
        </tr>
        ${linesHtml}
        <tr>
            <td colspan="6" class="right lbl">Subtotal</td>
            <td class="right strong">${sym}${fmt(inv.subtotal, 2)}</td>
        </tr>
        ${num(inv.discount_total) > 0 ? `<tr><td colspan="6" class="right lbl">Discount</td><td class="right">− ${sym}${fmt(inv.discount_total, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="6" class="right lbl">FOB Value</td>
            <td class="right strong">${sym}${fmt(inv.fob_value, 2)}</td>
        </tr>
        ${num(inv.freight_charges) > 0 ? `<tr><td colspan="6" class="right lbl">Freight</td><td class="right">${sym}${fmt(inv.freight_charges, 2)}</td></tr>` : ''}
        ${num(inv.insurance_charges) > 0 ? `<tr><td colspan="6" class="right lbl">Insurance</td><td class="right">${sym}${fmt(inv.insurance_charges, 2)}</td></tr>` : ''}
        ${num(inv.other_charges) > 0 ? `<tr><td colspan="6" class="right lbl">Other</td><td class="right">${sym}${fmt(inv.other_charges, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="6" class="right strong" style="background:#f0f0f0;">TOTAL ${esc(inv.incoterm) || 'CNF'} Amount</td>
            <td class="right strong" style="background:#f0f0f0;">${sym}${fmt(inv.grand_total, 2)}</td>
        </tr>
        <tr>
            <td colspan="6" class="right lbl">Advance Received</td>
            <td class="right">${sym}${fmt(inv.advance_received, 2)}</td>
        </tr>
        <tr>
            <td colspan="6" class="right strong">Balance Receivable</td>
            <td class="right strong">${sym}${fmt(inv.balance_receivable, 2)}</td>
        </tr>
    </table>

    ${inv.amount_in_words ? `<div class="pad" style="border:1px solid #222; border-top:none;"><span class="lbl">Amount in Words:</span> ${esc(inv.amount_in_words)}</div>` : ''}

    <table style="margin-top: 6px;">
        <tr>
            <td style="width:33%;"><span class="lbl">End Use Code</span><br/>${esc(inv.end_use_code)}</td>
            <td style="width:33%;"><span class="lbl">Preferential Agreement</span><br/>${esc(inv.preferential_agreement || 'N/A')}</td>
            <td><span class="lbl">Place of Supply</span><br/>${esc(inv.place_of_supply || '96')} - Other Territory</td>
        </tr>
    </table>

    ${banksHtml}

    ${
        d.invoice?.terms
            ? `<div class="pad" style="border:1px solid #222; border-top:none; margin-top: 6px;">
                 <div class="lbl">Terms &amp; Conditions:</div>
                 <div class="small" style="white-space: pre-line">${esc(d.invoice.terms)}</div>
               </div>`
            : ''
    }

    <div class="pad" style="border:1px solid #222; border-top:none; margin-top: 6px;">
        <div class="lbl">Declaration:</div>
        <div class="small">${esc(inv.declaration_text || 'We declare that invoice shows the actual price of the goods described and that all particulars are true and correct.')}</div>
    </div>

    <table style="margin-top: 6px;">
        <tr>
            <td class="sigbox">
                <div class="small muted">For, ${esc(d.company.company_name)}</div>
            </td>
            <td class="sigbox right">
                <div class="small muted">Authorized Signatory</div>
            </td>
        </tr>
    </table>
</div></body></html>`;
}

function buildPackingListHtml(d: RenderData): string {
    const inv = d.invoice;
    const linesHtml = (d.lines || [])
        .map(
            (l, i) => `
            <tr>
                <td class="center">${i + 1}</td>
                <td>${esc(l.product_name)}${l.product_code ? ' (' + esc(l.product_code) + ')' : ''}${l.description ? '<br/><span class="small muted">' + esc(l.description) + '</span>' : ''}</td>
                <td class="right">${fmt(l.qty, 4)} ${esc(l.uqc_code || l.unit)}</td>
                <td class="right">${l.packages != null && l.packages !== '' ? esc(String(l.packages)) : '-'}</td>
                <td class="right">${l.net_weight != null && l.net_weight !== '' ? fmt(l.net_weight, 3) + ' kg' : '-'}</td>
                <td class="right">${l.gross_weight != null && l.gross_weight !== '' ? fmt(l.gross_weight, 3) + ' kg' : '-'}</td>
            </tr>`
        )
        .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>${baseStyles}</style></head>
<body><div class="doc">
    <div class="title">PACKING LIST</div>
    <div class="subtitle">SUPPLY MEANT FOR EXPORT</div>

    <table>
        <tr>
            <td style="width:60%;"><span class="lbl">Packing List No.:</span> ${esc(inv.voucher_no || '(DRAFT)')}</td>
            <td><span class="lbl">Date:</span> ${esc(String(inv.invoice_date || '').slice(0, 10))}</td>
        </tr>
    </table>

    ${partiesBlock(d, true)}

    ${shippingRouteBlock(d)}

    <table style="margin-top: 0;">
        <tr>
            <th style="width:36px;">SR NO</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:120px;">QTY / UNIT</th>
            <th style="width:90px;">NO. OF PKGS</th>
            <th style="width:100px;">NET WEIGHT</th>
            <th style="width:100px;">GROSS WEIGHT</th>
        </tr>
        ${linesHtml}
        <tr>
            <td colspan="3" class="right strong" style="background:#f0f0f0;">GRAND TOTAL</td>
            <td class="right strong" style="background:#f0f0f0;">${
                inv.total_packages != null
                    ? esc(String(inv.total_packages))
                    : '-'
            }</td>
            <td class="right strong" style="background:#f0f0f0;">${
                inv.net_weight_kg != null
                    ? fmt(inv.net_weight_kg, 3) + ' kg'
                    : '-'
            }</td>
            <td class="right strong" style="background:#f0f0f0;">${
                inv.gross_weight_kg != null
                    ? fmt(inv.gross_weight_kg, 3) + ' kg'
                    : '-'
            }</td>
        </tr>
    </table>

    ${
        inv.total_packages != null ||
        inv.net_weight_kg != null ||
        inv.gross_weight_kg != null
            ? ''
            : `<div class="pad small muted" style="margin-top: 6px;">
                Note: Package count and weights are recorded on the invoice's
                Shipment &amp; Shipping Bill block once the consignment ships.
                Until then, fields show "-".
            </div>`
    }

    <table style="margin-top: 12px;">
        <tr>
            <td class="sigbox">
                <div class="small muted">For, ${esc(d.company.company_name)}</div>
            </td>
            <td class="sigbox right">
                <div class="small muted">Authorized Signatory</div>
            </td>
        </tr>
    </table>
</div></body></html>`;
}
