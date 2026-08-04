import * as fs from 'fs';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { docDate } from '@common/pdf/tally-pdf.util';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';
import {
    buildDocWorkbook,
    buildExcelFilename,
    curCell,
    moneyCell,
    textCell,
    DocCell,
    DocSection,
} from '@common/excel-doc/excel-doc.builder';
import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { InvoicePaymentRepository } from '../repository/repositories/invoice-payment.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
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

export type InvoicePdfDocType =
    | 'commercial'
    | 'packing-list'
    | 'export'
    | 'receipt';

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
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository
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

    /**
     * Render a printable Receipt Voucher for a single customer payment
     * (chart step 11). Shows the receipt no, the amount received, and the
     * running balance on the invoice after this receipt.
     */
    async renderReceipt(
        companyId: string,
        invoiceId: string,
        paymentId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.loadRenderData(companyId, invoiceId);

        const payment: any = await this.invoicePaymentRepository.findOne({
            _id: paymentId,
            invoice_id: invoiceId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!payment || payment.voided_at) {
            throw new NotFoundException('Receipt not found');
        }

        // Total received across all active payments → running balance.
        const totalReceived =
            await this.invoicePaymentRepository.sumActiveByInvoiceId(invoiceId);

        const html = buildReceiptHtml(data, payment, totalReceived);

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

        const safe = (payment.receipt_voucher_no || 'RECEIPT')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return { buffer, filename: `${safe}.pdf` };
    }

    /**
     * Styled Excel of an invoice document (commercial | export | packing-list).
     * Reuses the SAME loadRenderData path as the PDF (build plan §5/§7.2).
     */
    async renderExcel(
        companyId: string,
        invoiceId: string,
        doc: InvoicePdfDocType
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.loadRenderData(companyId, invoiceId);
        const sections = buildInvoiceExcelSections(data, doc);
        const sheetName =
            doc === 'packing-list'
                ? 'Packing List'
                : doc === 'export'
                ? 'Export Invoice'
                : 'Commercial Invoice';
        const buffer = buildDocWorkbook({
            sheetName,
            sections,
            columnWidths: [6, 14, 14, 34, 18, 12, 14, 16],
        });
        const suffix =
            doc === 'packing-list'
                ? '-PackingList'
                : doc === 'export'
                ? '-Export'
                : '';
        return {
            buffer,
            filename: buildExcelFilename(
                `${data.invoice.voucher_no || 'INVOICE'}${suffix}`
            ),
        };
    }

    /** Styled Excel of a single customer Receipt — mirrors renderReceipt. */
    async renderReceiptExcel(
        companyId: string,
        invoiceId: string,
        paymentId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.loadRenderData(companyId, invoiceId);
        const payment: any = await this.invoicePaymentRepository.findOne({
            _id: paymentId,
            invoice_id: invoiceId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!payment || payment.voided_at) {
            throw new NotFoundException('Receipt not found');
        }
        const totalReceived =
            await this.invoicePaymentRepository.sumActiveByInvoiceId(invoiceId);
        const sections = buildReceiptExcelSections(data, payment, totalReceived);
        const buffer = buildDocWorkbook({
            sheetName: 'Receipt',
            sections,
            columnWidths: [30, 22, 16, 16, 16, 18],
        });
        return {
            buffer,
            filename: buildExcelFilename(
                payment.receipt_voucher_no || 'Receipt'
            ),
        };
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

        // Multi-SO reference numbers: an invoice can draw lines from several
        // Sales Orders, each with its own manual `reference_no`. Resolve the
        // distinct set (via each line's purchase_order_line_id → SO) and merge
        // with the invoice's own reference_no (own first). All 3 PDFs print
        // this joined list instead of the single field.
        const refList: string[] = [];
        const seenRef = new Set<string>();
        const pushRef = (r?: string) => {
            const v = (r || '').trim();
            if (v && !seenRef.has(v)) {
                seenRef.add(v);
                refList.push(v);
            }
        };
        pushRef(invoice.reference_no);
        const poLineIds = Array.from(
            new Set(
                (lines as any[])
                    .map((l) => l.purchase_order_line_id?.toString())
                    .filter(Boolean)
            )
        );
        if (poLineIds.length) {
            try {
                const poLines = await this.poLineRepository.findAll({
                    _id: { $in: poLineIds },
                } as any);
                const poIds = Array.from(
                    new Set(
                        (poLines as any[])
                            .map((pl) => pl.purchase_order_id?.toString())
                            .filter(Boolean)
                    )
                );
                if (poIds.length) {
                    const pos = await this.poRepository.findAll({
                        _id: { $in: poIds },
                    } as any);
                    // Preserve SO order by voucher for a stable, readable list.
                    (pos as any[])
                        .slice()
                        .sort((a, b) =>
                            String(a.voucher_no || '').localeCompare(
                                String(b.voucher_no || '')
                            )
                        )
                        .forEach((po) => pushRef(po.reference_no));
                }
            } catch {
                /* non-fatal — fall back to the invoice's own reference_no */
            }
        }
        // Attach onto the fetched (non-persisted) invoice object for the
        // templates. `reference_nos` is the joined list; falls back to the
        // single field when nothing resolves.
        (invoice as any).reference_nos = refList.join(', ') || invoice.reference_no;

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

        // Bill-to (buyer): the customer being invoiced + its selected BILL_TO
        // address. Keyed on invoice.customer_id / customer_address_id (distinct
        // from the consignee/ship-to above). Powers the "Bill To" block.
        const billToCustomer: any = invoice.customer_id
            ? await this.customerRepository.findOneById(
                  invoice.customer_id.toString()
              )
            : null;
        const billToAddresses = billToCustomer
            ? await this.customerAddressRepository.findAll({
                  customer_id: billToCustomer._id.toString(),
                  soft_delete: false,
              } as any)
            : [];
        const billToAddr: any = invoice.customer_address_id
            ? (billToAddresses as any[]).find(
                  (a: any) =>
                      a._id?.toString() ===
                      invoice.customer_address_id?.toString()
              )
            : (billToAddresses as any[]).find((a: any) => a.is_default) ||
              (billToAddresses as any[])[0];

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
            billToCustomer,
            billToAddr,
            billToSnapshot: invoice.customer_snapshot,
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
    // Bill-to (buyer) party — customer + its selected BILL_TO address, plus
    // any frozen snapshot on the invoice. Rendered as the "Bill To" block.
    billToCustomer: any;
    billToAddr: any;
    billToSnapshot: any;
}

// ─── Excel sections (mirror the PDF templates) ──────────────────────────────

/** Bill-To (buyer) address lines — snapshot preferred, else FK lookup. */
function billToExcelLines(d: RenderData): string[] {
    const bSnap = d.billToSnapshot || null;
    const btCust = d.billToCustomer || {};
    const bta = d.billToAddr || {};
    const parts = bSnap
        ? [
              bSnap.name,
              bSnap.address_line1,
              bSnap.address_line2,
              [bSnap.city, bSnap.state].filter(Boolean).join(', '),
              [bSnap.country, bSnap.postcode].filter(Boolean).join(' - '),
          ]
        : [
              btCust.company_name,
              bta?.address_line1,
              bta?.address_line2,
              [bta?.city, bta?.state].filter(Boolean).join(', '),
              bta?.country,
          ];
    return parts.map((s: any) => String(s || '').trim()).filter(Boolean);
}

/** Consignee (Ship-To) address lines — snapshot preferred, else FK lookup. */
function consigneeExcelLines(d: RenderData): string[] {
    const cSnap = d.consigneeSnapshot || null;
    const cust = d.customer || {};
    const cad = d.consigneeAddr || {};
    const parts = cSnap
        ? [
              cSnap.name,
              cSnap.address_line1,
              cSnap.address_line2,
              [cSnap.city, cSnap.state].filter(Boolean).join(', '),
              [cSnap.country, cSnap.postcode].filter(Boolean).join(' - '),
          ]
        : [
              cust.company_name,
              cad?.address_line1,
              cad?.address_line2,
              [cad?.city, cad?.state].filter(Boolean).join(', '),
              cad?.country,
          ];
    return parts.map((s: any) => String(s || '').trim()).filter(Boolean);
}

/** Exporter / shipper (company) address lines for the header block. */
function exporterExcelLines(d: RenderData): string[] {
    const c = d.company || {};
    const ca = d.companyAddr || {};
    const parts = [
        ca.address_line1,
        ca.address_line2,
        [ca.city, ca.state].filter(Boolean).join(', '),
        [ca.country, ca.postcode].filter(Boolean).join(' - '),
        ca.gstin || c.tax_number ? `GSTIN/UIN: ${ca.gstin || c.tax_number}` : '',
        c.email ? `E-Mail: ${c.email}` : '',
    ];
    return parts.map((s: any) => String(s || '').trim()).filter(Boolean);
}

/** Notify-party address lines (export docs). */
function notifyExcelLines(d: RenderData): string[] {
    const n = d.notifySnapshot || {};
    if (!(n.name || n.address_line1 || n.address)) return [];
    const parts = [
        n.name,
        n.address_line1 || n.address,
        n.address_line2,
        [n.city, n.state].filter(Boolean).join(', '),
        [n.country, n.postcode].filter(Boolean).join(' - '),
    ];
    return parts.map((s: any) => String(s || '').trim()).filter(Boolean);
}

/** Commercial / Export / Packing List Excel sections — mirrors the PDF field-for-field. */
function buildInvoiceExcelSections(
    d: RenderData,
    doc: InvoicePdfDocType
): DocSection[] {
    const inv = d.invoice || {};
    const c = d.company || {};
    const ca = d.companyAddr || {};
    const code = inv.currency_code || 'INR';
    const sym = inv.currency_symbol || getCurrencySymbol(code) || code;
    const isPacking = doc === 'packing-list';
    const isExport = doc === 'export';
    const isLut = inv.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED;
    const showIgst = !isPacking && !isExport && !isLut;
    const er = Number(inv.exchange_rate || 0);
    const COLS = 8;
    const dash = (v: any): string => {
        const s = String(v == null ? '' : v).trim();
        return s || '-';
    };
    const pad = (cells: DocCell[]): DocCell[] => {
        const out = cells.slice(0, COLS);
        while (out.length < COLS) out.push(textCell(''));
        return out;
    };

    const title = isPacking
        ? 'PACKING LIST'
        : isExport
        ? 'EXPORT INVOICE'
        : 'COMMERCIAL INVOICE';
    const subtitle = isPacking
        ? 'SUPPLY MEANT FOR EXPORT'
        : isLut
        ? 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST'
        : 'SUPPLY MEANT FOR EXPORT WITH PAYMENT OF IGST';

    // Distinct line-level fallback for the SO/Quotation refs.
    const distinct = (key: string): string =>
        Array.from(
            new Set(
                (d.lines || [])
                    .map((l: any) => l?.[key])
                    .filter((v: any): v is string => !!v)
            )
        ).join(', ');
    const quotationNo = inv.quotation_voucher_no || distinct('quotation_voucher_no');
    const soNo = inv.purchase_order_voucher_no || distinct('purchase_order_voucher_no');

    // ── SHIPPER block (left of the top band) ──
    const shipperLines: string[] = [];
    for (const s of [
        ca.address_line1,
        ca.address_line2,
        [ca.city, ca.state].filter(Boolean).join(', '),
        [ca.country, ca.postcode].filter(Boolean).join(' - '),
    ])
        if (String(s || '').trim()) shipperLines.push(String(s).trim());
    shipperLines.push(`GST No: ${dash(ca.gstin || c.tax_number)}`);
    shipperLines.push(`PAN No.: ${dash(c.pan)}`);
    shipperLines.push(`IEC No.: ${dash(c.iec)}`);
    shipperLines.push(
        `LUT No. & date: ${dash(inv.lut_no)}${inv.lut_date ? ' / ' + docDate(inv.lut_date) : ''}`
    );

    // ── Header meta grid (right of the top band) ──
    const metaPairs: Array<[string, string]> = [
        [isPacking ? 'Packing List No.' : 'Invoice No.', dash(inv.voucher_no)],
        ['Date', dash(docDate(inv.invoice_date))],
        ['Quotation No.', dash(quotationNo)],
        ['Sales Order No.', dash(soNo)],
        ['Reference No.', dash(inv.reference_nos || inv.reference_no)],
        ['Shipping No.', dash(inv.shipping_voucher_no)],
    ];
    if (!isPacking) {
        metaPairs.push(['Incoterm', dash(inv.incoterm)]);
        metaPairs.push(["Buyer's PO #", dash(inv.customer_po_no)]);
        metaPairs.push(['Currency', code]);
        metaPairs.push([
            'Exchange Rate',
            er > 0 ? `${sym} 1 = ₹${fmt(1 / er, 2)}` : '-',
        ]);
        if (isExport && inv.bl_awb_no)
            metaPairs.push([`${awbLabel(inv.mode)} No.`, inv.bl_awb_no]);
    }

    const sections: DocSection[] = [
        { kind: 'title', text: title, subtitle },
        {
            kind: 'band',
            left: { label: `SHIPPER: ${c.company_name || ''}`, lines: shipperLines },
            right: { pairs: metaPairs },
        },
        {
            kind: 'band',
            left: { label: 'Bill To', lines: billToExcelLines(d) },
            right: { label: 'Ship To', lines: consigneeExcelLines(d).length ? consigneeExcelLines(d) : billToExcelLines(d) },
        },
    ];
    const notifyLines = notifyExcelLines(d);
    if (notifyLines.length)
        sections.push({ kind: 'party', label: 'Buyer(s) / Notify Party', lines: notifyLines });

    // ── Origin / destination / terms / export route ──
    const routeLabel = isLut
        ? 'Export Under LUT (Without Payment of IGST)'
        : 'Export With Payment of IGST';
    const billType = inv.shipping_bill_type
        ? SHIPPING_BILL_TYPE_LABELS[inv.shipping_bill_type] || inv.shipping_bill_type
        : '';
    const termsPay =
        dash(inv.delivery_terms || inv.incoterm) +
        (inv.payment_terms ? ` · Payment: ${inv.payment_terms}` : '');
    const originPairs: Array<[string, string]> = [
        ['Country of Origin', dash(inv.country_of_origin || 'India')],
        ['Terms of Delivery and Payment', termsPay],
        ['Country of Destination', dash(inv.country_of_destination)],
        ['Export Route', routeLabel + (billType ? ` · Export Under ${billType}` : '')],
    ];
    if (!isPacking) sections.push({ kind: 'kv', pairs: originPairs });

    // ── Shipping route / ports (always shown) ──
    const pol = inv.port_of_loading_snapshot || {};
    const pod = inv.port_of_discharge_snapshot || {};
    const routePairs: Array<[string, string]> = [
        ['Pre-Carriage By', dash(inv.pre_carriage_by)],
        ['Place of Receipt', dash(inv.place_of_receipt)],
        ['Port of Loading', dash(pol.name || pol.port_name || pol.code)],
        ['Port of Discharge', dash(pod.name || pod.port_name || pod.code)],
        ['Place of Delivery', dash(inv.place_of_delivery)],
    ];
    sections.push({ kind: 'kv', pairs: routePairs });
    sections.push({ kind: 'spacer' });

    if (isPacking) {
        const head = [
            'SR', 'Part No', 'HSN', 'Description of Goods',
            'Qty / Unit', 'No. of Pkgs', 'Net Weight', 'Gross Weight',
        ];
        const rows: DocCell[][] = (d.lines || []).map((l: any, i: number) =>
            pad([
                textCell(i + 1, 'c'),
                textCell(l.part_no || '-', 'c'),
                textCell(l.hsn_code || '-', 'c'),
                textCell((l.product_name || '') + (l.product_code ? ` (${l.product_code})` : ''), 'l'),
                textCell(`${fmt(l.qty, 2)} ${l.uqc_code || l.unit || ''}`.trim(), 'r'),
                textCell(l.packages != null && l.packages !== '' ? String(l.packages) : '-', 'r'),
                textCell(l.net_weight != null && l.net_weight !== '' ? `${fmt(l.net_weight, 3)} kg` : '-', 'r'),
                textCell(l.gross_weight != null && l.gross_weight !== '' ? `${fmt(l.gross_weight, 3)} kg` : '-', 'r'),
            ])
        );
        const gt: DocCell[] = [
            { ...textCell('GRAND TOTAL', 'r', { bold: true }), colSpan: 5, fill: 'F3F2F7' },
            textCell(''), textCell(''), textCell(''), textCell(''),
            textCell(inv.total_packages != null ? String(inv.total_packages) : '-', 'r', { bold: true }),
            textCell(inv.net_weight_kg != null ? `${fmt(inv.net_weight_kg, 3)} kg` : '-', 'r', { bold: true }),
            textCell(inv.gross_weight_kg != null ? `${fmt(inv.gross_weight_kg, 3)} kg` : '-', 'r', { bold: true }),
        ];
        rows.push(gt);
        sections.push({ kind: 'table', head, rows, align: ['c', 'c', 'c', 'l', 'r', 'r', 'r', 'r'] });
        // Bank + declaration still print on the packing list PDF footer.
        pushBankAndFooter(sections, d, inv);
        return sections;
    }

    // ── Commercial / Export line table ──
    const head = [
        'SR', 'HSN', 'Part No', 'Description of Goods',
        'Requirement #', 'Qty', 'Price / Unit', `Amount (${sym})`,
    ];
    let totalIgstInr = 0;
    const rows: DocCell[][] = (d.lines || []).map((l: any, i: number) => {
        const qty = num(l.qty);
        const lineTotal = num(l.line_total);
        const priceUnit = qty > 0 ? lineTotal / qty : num(l.unit_price);
        if (showIgst) {
            const rate = Number(l.igst_rate_pct || 0);
            if (rate > 0)
                totalIgstInr += (Number(l.taxable_amount || 0) / (er > 0 ? er : 1)) * (rate / 100);
        }
        return pad([
            textCell(i + 1, 'c'),
            textCell(l.hsn_code || '-', 'c'),
            textCell(l.part_no || '-', 'c'),
            textCell(
                (l.product_name || '') +
                    (l.product_code ? ` (${l.product_code})` : '') +
                    (l.description && l.description !== l.product_name ? ` — ${l.description}` : ''),
                'l'
            ),
            textCell(l.customer_reference || '', 'l'),
            textCell(`${fmt(qty, 2)} ${l.uqc_code || l.unit || ''}`.trim(), 'r'),
            curCell(priceUnit, sym, 2),
            curCell(lineTotal, sym, 2, { bold: true }),
        ]);
    });

    const sumRow = (label: string, value: number, s2 = sym, opts?: { bold?: boolean; fill?: string; color?: string }): DocCell[] => {
        const cells: DocCell[] = [{ ...textCell(label, 'r', { bold: opts?.bold }), colSpan: COLS - 1 }];
        for (let k = 1; k < COLS - 1; k++) cells.push(textCell(''));
        cells.push(curCell(value, s2, 2, opts));
        return cells;
    };
    if (num(inv.discount_total) > 0) {
        rows.push(sumRow('Subtotal', num(inv.subtotal)));
        rows.push(sumRow('Discount', -num(inv.discount_total)));
    }
    if (num(inv.freight_charges) > 0 || num(inv.insurance_charges) > 0 || num(inv.other_charges) > 0)
        rows.push(sumRow('FOB Value', num(inv.fob_value), sym, { bold: true, fill: 'F3F2F7' }));
    if (num(inv.freight_charges) > 0) rows.push(sumRow('Freight', num(inv.freight_charges)));
    if (num(inv.insurance_charges) > 0) rows.push(sumRow('Insurance', num(inv.insurance_charges)));
    if (num(inv.other_charges) > 0) rows.push(sumRow('Other', num(inv.other_charges)));
    if (showIgst) rows.push(sumRow('Total IGST Amt. (INR)', totalIgstInr, '₹', { bold: true }));
    rows.push(sumRow(`TOTAL ${inv.incoterm || 'CNF'} Amount`, num(inv.grand_total), sym, { bold: true, fill: 'FDEBD8', color: 'C25E10' }));
    rows.push(sumRow('Advance Received', num(inv.advance_received)));
    if (isExport) rows.push(sumRow('Balance Receivable', num(inv.balance_receivable), sym, { bold: true }));

    sections.push({ kind: 'table', head, rows, align: ['c', 'c', 'c', 'l', 'l', 'r', 'r', 'r'] });
    sections.push({ kind: 'spacer' });
    if (inv.amount_in_words)
        sections.push({ kind: 'note', text: `Amount Chargeable (in words): ${inv.amount_in_words}`, bold: true });

    // IGST refund buckets (commercial, INR).
    if (showIgst && Array.isArray(inv.igst_refund_buckets) && inv.igst_refund_buckets.length) {
        sections.push({ kind: 'note', text: 'IGST Refund (INR)', bold: true });
        const bRows = inv.igst_refund_buckets.map((b: any) => [
            curCell(num(b.assessable_value_inr), '₹', 2),
            textCell(`${fmt(b.rate, 2)}%`, 'c'),
            curCell(num(b.igst_amount_inr), '₹', 2, { bold: true }),
        ]);
        bRows.push([
            { ...textCell('Total IGST Refund', 'r', { bold: true }), colSpan: 2 } as DocCell,
            textCell(''),
            curCell(num(inv.igst_refund_amount), '₹', 2, { bold: true }),
        ]);
        sections.push({ kind: 'table', head: ['Assessable Value (INR)', 'IGST Rate', 'IGST Amount (INR)'], rows: bRows, align: ['r', 'c', 'r'] });
    }

    // End-use / preferential / place of supply / advance received strip.
    sections.push({
        kind: 'kv',
        pairs: [
            ['End Use Code', dash(inv.end_use_code)],
            ['Preferential Agreement', dash(inv.preferential_agreement || 'N/A')],
            ['Place of Supply', `${inv.place_of_supply || '96'} - Other Territory`],
            ['Advance Received', `${sym} ${fmt(inv.advance_received, 2)}`],
        ],
    });
    // Cargo totals strip.
    sections.push({
        kind: 'kv',
        pairs: [
            ['Total Packages', dash(inv.total_packages)],
            ['Net Weight', inv.net_weight_kg != null ? `${fmt(inv.net_weight_kg, 3)} kg` : '-'],
            ['Gross Weight', inv.gross_weight_kg != null ? `${fmt(inv.gross_weight_kg, 3)} kg` : '-'],
        ],
    });

    pushBankAndFooter(sections, d, inv);
    return sections;
}

/** Bank details + terms + declaration/signatory footer — shared by all invoice docs. */
function pushBankAndFooter(sections: DocSection[], d: RenderData, inv: any): void {
    const banks = Array.isArray(inv.bank_snapshots) ? inv.bank_snapshots : [];
    for (const b of banks) {
        const bankLines = [
            b.name ? `Bank Name: ${b.name}` : '',
            b.account_no ? `A/c No.: ${b.account_no}` : '',
            b.beneficiary ? `Beneficiary: ${b.beneficiary}` : '',
            b.branch ? `Branch: ${b.branch}` : '',
            b.swift_code ? `SWIFT: ${b.swift_code}` : '',
            b.ad_code ? `AD Code: ${b.ad_code}` : '',
        ].filter(Boolean);
        if (bankLines.length)
            sections.push({ kind: 'party', label: 'Bank Details', lines: bankLines });
    }
    if (inv.terms)
        sections.push({ kind: 'note', text: `Terms & Conditions: ${inv.terms}` });
    sections.push({
        kind: 'band',
        left: {
            label: 'Declaration',
            lines: [
                inv.declaration_text ||
                    'We declare that invoice shows the actual price of the goods described and that all particulars are true and correct.',
            ],
        },
        right: { label: '', lines: [`for ${d.company?.company_name || ''}`, 'Authorized Signatory'] },
    });
}

/** Receipt Voucher Excel sections. */
function buildReceiptExcelSections(
    d: RenderData,
    payment: any,
    totalReceived: number
): DocSection[] {
    const inv = d.invoice || {};
    const code = inv.currency_code || 'INR';
    const grand = num(inv.grand_total);
    const balance = grand - totalReceived;
    const receivedFrom =
        d.consigneeSnapshot?.name || d.customer?.company_name || '';
    const methodLabel = (payment.method || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (m: string) => m.toUpperCase());

    const sym = inv.currency_symbol || getCurrencySymbol(code) || code;
    const metaPairs: Array<[string, string]> = [
        ['Receipt No.', payment.receipt_voucher_no || '—'],
        ['Date', docDate(payment.payment_date) || '-'],
    ];
    const detailPairs: Array<[string, string]> = [
        [
            'Towards Invoice',
            `${inv.voucher_no || '(DRAFT)'}${inv.invoice_date ? ' dated ' + docDate(inv.invoice_date) : ''}`,
        ],
        ['Mode', methodLabel || '—'],
        ['Reference', payment.reference || '—'],
        ['Received in Bank', payment.bank_name || '—'],
        ['Currency', code],
    ];

    // Summary as a 2-col table (right-aligned currency) — mirrors the PDF box.
    const sumRow = (label: string, value: number, opts?: { bold?: boolean; fill?: string; color?: string }): DocCell[] => [
        textCell(label, 'r', { bold: opts?.bold }),
        curCell(value, sym, 2, opts),
    ];
    const summaryRows: DocCell[][] = [
        sumRow('Invoice Total', grand),
        sumRow('Total Received (incl. this receipt)', totalReceived),
        sumRow('Balance Receivable', balance, { bold: true, fill: 'FDEBD8', color: 'C25E10' }),
    ];

    const sections: DocSection[] = [
        { kind: 'title', text: 'RECEIPT VOUCHER', subtitle: d.company?.company_name },
        {
            kind: 'band',
            left: { label: d.company?.company_name || 'Company', lines: exporterExcelLines(d) },
            right: { pairs: metaPairs },
        },
        {
            kind: 'party',
            label: 'Received With Thanks From',
            lines: [receivedFrom].filter(Boolean),
        },
        {
            kind: 'note',
            text: `Amount Received: ${sym} ${fmt(payment.amount, 2)}`,
            bold: true,
        },
        { kind: 'kv', pairs: detailPairs },
        { kind: 'spacer' },
        {
            kind: 'table',
            head: ['Summary', `Amount (${sym})`],
            rows: summaryRows,
            align: ['r', 'r'],
        },
    ];
    if (payment.notes)
        sections.push({ kind: 'note', text: `Notes: ${payment.notes}` });
    return sections;
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
    /* Keep a self-contained block from splitting across a page boundary —
       the whole block moves to the next page instead of breaking in half. */
    .avoid-break { page-break-inside: avoid; }
    tr { page-break-inside: avoid; }
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
    return `<table class="avoid-break" style="margin-top: 6px;">
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

/** Upstream document reference chain (§10 "must show references"):
 *  Quotation (CST) → Sales Order (SO) → Shipping, whichever are recorded on
 *  the invoice. The customer's own PO is shown separately in the Incoterm
 *  strip. Returns '' when no upstream voucher is set. */
function referencesBlock(d: RenderData): string {
    const inv = d.invoice || {};
    // Header snapshot is primary; fall back to distinct line-level vouchers
    // (writeLines populates those) so older invoices — created before the
    // header snapshot landed — still print their references.
    const distinct = (key: string): string => {
        const fromLines = Array.from(
            new Set(
                (d.lines || [])
                    .map((l: any) => l?.[key])
                    .filter((v: any): v is string => !!v)
            )
        );
        return fromLines.join(', ');
    };
    const quotationNo =
        inv.quotation_voucher_no || distinct('quotation_voucher_no');
    const poNo =
        inv.purchase_order_voucher_no || distinct('purchase_order_voucher_no');
    const refs: Array<[string, any]> = (
        [
            ['Quotation No.', quotationNo],
            ['Sales Order No.', poNo],
            // Manual tracking reference(s). For a multi-SO invoice this is the
            // distinct list of every source SO's reference_no + the invoice's own.
            ['Reference No.', inv.reference_nos || inv.reference_no],
            ['Shipping No.', inv.shipping_voucher_no],
        ] as Array<[string, any]>
    ).filter(([, v]) => !!v);
    if (!refs.length) return '';
    const width = Math.floor(100 / refs.length);
    const cells = refs
        .map(
            ([label, value]) =>
                `<td style="width:${width}%;"><span class="lbl">${esc(
                    label
                )}</span><br/>${esc(value)}</td>`
        )
        .join('');
    return `
    <table style="margin-top: 0;">
        <tr>${cells}</tr>
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

    // Bill To (buyer being invoiced): snapshot preferred, else FK lookup.
    const bSnap = d.billToSnapshot || null;
    const btCust = d.billToCustomer || {};
    const bta = d.billToAddr || {};
    const billToLines = bSnap
        ? [
              bSnap.name,
              bSnap.address_line1,
              bSnap.address_line2,
              [bSnap.city, bSnap.state].filter(Boolean).join(', '),
              [bSnap.country, bSnap.postcode].filter(Boolean).join(' - '),
          ]
              .filter(Boolean)
              .join('<br/>')
        : [
              btCust.company_name,
              bta?.address_line1,
              bta?.address_line2,
              [bta?.city, bta?.state].filter(Boolean).join(', '),
              [bta?.country, bta?.postcode].filter(Boolean).join(' - '),
          ]
              .filter(Boolean)
              .join('<br/>');

    // Ship To = consignee. When no distinct consignee is set (ship-to same as
    // bill-to), fall back to the Bill To address so both blocks print it.
    const shipToLines = consigneeLines || billToLines;

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
                    <tr><td class="lbl">LUT No. and date</td><td>${esc(d.invoice.lut_no)}${d.invoice.lut_date ? ' / ' + esc(docDate(d.invoice.lut_date)) : ''}</td></tr>
                </table>
            </td>
            <td style="width: 50%; vertical-align: top;">
                ${
                    includeNotify && notifyLines
                        ? `<div class="lbl">Buyer(s) / Notify Party</div>
                           <div>${notifyLines}</div>`
                        : ''
                }
            </td>
        </tr>
        <tr>
            <td style="width: 50%; vertical-align: top;">
                <div class="lbl">BILL TO:</div>
                <div>${billToLines}</div>
            </td>
            <td style="width: 50%; vertical-align: top;">
                <div class="lbl">SHIP TO:</div>
                <div>${shipToLines}</div>
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

/** Cargo totals strip — Total Packages / Net Weight / Gross Weight from the
 *  invoice header (auto-summed from the lines). Returns '' when none set. */
function cargoTotalsBlock(inv: any): string {
    const has =
        inv.total_packages != null ||
        inv.net_weight_kg != null ||
        inv.gross_weight_kg != null;
    if (!has) return '';
    return `
    <table style="margin-top: 6px;">
        <tr>
            <td style="width:33%;"><span class="lbl">Total Packages</span><br/>${
                inv.total_packages != null
                    ? esc(String(inv.total_packages))
                    : '-'
            }</td>
            <td style="width:33%;"><span class="lbl">Net Weight</span><br/>${
                inv.net_weight_kg != null
                    ? fmt(inv.net_weight_kg, 3) + ' kg'
                    : '-'
            }</td>
            <td><span class="lbl">Gross Weight</span><br/>${
                inv.gross_weight_kg != null
                    ? fmt(inv.gross_weight_kg, 3) + ' kg'
                    : '-'
            }</td>
        </tr>
    </table>`;
}

function buildCommercialInvoiceHtml(d: RenderData): string {
    const inv = d.invoice;
    const isLut = inv.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED;
    const subtitle = isLut
        ? 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST'
        : 'SUPPLY MEANT FOR EXPORT WITH PAYMENT OF IGST';
    const sym = esc(inv.currency_symbol || getCurrencySymbol(inv.currency_code) || '');

    // Per-line IGST is shown in INR (matches the refund bucket basis).
    // For LUT route IGST is 0% — we drop the two columns entirely.
    const showIgst = !isLut;
    const er = Number(inv.exchange_rate || 0);
    // Multi-currency: line values are ALREADY in the document currency (each
    // cost was converted source→doc in recompute), so they print as-is —
    // erMul = 1. `er` (doc-per-₹1) is used only for the INR IGST + the rate line.
    const erMul = 1;
    let totalIgstInr = 0;
    const lineIgstInr = (l: any): number => {
        const rate = Number(l.igst_rate_pct || 0);
        if (!showIgst || rate <= 0) return 0;
        // taxable_amount is in the DOCUMENT currency → ÷ er for the INR
        // assessable value; IGST (INR) = assessable_inr × rate.
        const taxableInr = Number(l.taxable_amount || 0) / (er > 0 ? er : 1);
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
                <td class="center">${esc(l.part_no)}</td>
                <td>${esc(l.product_name)}${l.product_code ? '<br/><span class="small muted">' + esc(l.product_code) + '</span>' : ''}${l.description && l.description !== l.product_name ? '<br/><span class="small muted">' + esc(l.description) + '</span>' : ''}</td>
                <td style="white-space:nowrap;">${esc(l.customer_reference)}</td>
                <td class="right">${fmt(l.qty, 2)} ${esc(l.uqc_code || l.unit)}</td>
                <td class="right">${sym}${fmt(num(l.qty) > 0 ? (num(l.line_total) * erMul) / num(l.qty) : num(l.unit_price) * erMul, 2)}</td>
                <td class="right strong">${sym}${fmt(num(l.line_total) * erMul, 2)}</td>
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
            <td><span class="lbl">Date:</span> ${esc(docDate(inv.invoice_date))}</td>
        </tr>
    </table>

    ${referencesBlock(d)}

    ${partiesBlock(d, true)}

    ${shippingRouteBlock(d)}

    <table style="margin-top: 0;">
        <tr>
            <td style="width:33%;"><span class="lbl">Incoterm</span><br/>${esc(inv.incoterm)}</td>
            <td style="width:33%;"><span class="lbl">Buyer's PO #</span><br/>${esc(inv.customer_po_no)}</td>
            <td><span class="lbl">Exchange Rate</span><br/>${sym}1 = ₹${fmt(er > 0 ? 1 / er : 1, 2)}</td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <th style="width:32px;">SR NO</th>
            <th style="width:64px;">HSN CODE</th>
            <th style="width:70px;">PART NO</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:150px; white-space:nowrap;">REQUIREMENT #</th>
            <th style="width:74px;">QTY</th>
            <th style="width:86px;">PRICE / UNIT</th>
            <th style="width:100px;">AMOUNT</th>
        </tr>
        ${linesHtml}
        ${num(inv.discount_total) > 0 ? `<tr>
            <td colspan="7" class="right lbl">Subtotal</td>
            <td class="right strong">${sym}${fmt(inv.subtotal, 2)}</td>
        </tr>
        <tr><td colspan="7" class="right lbl">Discount</td><td class="right">− ${sym}${fmt(inv.discount_total, 2)}</td></tr>` : ''}
        ${(num(inv.freight_charges) > 0 || num(inv.insurance_charges) > 0 || num(inv.other_charges) > 0) ? `<tr>
            <td colspan="7" class="right lbl">FOB Value</td>
            <td class="right strong">${sym}${fmt(inv.fob_value, 2)}</td>
        </tr>` : ''}
        ${num(inv.freight_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Freight</td><td class="right">${sym}${fmt(inv.freight_charges, 2)}</td></tr>` : ''}
        ${num(inv.insurance_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Insurance</td><td class="right">${sym}${fmt(inv.insurance_charges, 2)}</td></tr>` : ''}
        ${num(inv.other_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Other</td><td class="right">${sym}${fmt(inv.other_charges, 2)}</td></tr>` : ''}
        ${showIgst ? `<tr><td colspan="7" class="right lbl">Total IGST Amt. (INR)</td><td class="right strong">₹${fmt(totalIgstInr, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="7" class="right strong" style="background:#f0f0f0;">TOTAL ${esc(inv.incoterm) || 'CNF'} Amount</td>
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

    ${cargoTotalsBlock(inv)}

    ${banksHtml}

    ${
        d.invoice?.terms
            ? `<div class="pad avoid-break" style="border:1px solid #222; border-top:none; margin-top: 6px;">
                 <div class="lbl">Terms &amp; Conditions:</div>
                 <div class="small" style="white-space: pre-line">${esc(d.invoice.terms)}</div>
               </div>`
            : ''
    }

    <div class="pad avoid-break" style="border:1px solid #222; border-top:none; margin-top: 6px;">
        <div class="lbl">Declaration:</div>
        <div class="small">${esc(inv.declaration_text || 'We declare that invoice shows the actual price of the goods described and that all particulars are true and correct.')}</div>
    </div>

    <table class="avoid-break" style="margin-top: 6px;">
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
    const sym = esc(inv.currency_symbol || getCurrencySymbol(inv.currency_code) || '');
    // Multi-currency: line values are ALREADY in the document currency (each
    // cost was converted source→doc in recompute), so they print as-is (erMul=1).
    const er = Number(inv.exchange_rate || 0);
    const erMul = 1;

    const linesHtml = (d.lines || [])
        .map(
            (l, i) => `
            <tr>
                <td class="center">${i + 1}</td>
                <td class="center">${esc(l.hsn_code)}</td>
                <td class="center">${esc(l.part_no)}</td>
                <td>${esc(l.product_name)}${l.product_code ? '<br/><span class="small muted">' + esc(l.product_code) + '</span>' : ''}${l.description && l.description !== l.product_name ? '<br/><span class="small muted">' + esc(l.description) + '</span>' : ''}</td>
                <td style="white-space:nowrap;">${esc(l.customer_reference)}</td>
                <td class="right">${fmt(l.qty, 2)} ${esc(l.uqc_code || l.unit)}</td>
                <td class="right">${sym}${fmt(num(l.qty) > 0 ? (num(l.line_total) * erMul) / num(l.qty) : num(l.unit_price) * erMul, 2)}</td>
                <td class="right strong">${sym}${fmt(num(l.line_total) * erMul, 2)}</td>
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
            <td><span class="lbl">Date:</span> ${esc(docDate(inv.invoice_date))}</td>
        </tr>
    </table>

    ${referencesBlock(d)}

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
            <th style="width:32px;">SR NO</th>
            <th style="width:64px;">HSN CODE</th>
            <th style="width:70px;">PART NO</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:150px; white-space:nowrap;">REQUIREMENT #</th>
            <th style="width:74px;">QTY</th>
            <th style="width:86px;">PRICE / UNIT</th>
            <th style="width:100px;">AMOUNT</th>
        </tr>
        ${linesHtml}
        ${num(inv.discount_total) > 0 ? `<tr>
            <td colspan="7" class="right lbl">Subtotal</td>
            <td class="right strong">${sym}${fmt(inv.subtotal, 2)}</td>
        </tr>
        <tr><td colspan="7" class="right lbl">Discount</td><td class="right">− ${sym}${fmt(inv.discount_total, 2)}</td></tr>` : ''}
        ${(num(inv.freight_charges) > 0 || num(inv.insurance_charges) > 0 || num(inv.other_charges) > 0) ? `<tr>
            <td colspan="7" class="right lbl">FOB Value</td>
            <td class="right strong">${sym}${fmt(inv.fob_value, 2)}</td>
        </tr>` : ''}
        ${num(inv.freight_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Freight</td><td class="right">${sym}${fmt(inv.freight_charges, 2)}</td></tr>` : ''}
        ${num(inv.insurance_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Insurance</td><td class="right">${sym}${fmt(inv.insurance_charges, 2)}</td></tr>` : ''}
        ${num(inv.other_charges) > 0 ? `<tr><td colspan="7" class="right lbl">Other</td><td class="right">${sym}${fmt(inv.other_charges, 2)}</td></tr>` : ''}
        <tr>
            <td colspan="7" class="right strong" style="background:#f0f0f0;">TOTAL ${esc(inv.incoterm) || 'CNF'} Amount</td>
            <td class="right strong" style="background:#f0f0f0;">${sym}${fmt(inv.grand_total, 2)}</td>
        </tr>
        <tr>
            <td colspan="7" class="right lbl">Advance Received</td>
            <td class="right">${sym}${fmt(inv.advance_received, 2)}</td>
        </tr>
        <tr>
            <td colspan="7" class="right strong">Balance Receivable</td>
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

    ${cargoTotalsBlock(inv)}

    ${banksHtml}

    ${
        d.invoice?.terms
            ? `<div class="pad avoid-break" style="border:1px solid #222; border-top:none; margin-top: 6px;">
                 <div class="lbl">Terms &amp; Conditions:</div>
                 <div class="small" style="white-space: pre-line">${esc(d.invoice.terms)}</div>
               </div>`
            : ''
    }

    <div class="pad avoid-break" style="border:1px solid #222; border-top:none; margin-top: 6px;">
        <div class="lbl">Declaration:</div>
        <div class="small">${esc(inv.declaration_text || 'We declare that invoice shows the actual price of the goods described and that all particulars are true and correct.')}</div>
    </div>

    <table class="avoid-break" style="margin-top: 6px;">
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
 * RECEIPT VOUCHER — printable acknowledgement of a single customer payment
 * against an invoice (chart step 11). Shows the receipt number, amount
 * received, payment method/reference, and the running balance after this
 * receipt.
 */
function buildReceiptHtml(
    d: RenderData,
    payment: any,
    totalReceived: number
): string {
    const inv = d.invoice || {};
    const c = d.company || {};
    const ca = d.companyAddr || {};
    const sym = esc(inv.currency_symbol || getCurrencySymbol(inv.currency_code) || '');

    const companyLines = [
        ca.address_line1,
        ca.address_line2,
        [ca.city, ca.state].filter(Boolean).join(', '),
        [ca.country, ca.postcode].filter(Boolean).join(' - '),
    ]
        .filter(Boolean)
        .join('<br/>');

    const receivedFrom =
        d.consigneeSnapshot?.name || d.customer?.company_name || '';
    const grand = num(inv.grand_total);
    const balance = grand - totalReceived;
    const methodLabel = (payment.method || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (m: string) => m.toUpperCase());

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>${baseStyles}</style></head>
<body><div class="doc">
    <div class="title">RECEIPT VOUCHER</div>

    <table style="margin-top: 0;">
        <tr>
            <td style="width:60%;">
                <div class="strong">${esc(c.company_name)}</div>
                <div class="small">${companyLines}</div>
                <table class="nob small" style="margin-top: 4px;">
                    <tr><td class="lbl" style="width:70px;">GST No</td><td>${esc(ca.gstin || c.tax_number)}</td></tr>
                </table>
            </td>
            <td>
                <table class="nob">
                    <tr><td class="lbl" style="width:90px;">Receipt No.</td><td class="strong">${esc(payment.receipt_voucher_no || '—')}</td></tr>
                    <tr><td class="lbl">Date</td><td>${esc(docDate(payment.payment_date))}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <td><span class="lbl">Received with thanks from</span><br/>${esc(receivedFrom)}</td>
        </tr>
        <tr>
            <td><span class="lbl">Amount Received</span><br/><span class="strong">${sym}${fmt(payment.amount, 2)}</span></td>
        </tr>
        <tr>
            <td><span class="lbl">Towards Invoice</span><br/>${esc(inv.voucher_no || '(DRAFT)')}${inv.invoice_date ? ' dated ' + esc(docDate(inv.invoice_date)) : ''}</td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <td style="width:25%;"><span class="lbl">Mode</span><br/>${esc(methodLabel || '—')}</td>
            <td style="width:35%;"><span class="lbl">Reference</span><br/>${esc(payment.reference || '—')}</td>
            <td style="width:25%;"><span class="lbl">Received in Bank</span><br/>${esc(payment.bank_name || '—')}</td>
            <td><span class="lbl">Currency</span><br/>${esc(inv.currency_code || '')}</td>
        </tr>
    </table>

    <table style="margin-top: 0;">
        <tr>
            <td class="right lbl" style="width:75%;">Invoice Total</td>
            <td class="right">${sym}${fmt(inv.grand_total, 2)}</td>
        </tr>
        <tr>
            <td class="right lbl">Total Received (incl. this receipt)</td>
            <td class="right">${sym}${fmt(totalReceived, 2)}</td>
        </tr>
        <tr>
            <td class="right strong" style="background:#f0f0f0;">Balance Receivable</td>
            <td class="right strong" style="background:#f0f0f0;">${sym}${fmt(balance, 2)}</td>
        </tr>
    </table>

    ${
        payment.notes
            ? `<div class="pad" style="border:1px solid #222; border-top:none;"><span class="lbl">Notes:</span> ${esc(payment.notes)}</div>`
            : ''
    }

    <table style="margin-top: 18px;">
        <tr>
            <td class="sigbox">
                <div class="small muted">Received the above sum.</div>
            </td>
            <td class="sigbox right">
                <div class="small muted">For, ${esc(c.company_name)}</div>
                <div class="small muted" style="margin-top: 28px;">Authorized Signatory</div>
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
                <td class="center">${esc(l.part_no)}</td>
                <td class="center">${esc(l.hsn_code)}</td>
                <td>${esc(l.product_name)}${l.product_code ? ' (' + esc(l.product_code) + ')' : ''}</td>
                <td class="right">${fmt(l.qty, 2)} ${esc(l.uqc_code || l.unit)}</td>
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
            <td><span class="lbl">Date:</span> ${esc(docDate(inv.invoice_date))}</td>
        </tr>
        ${
            inv.reference_nos || inv.reference_no
                ? `<tr>
            <td colspan="2"><span class="lbl">Reference No.:</span> ${esc(inv.reference_nos || inv.reference_no)}</td>
        </tr>`
                : ''
        }
    </table>

    ${partiesBlock(d, true)}

    ${shippingRouteBlock(d)}

    <table style="margin-top: 0;">
        <tr>
            <th style="width:36px;">SR NO</th>
            <th style="width:70px;">PART NO</th>
            <th style="width:80px;">HSN CODE</th>
            <th>DESCRIPTION OF GOODS</th>
            <th style="width:120px;">QTY / UNIT</th>
            <th style="width:90px;">NO. OF PKGS</th>
            <th style="width:100px;">NET WEIGHT</th>
            <th style="width:100px;">GROSS WEIGHT</th>
        </tr>
        ${linesHtml}
        <tr>
            <td colspan="5" class="right strong" style="background:#f0f0f0;">GRAND TOTAL</td>
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
