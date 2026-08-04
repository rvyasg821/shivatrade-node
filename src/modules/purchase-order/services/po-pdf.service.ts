import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { loadCompanyLogoDataUri } from '@common/pdf/pdf-letterhead.util';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { numberToIndianWords } from '@common/utils/amount-in-words';
import {
    buildDocWorkbook,
    buildExcelFilename,
    curCell,
    textCell,
    DocCell,
    DocSection,
} from '@common/excel-doc/excel-doc.builder';
import {
    escHtml as esc,
    fmt2 as fmt,
    fmt4,
    docDate,
    joinAddress,
    buildTallyFooterTemplate as buildFooterTemplate,
} from '@common/pdf/tally-pdf.util';
import { PurchaseOrderGetResponseDto } from '../dtos/response/purchase-order.get.response.dto';

/**
 * Renders the Sales Order PDF. Header/footer use the shared letterhead
 * (logo + company name/phone/email in the header; address + GSTIN · PAN ·
 * CIN · IEC · website in the footer) so all sales-doc PDFs match.
 */

@Injectable()
export class PoPdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companySettingsRepository: CompanySettingsRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository
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
                top: '8mm',
                right: '8mm',
                bottom: '12mm',
                left: '8mm',
            },
            displayHeaderFooter: true,
            // Tally-style: the company letterhead lives inside the bordered
            // box, not in a running header. Only a centred "computer generated"
            // note repeats in the page footer.
            headerTemplate: '<div></div>',
            footerTemplate: buildFooterTemplate(),
        });
    }

    buildFilename(po: PurchaseOrderGetResponseDto): string {
        const safe = (po.voucher_no || 'PO')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }

    /** Styled Sales Order Excel — mirrors render, reuses buildContext. */
    async renderExcel(
        po: PurchaseOrderGetResponseDto,
        companyId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const ctx = await this.buildContext(po, companyId);
        const sections = buildPoExcelSections(ctx);
        const buffer = buildDocWorkbook({
            sheetName: 'Sales Order',
            // 10 cols mirroring the PDF: Sl | Description | HSN/SAC | Part No |
            // Due on | Quantity | Rate | per | Disc % | Amount.
            sections,
            columnWidths: [5, 30, 12, 12, 12, 12, 14, 8, 8, 16],
        });
        return {
            buffer,
            filename: buildExcelFilename(po.voucher_no || 'SalesOrder'),
        };
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
        let companyState: string | undefined;
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
                companyState = (corp as any).state || undefined;
            }
        } catch {
            // ignore
        }
        if (!companyState && company?.state) companyState = company.state;
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

        // Letterhead logo — from company-settings (same source as the
        // quotation PDF), falling back to the bundled brand logo.
        let logoDataUri = '';
        try {
            const settingsRows: any[] =
                await this.companySettingsRepository.findAll({
                    company_id: companyId,
                } as any);
            const setting =
                (settingsRows || []).find((r) => !r.location_id) ||
                (settingsRows || [])[0];
            logoDataUri = loadCompanyLogoDataUri(setting?.logo_url);
        } catch {
            logoDataUri = loadCompanyLogoDataUri();
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
        // Grand total = Σ per-line DOC-currency selling total, RECOMPUTED from
        // the native fields (not the possibly-stale stored line_total) so it
        // matches the on-screen detail / costing card.
        const linesFobTotal = (po.lines || []).reduce(
            (s, l) => s + lineSellDoc(l).amount,
            0
        );
        // CNF/CFR: the shipment freight carried onto the SO is part of the
        // customer-facing total (matches the header grand_total = FOB + freight).
        const freightTotal = Number((po as any).freight_total) || 0;
        const linesInrTotal = linesFobTotal + freightTotal;

        // ── Bank details — the company bank account (PI-linked, else default) ──
        let bank: BankBlock | null = null;
        try {
            const accts: any[] =
                (await this.companyBankAccountRepository.findByCompanyId(
                    companyId
                )) || [];
            const linkId = (po as any).pfi_bank_account_id;
            const picked =
                (linkId && accts.find((a) => a._id?.toString() === linkId)) ||
                accts.find((a) => a.is_default) ||
                accts[0];
            if (picked) {
                bank = {
                    bank_name: picked.bank_name || '',
                    account_number: picked.account_number || '',
                    ifsc: picked.ifsc || picked.swift_code || '',
                    branch_name: picked.branch_name || '',
                };
            }
        } catch {
            bank = null;
        }

        // State code = first two digits of the GSTIN (GST state-code convention).
        const stateCode =
            companyGstin && /^\d{2}/.test(companyGstin)
                ? companyGstin.slice(0, 2)
                : '';

        // Amount in words — grand total in customer currency, rounded to two
        // decimals to match the printed Grand Total exactly (which prints the
        // unrounded value, e.g. "9.44 $"). Rounding to a whole number here used
        // to drop the fractional part ("Nine Dollars Only" for 9.44).
        // Native model: line_total is already in the document currency, so the
        // total prints as-is (no × exchange_rate).
        const rate = 1;
        const amountInWords = numberToIndianWords(
            Math.round(linesInrTotal * rate * 100) / 100,
            po.currency_code || 'INR'
        );

        return {
            po,
            logoDataUri,
            company: {
                name: company?.company_name || '',
                email: company?.email || '',
                phone: company?.mobile || '',
                iec: company?.iec || '',
                gstin: companyGstin,
                pan: company?.pan || '',
                cin: company?.cin || '',
                website: company?.website || '',
                footer_address: company?.footer_address || '',
                address: companyAddress,
                state: companyState || '',
                stateCode,
                terms: '',
                remarks: company?.default_remarks || '',
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
            bank,
            amountInWords,
            inrTotal: linesInrTotal,
            fobTotal: linesFobTotal,
            freightTotal,
        };
    }
}

// ─── Types ──────────────────────────────────────────────────────────────

interface VendorBlock {
    name: string;
    gstin?: string;
    address?: string;
}

interface BankBlock {
    bank_name: string;
    account_number: string;
    ifsc: string;
    branch_name: string;
}

interface PoPdfContext {
    po: PurchaseOrderGetResponseDto;
    logoDataUri?: string;
    company: {
        name: string;
        email: string;
        phone: string;
        iec?: string;
        gstin?: string;
        pan?: string;
        cin?: string;
        website?: string;
        footer_address?: string;
        address?: string;
        state?: string;
        stateCode?: string;
        terms?: string;
        remarks?: string;
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
    bank: BankBlock | null;
    amountInWords: string;
    inrTotal: number;
    fobTotal: number;
    freightTotal: number;
}

// ─── helpers (shared Tally primitives live in tally-pdf.util) ───────────

// Recompute a line's DOCUMENT-currency selling total from the NATIVE source
// fields (unit_price × cost_exchange_rate + expenses + margin − rebates),
// mirroring the SO recompute engine + the on-screen costing. Used instead of
// the stored `line_total` so the PDF stays correct even for an SO whose stored
// totals are stale (e.g. generated before the multi-currency recompute).
function lineSellDoc(l: any): { amount: number; rate: number } {
    const r2 = (n: number) =>
        Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    const qty = Number(l.qty) || 0;
    const costDoc =
        (Number(l.unit_price) || 0) * (Number(l.cost_exchange_rate) || 1);
    const disc = Number(l.discount_pct) || 0;
    const gross = qty * costDoc;
    const taxable = r2(gross - (gross * disc) / 100);
    let expenses = 0;
    for (const e of l.product_expenses_snapshot || [])
        expenses +=
            String(e?.type).toLowerCase() === 'percent'
                ? (taxable * (Number(e?.value) || 0)) / 100
                : Number(e?.value) || 0;
    expenses = r2(expenses);
    const fobBase = taxable + expenses;
    let rebates = 0;
    for (const r of l.product_rebates_snapshot || [])
        rebates +=
            String(r?.type).toLowerCase() === 'fixed'
                ? Number(r?.pct) || 0
                : (fobBase * (Number(r?.pct) || 0)) / 100;
    rebates = r2(rebates);
    const marginBase = taxable + expenses - rebates;
    const margin = r2((marginBase * (Number(l.margin_pct) || 0)) / 100);
    const amount = r2(taxable + expenses - rebates + margin);
    const rate = qty > 0 ? amount / qty : costDoc;
    return { amount, rate };
}

/**
 * Map the SO PDF context to styled Excel sections — a faithful mirror of
 * buildPoHtml: company block + voucher meta band, Consignee | Buyer band, the
 * full 10-column line table with Total / Freight / Grand Total rows, amount in
 * words, remarks, then the PAN·Declaration | Bank·Signatory footer band.
 */
function buildPoExcelSections(ctx: PoPdfContext): DocSection[] {
    const { po, company, customer, bank, amountInWords, fobTotal, freightTotal } =
        ctx;
    const lines = po.lines || [];
    const sym = po.currency_symbol || po.currency_code || '₹';
    const COLS = 10;
    const pad = (cells: DocCell[]): DocCell[] => {
        const out = cells.slice(0, COLS);
        while (out.length < COLS) out.push(textCell(''));
        return out;
    };

    // ── Company block (left of the top band) ──
    const companyLines: string[] = [];
    if (company.address) companyLines.push(...company.address.split('\n'));
    if (company.gstin) companyLines.push(`GSTIN/UIN: ${company.gstin}`);
    if (company.state)
        companyLines.push(
            `State Name: ${company.state}${company.stateCode ? `, Code: ${company.stateCode}` : ''}`
        );
    if (company.cin) companyLines.push(`CIN: ${company.cin}`);
    if (company.email) companyLines.push(`E-Mail: ${company.email}`);

    // ── Voucher meta grid (right of the top band) ──
    const cs: any = (po as any).consignee_snapshot || {};
    const consigneeCountry = cs.country || '';
    const otherRef =
        (po as any).quotation_voucher_no || (po as any).pfi_voucher_no || '';
    const metaPairs: Array<[string, string]> = [
        ['Voucher No.', po.voucher_no || '-'],
        ['Dated', docDate(po.po_date) || '-'],
    ];
    if ((po as any).reference_no)
        metaPairs.push(['Reference No.', (po as any).reference_no]);
    metaPairs.push(['Lead Ref.', (po as any).lead_voucher_no || '-']);
    metaPairs.push(['Mode/Terms of Payment', po.payment_terms || '-']);
    metaPairs.push([
        "Buyer's Ref./Order No.",
        (po as any).customer_po_number || po.voucher_no || '-',
    ]);
    metaPairs.push(['Other References', otherRef || '-']);
    metaPairs.push(['Dispatched through', (po as any).dispatched_through || '-']);
    metaPairs.push(['Destination', consigneeCountry || '-']);
    metaPairs.push(['Country', consigneeCountry || '-']);
    metaPairs.push(['Terms of Delivery', po.delivery_terms || '-']);

    // ── Consignee (Ship to) | Buyer (Bill to) band ──
    const consigneeName = cs.name || customer.name || '';
    const consigneeAddrLines = [
        cs.address_line1,
        cs.address_line2,
        [cs.city, cs.postcode].filter(Boolean).join(' '),
        cs.country,
    ].filter(Boolean);
    const consigneeLines = consigneeAddrLines.length
        ? [consigneeName, ...consigneeAddrLines]
        : [consigneeName, customer.address || ''].filter(Boolean);
    if (cs.state) consigneeLines.push(`State Name: ${cs.state}`);
    const buyerLines = [customer.name || '-'];
    if (customer.address) buyerLines.push(...customer.address.split('\n'));
    if (customer.phone) buyerLines.push(customer.phone);
    if (customer.email) buyerLines.push(customer.email);

    // ── Line table (10 cols) ──
    const head = [
        'Sl No.',
        'Description of Goods',
        'HSN/SAC',
        'Part No.',
        'Due on',
        'Quantity',
        'Rate',
        'per',
        'Disc. %',
        `Amount (${sym})`,
    ];
    const dueOn = docDate(po.expected_delivery_date) || docDate(po.po_date) || '';
    const rows: DocCell[][] = lines.length
        ? lines.map((l: any, i: number) => {
              const sell = lineSellDoc(l);
              const qty = Number(l.qty) || 0;
              const disc = Number(l.discount_pct) || 0;
              return pad([
                  textCell(i + 1, 'c'),
                  textCell(l.product_name || '-', 'l', { bold: true }),
                  textCell(l.hsn_code || '', 'c'),
                  textCell(l.part_no || '', 'c'),
                  textCell(dueOn, 'c'),
                  textCell(`${fmt(qty)} ${l.unit || ''}`.trim(), 'r'),
                  curCell(sell.rate, sym, 4),
                  textCell(l.unit || '', 'c'),
                  textCell(disc ? `${fmt(disc)} %` : '', 'r'),
                  curCell(sell.amount, sym, 4, { bold: true }),
              ]);
          })
        : [pad([textCell('No line items.', 'c')])];

    // Total / Freight / Grand Total rows (aligned under Quantity + Amount).
    const totalQty = lines.reduce((s: number, l: any) => s + (Number(l.qty) || 0), 0);
    const unitSet = new Set(lines.map((l: any) => l.unit).filter(Boolean));
    const totalUnit = unitSet.size === 1 ? `${[...unitSet][0]}` : '';
    const totalRow = pad([
        textCell(''),
        textCell('Total', 'r', { bold: true }),
        textCell(''),
        textCell(''),
        textCell(''),
        textCell(`${fmt(totalQty)} ${totalUnit}`.trim(), 'r', { bold: true }),
        textCell(''),
        textCell(''),
        textCell(''),
        curCell(fobTotal, sym, 4, { bold: true, fill: 'F3F2F7' }),
    ]);
    totalRow[9].fill = 'F3F2F7';
    rows.push(totalRow);
    if (freightTotal > 0) {
        rows.push(
            pad([
                textCell(''),
                textCell('Freight', 'r'),
                textCell(''),
                textCell(''),
                textCell(''),
                textCell(''),
                textCell(''),
                textCell(''),
                textCell(''),
                curCell(freightTotal, sym, 4),
            ])
        );
    }
    rows.push(
        pad([
            textCell(''),
            textCell('Grand Total', 'r', { bold: true }),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            curCell(fobTotal + freightTotal, sym, 2, {
                bold: true,
                fill: 'FDEBD8',
                color: 'C25E10',
            }),
        ])
    );

    // ── Footer band: PAN·Declaration | Bank·Signatory ──
    const leftFooter: string[] = [];
    if (company.pan) leftFooter.push(`Company's PAN: ${company.pan}`);
    leftFooter.push(
        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'
    );
    const rightFooter: string[] = [];
    if (bank) {
        rightFooter.push(`Bank Name: ${bank.bank_name}`);
        rightFooter.push(`A/c No.: ${bank.account_number}`);
        rightFooter.push(
            `Branch & IFS Code: ${[bank.branch_name, bank.ifsc].filter(Boolean).join(' & ')}`
        );
    }
    rightFooter.push(`for ${company.name || ''}`);
    if (company.signatory) rightFooter.push(company.signatory);
    rightFooter.push('Authorised Signatory');

    const sections: DocSection[] = [
        { kind: 'title', text: 'SALES ORDER', subtitle: company.name },
        {
            kind: 'band',
            left: { label: company.name || 'Seller', lines: companyLines },
            right: { pairs: metaPairs },
        },
        {
            kind: 'band',
            left: { label: 'Consignee (Ship to)', lines: consigneeLines },
            right: { label: 'Buyer (Bill to)', lines: buyerLines },
        },
        { kind: 'spacer' },
        {
            kind: 'table',
            head,
            rows,
            align: ['c', 'l', 'c', 'c', 'c', 'r', 'r', 'c', 'r', 'r'],
        },
        { kind: 'spacer' },
        { kind: 'note', text: `Amount Chargeable (in words): ${amountInWords}`, bold: true },
    ];
    const remarks = (po as any).remarks || company.remarks || '';
    if (remarks) sections.push({ kind: 'note', text: `Remarks: ${remarks}` });
    sections.push({
        kind: 'band',
        left: { label: "Company's PAN & Declaration", lines: leftFooter },
        right: { label: "Company's Bank Details", lines: rightFooter },
    });
    return sections;
}

function buildPoHtml(ctx: PoPdfContext): string {
    const { po, company, customer, bank, amountInWords, inrTotal, fobTotal, freightTotal } = ctx;
    const lines = po.lines || [];

    const sym = po.currency_symbol || po.currency_code || '₹';
    // Native model: line amounts are already in the document currency (each cost
    // was converted source→doc in recompute) — print as-is, no × exchange_rate.
    const rate = 1;
    // The "Total" row is the sum of the Amount column (line items = FOB); the
    // CNF/CFR shipment freight is then added to reach the Grand Total. inrTotal
    // already = FOB + freight.
    const rawFobCcy = fobTotal * rate;
    const freightCcy = freightTotal * rate;
    const rawGrandTotalCcy = inrTotal * rate;
    const grandTotalCcy = rawGrandTotalCcy;

    // Consignee (Ship to) — frozen snapshot; falls back to the buyer.
    const cs: any = (po as any).consignee_snapshot || {};
    const consigneeName = cs.name || customer.name || '';
    const consigneeAddrLines = [
        cs.address_line1,
        cs.address_line2,
        [cs.city, cs.postcode].filter(Boolean).join(' '),
        cs.country,
    ].filter(Boolean);
    const consigneeAddr = consigneeAddrLines.length
        ? consigneeAddrLines.join('\n')
        : customer.address || '';
    const consigneeState = cs.state || '';
    const consigneeCountry = cs.country || '';

    // Right-hand meta cell — small label over a bold value.
    const meta = (label: string, value: any): string =>
        `<div class="ml">${esc(label)}</div><div class="mv">${value == null || value === '' ? '&nbsp;' : esc(value)}</div>`;

    const otherRef =
        (po as any).quotation_voucher_no || (po as any).pfi_voucher_no || '';

    const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const unitSet = new Set(lines.map((l) => l.unit).filter(Boolean));
    const totalUnit = unitSet.size === 1 ? ((`${[...unitSet][0]}` as string)) : '';

    const linesRows = lines.length
        ? lines
              .map((l, i) => {
                  const qty = Number(l.qty) || 0;
                  // Recompute from native fields so a stale stored line_total
                  // can't print the wrong amount (matches the detail page).
                  const sell = lineSellDoc(l);
                  const lineTotalCcy = sell.amount;
                  const rateCcy = sell.rate;
                  const disc = Number(l.discount_pct) || 0;
                  return `
        <tr>
          <td class="c">${i + 1}</td>
          <td class="desc"><b>${esc(l.product_name || '-')}</b></td>
          <td>${esc(l.hsn_code || '')}</td>
          <td>${esc(l.part_no || '')}</td>
          <td class="c nowrap">${docDate(po.expected_delivery_date) || docDate(po.po_date)}</td>
          <td class="num nowrap"><b>${fmt(qty)} ${esc(l.unit || '')}</b></td>
          <td class="num nowrap">${fmt4(rateCcy)} ${esc(sym)}</td>
          <td class="c">${esc(l.unit || '')}</td>
          <td class="num">${disc ? fmt(disc) + ' %' : ''}</td>
          <td class="num nowrap"><b>${fmt4(lineTotalCcy)} ${esc(sym)}</b></td>
        </tr>`;
              })
              .join('')
        : `<tr><td colspan="10" class="c muted" style="padding:16px">No line items.</td></tr>`;

    // Remarks — the SO's own (frozen) remarks block; falls back to the company
    // default for legacy SOs created before the field existed.
    const remarks = (po as any).remarks || company.remarks || '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(po.voucher_no || 'SO')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .title { text-align: center; font-weight: bold; font-size: 13px; margin: 0 0 4px; }
  table.box { width: 100%; border-collapse: collapse; }
  table.box > tbody > tr > td { border: 0.7px solid #000; }
  .inner { width: 100%; height: 100%; border-collapse: collapse; }
  .inner td { border: 0.7px solid #000; }
  td.party { vertical-align: top; padding: 3px 5px; }
  .cap { font-size: 8.3px; }
  .pname { font-weight: bold; font-size: 9.5px; }
  .pline { font-size: 8.7px; line-height: 1.45; white-space: pre-line; }
  td.meta { vertical-align: top; padding: 2px 5px; }
  .ml { font-size: 8px; }
  .mv { font-weight: bold; font-size: 9px; }
  .co-name { font-weight: bold; font-size: 10px; }
  .co-line { font-size: 8.4px; line-height: 1.4; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th, table.items td { border: 0.7px solid #000; padding: 3px 4px; font-size: 8.6px; vertical-align: top; }
  table.items th { font-weight: normal; text-align: center; }
  table.items td.desc { font-size: 9.1px; }
  .num { text-align: right; }
  .c { text-align: center; }
  .nowrap { white-space: nowrap; }
  .muted { color: #555; text-align: center; }
  .items-fill td { height: 70px; }
  .words { padding: 3px 5px; }
  .words b { font-size: 9.5px; }
  .remarks { padding: 3px 5px; font-size: 8.4px; white-space: pre-line; }
  .ital { font-style: italic; }
  .logo { height: 34px; margin-bottom: 2px; }
</style>
</head>
<body>
<div class="title">SALES ORDER</div>

<table class="box">
  <tr>
    <td style="width:50%;padding:0;vertical-align:top">
      <table class="inner">
        <tr><td class="party">
          ${ctx.logoDataUri ? `<img class="logo" src="${ctx.logoDataUri}" />` : ''}
          <div class="co-name">${esc(company.name || '')}</div>
          ${company.address ? `<div class="co-line" style="white-space:pre-line">${esc(company.address)}</div>` : ''}
          ${company.gstin ? `<div class="co-line">GSTIN/UIN: ${esc(company.gstin)}</div>` : ''}
          ${company.state ? `<div class="co-line">State Name : ${esc(company.state)}${company.stateCode ? `, Code : ${esc(company.stateCode)}` : ''}</div>` : ''}
          ${company.cin ? `<div class="co-line">CIN: ${esc(company.cin)}</div>` : ''}
          ${company.email ? `<div class="co-line">E-Mail : ${esc(company.email)}</div>` : ''}
        </td></tr>
        <tr><td class="party" style="height:96px">
          <div class="cap">Consignee (Ship to)</div>
          ${consigneeName ? `<div class="pname">${esc(consigneeName)}</div>` : ''}
          ${consigneeAddr ? `<div class="pline">${esc(consigneeAddr)}</div>` : ''}
          ${consigneeState ? `<div class="co-line">State Name : ${esc(consigneeState)}</div>` : ''}
        </td></tr>
        <tr><td class="party" style="height:80px">
          <div class="cap">Buyer (Bill to)</div>
          ${customer.name ? `<div class="pname">${esc(customer.name)}</div>` : ''}
          ${customer.address ? `<div class="pline">${esc(customer.address)}</div>` : ''}
          ${customer.phone ? `<div class="co-line">${esc(customer.phone)}</div>` : ''}
          ${customer.email ? `<div class="co-line">${esc(customer.email)}</div>` : ''}
        </td></tr>
      </table>
    </td>
    <td style="width:50%;padding:0;vertical-align:top">
      <table class="inner">
        <tr>
          <td class="meta" style="width:50%">${meta('Voucher No.', po.voucher_no)}</td>
          <td class="meta" style="width:50%">${meta('Dated', docDate(po.po_date))}</td>
        </tr>
        ${
            (po as any).reference_no
                ? `<tr>
          <td class="meta" colspan="2">${meta('Reference No.', (po as any).reference_no)}</td>
        </tr>`
                : ''
        }
        <tr>
          <td class="meta">${meta('Lead Ref.', (po as any).lead_voucher_no)}</td>
          <td class="meta">${meta('Mode/Terms of Payment', po.payment_terms)}</td>
        </tr>
        <tr>
          <td class="meta">${meta("Buyer's Ref./Order No.", (po as any).customer_po_number || po.voucher_no)}</td>
          <td class="meta">${meta('Other References', otherRef)}</td>
        </tr>
        <tr>
          <td class="meta">${meta('Dispatched through', (po as any).dispatched_through)}</td>
          <td class="meta">${meta('Destination', consigneeCountry)}</td>
        </tr>
        <tr>
          <td class="meta" colspan="2"><span class="ml">Country: </span><b>${esc(consigneeCountry) || '&nbsp;'}</b></td>
        </tr>
        <tr>
          <td class="meta" colspan="2" style="height:90px;vertical-align:top">${meta('Terms of Delivery', po.delivery_terms)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:22px">Sl<br/>No.</th>
      <th>Description of Goods</th>
      <th style="width:56px">HSN/SAC</th>
      <th style="width:46px">Part No.</th>
      <th style="width:52px">Due on</th>
      <th style="width:72px">Quantity</th>
      <th style="width:62px">Rate</th>
      <th style="width:26px">per</th>
      <th style="width:38px">Disc. %</th>
      <th style="width:80px">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${linesRows}
    <tr class="items-fill"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr>
      <td></td>
      <td class="num"><b>Total</b></td>
      <td></td><td></td><td></td>
      <td class="num nowrap"><b>${fmt(totalQty)} ${esc(totalUnit)}</b></td>
      <td></td><td></td><td></td>
      <td class="num nowrap"><b>${fmt4(rawFobCcy)} ${esc(sym)}</b></td>
    </tr>
    ${
        freightTotal > 0
            ? `<tr>
      <td></td>
      <td class="num">Freight</td>
      <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      <td class="num nowrap">${fmt4(freightCcy)} ${esc(sym)}</td>
    </tr>`
            : ''
    }
    <tr>
      <td></td>
      <td class="num"><b>Grand Total</b></td>
      <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      <td class="num nowrap"><b>${fmt(grandTotalCcy)} ${esc(sym)}</b></td>
    </tr>
  </tbody>
</table>

<table class="box" style="border-top:none">
  <tr><td class="words">
    <span class="cap">Amount Chargeable (in words)</span>
    <span style="float:right" class="ital">E. &amp; O.E</span>
    <div style="clear:both"><b>${esc(amountInWords)}</b></div>
  </td></tr>
  ${remarks ? `<tr><td class="remarks"><span class="ital">Remarks:</span><br/>${esc(remarks)}</td></tr>` : ''}
  <tr>
    <td style="padding:0">
      <table class="inner"><tr>
        <td style="width:55%;vertical-align:top;padding:3px 5px">
          ${company.pan ? `<div class="co-line">Company's PAN : <b>${esc(company.pan)}</b></div>` : ''}
          <div class="cap" style="margin-top:4px;text-decoration:underline">Declaration</div>
          <div class="co-line">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
        </td>
        <td style="width:45%;vertical-align:top;padding:3px 5px">
          ${
              bank
                  ? `<div class="cap" style="margin-bottom:2px">Company's Bank Details</div>
                     <div class="co-line">Bank Name : <b>${esc(bank.bank_name)}</b></div>
                     <div class="co-line">A/c No. : <b>${esc(bank.account_number)}</b></div>
                     <div class="co-line">Branch &amp; IFS Code : <b>${esc([bank.branch_name, bank.ifsc].filter(Boolean).join(' & '))}</b></div>`
                  : ''
          }
          <div style="text-align:right;margin-top:12px" class="co-line">for <b>${esc(company.name || '')}</b></div>
          <div style="height:34px"></div>
          <div style="text-align:right" class="co-line">${company.signatory ? `<b>${esc(company.signatory)}</b><br/>` : ''}Authorised Signatory</div>
        </td>
      </tr></table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
