import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import {
    buildPdfLetterhead,
    buildPdfHeaderTemplate,
    buildPdfFooterTemplate,
    loadCompanyLogoDataUri,
} from '@common/pdf/pdf-letterhead.util';
import {
    escHtml as esc,
    fmt2 as fmt,
    docDate,
    joinAddress,
    buildTallyFooterTemplate,
} from '@common/pdf/tally-pdf.util';
import { numberToIndianWords } from '@common/utils/amount-in-words';
import {
    buildDocWorkbook,
    buildExcelFilename,
    curCell,
    moneyCell,
    textCell,
    DocCell,
    DocSection,
} from '@common/excel-doc/excel-doc.builder';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import {
    PoVendorGetResponseDto,
    PoVendorPaymentResponseDto,
} from '../dtos/response/po-vendor.get.response.dto';

/**
 * Renders the POV (PO Vendor / dispatch advice) PDF. Header/footer use the
 * shared letterhead (logo + company name/phone/email in the header; address
 * + GSTIN · PAN · CIN · IEC · website in the footer) so all sales/purchase
 * doc PDFs match.
 */

@Injectable()
export class PoVendorPdfService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companySettingsRepository: CompanySettingsRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly productRepository: ProductRepository
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
                top: '8mm',
                right: '8mm',
                bottom: '12mm',
                left: '8mm',
            },
            displayHeaderFooter: true,
            // Tally-style: the company letterhead lives inside the bordered
            // box, not in a running header. Only a centred "computer
            // generated" note repeats in the page footer.
            headerTemplate: '<div></div>',
            footerTemplate: buildTallyFooterTemplate(),
        });
    }

    buildFilename(pov: PoVendorGetResponseDto): string {
        const safe = (pov.voucher_no || 'POV')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }

    /**
     * Styled single-document Excel mirroring the POV PDF. Reuses the SAME
     * `buildContext` fetch/derive path as `render`, then maps to DocSection[]
     * for the shared workbook builder (build plan §5/§7.2 — no re-query).
     */
    async renderExcel(
        pov: PoVendorGetResponseDto,
        companyId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const ctx = await this.buildContext(pov, companyId);
        const sections = buildPovExcelSections(ctx);
        const buffer = buildDocWorkbook({
            sheetName: 'Vendor PO',
            // 11 cols: Sl | Description | Part No | HSN/SAC | Due on | Quantity
            // | Rate | per | Disc % | GST % | Amount.
            sections,
            columnWidths: [5, 26, 11, 11, 11, 12, 12, 7, 8, 8, 15],
        });
        return {
            buffer,
            filename: buildExcelFilename(pov.voucher_no || 'VendorPO'),
        };
    }

    /** Printable Payment Voucher (STIPL/PV/…) for a single vendor payment. */
    async renderPayment(
        pov: PoVendorGetResponseDto,
        payment: PoVendorPaymentResponseDto,
        companyId: string
    ): Promise<Buffer> {
        const ctx = await this.buildContext(pov, companyId);
        const html = buildPaymentVoucherHtml(ctx, payment);
        return this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '18mm',
                right: '12mm',
                bottom: '18mm',
                left: '12mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildPaymentHeaderTemplate(ctx, payment),
            footerTemplate: buildPaymentFooterTemplate(ctx),
        });
    }

    buildPaymentFilename(payment: PoVendorPaymentResponseDto): string {
        const safe = (payment.payment_voucher_no || 'PV')
            .replace(/[\\/]+/g, '-')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return `${safe}.pdf`;
    }

    /** Styled Excel of a single Payment Voucher — mirrors renderPayment. */
    async renderPaymentExcel(
        pov: PoVendorGetResponseDto,
        payment: PoVendorPaymentResponseDto,
        companyId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const ctx = await this.buildContext(pov, companyId);
        const sections = buildPaymentExcelSections(ctx, payment);
        const buffer = buildDocWorkbook({
            sheetName: 'Payment Voucher',
            sections,
            columnWidths: [30, 22, 16, 16, 16, 18],
        });
        return {
            buffer,
            filename: buildExcelFilename(
                payment.payment_voucher_no || 'PaymentVoucher'
            ),
        };
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
            /* graceful */
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

        // Letterhead logo — from company-settings (same source as the other
        // sales/purchase PDFs), falling back to the bundled brand logo.
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

        // Vendor address (preferred → vendor_address_id; fallback → default).
        let vendorAddress: string | undefined;
        let vendorGstin: string | undefined;
        let vendorState: string | undefined;
        if (pov.vendor_id) {
            try {
                // `soft_delete: false` matters: editing a vendor address
                // soft-deletes the old row and inserts a new one, so the id the
                // POV snapshotted may point at a dead row. Without this we'd
                // "find" it, skip the live-address fallback below, and print a
                // stale/blank GSTIN (then wrongly fall back to vendor.gstin).
                const addr = pov.vendor_address_id
                    ? await this.vendorAddressRepository.findOne({
                          _id: pov.vendor_address_id,
                          soft_delete: false,
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
                    vendorState = a.state || undefined;
                }
            } catch {
                /* graceful */
            }

            // The GSTIN entered on the vendor form (step 1) lives on the vendor
            // entity, not the address row. Fall back to it so inter/intra-state
            // GST is decided correctly even when the address has no GSTIN.
            if (!vendorGstin || !vendorState) {
                try {
                    const v: any = await this.vendorRepository.findOne({
                        _id: pov.vendor_id,
                    } as any);
                    if (v) {
                        if (!vendorGstin && v.gstin) vendorGstin = v.gstin;
                        if (!vendorState && v.state) vendorState = v.state;
                    }
                } catch {
                    /* graceful */
                }
            }
        }

        // GST state code = first two digits of the GSTIN (GST convention).
        const stateCode =
            companyGstin && /^\d{2}/.test(companyGstin)
                ? companyGstin.slice(0, 2)
                : '';
        const vendorStateCode =
            vendorGstin && /^\d{2}/.test(vendorGstin)
                ? vendorGstin.slice(0, 2)
                : '';

        const linesInrTotal = (pov.lines || []).reduce(
            (s, l) => s + (Number((l as any).line_total) || 0),
            0
        );

        // Vendor charges snapshot (Packing, Transport, etc.) on the POV.
        // Per-row `amount` is server-computed at save time and stored.
        const expensesSnapshot: Array<{
            name: string;
            hsn_code?: string;
            type: string;
            value: string;
            amount: string;
            gst_pct?: string;
        }> = Array.isArray((pov as any).expenses_snapshot)
            ? (pov as any).expenses_snapshot
            : [];
        const chargesInrTotal = expensesSnapshot.reduce(
            (s, e) => s + (Number(e.amount) || 0),
            0
        );
        // GST is an Indian (INR) tax — it never applies to a POV priced in a
        // foreign currency, so no CGST/SGST/IGST is printed there.
        const gstApplies = ((pov as any).currency_code || 'INR') === 'INR';
        // Per-charge GST (operator-entered gst_pct on each charge). Charges are
        // now taxed by their own rate — not folded into the goods GST.
        const chargeGstInrTotal = gstApplies
            ? expensesSnapshot.reduce(
                  (s, e) =>
                      s +
                      ((Number(e.amount) || 0) * (Number(e.gst_pct) || 0)) /
                          100,
                  0
              )
            : 0;

        // GST on the goods lines (charges carry their own GST above).
        const productIds = Array.from(
            new Set(
                (pov.lines || [])
                    .map((l: any) => l.product_id?.toString())
                    .filter(Boolean)
            )
        );
        // Per-line GST (line's tax_pct snapshot, product master as fallback),
        // grouped into HSN/rate buckets so the PDF can print a detailed GST
        // table. Goods-only — charge GST is handled per charge (gross rows).
        const taxByProduct = new Map<string, number>();
        if (productIds.length) {
            try {
                const products: any[] = await this.productRepository.findAll({
                    _id: { $in: productIds },
                } as any);
                for (const pr of products) {
                    taxByProduct.set(
                        pr._id.toString(),
                        Number(pr.tax_pct) || 0
                    );
                }
            } catch {
                /* graceful — empty tax map, GST falls back to 0 */
            }
        }
        let gstInrTotal = 0;
        const gstBucketMap = new Map<
            string,
            { hsn: string; rate: number; taxable: number; gst: number }
        >();
        for (const l of pov.lines || []) {
            if (!gstApplies) break; // foreign-currency POV → no GST buckets
            const pid = (l as any).product_id?.toString();
            const lineTotal = Number((l as any).line_total) || 0;
            const rate =
                Number((l as any).tax_pct) || taxByProduct.get(pid) || 0;
            if (rate <= 0) continue;
            const taxable = lineTotal;
            const gst = (taxable * rate) / 100;
            gstInrTotal += gst;
            const hsn = (l as any).hsn_code || '-';
            const key = `${hsn}|${rate}`;
            const b = gstBucketMap.get(key) || {
                hsn,
                rate,
                taxable: 0,
                gst: 0,
            };
            b.taxable += taxable;
            b.gst += gst;
            gstBucketMap.set(key, b);
        }
        const gstBuckets = Array.from(gstBucketMap.values()).sort(
            (a, b) => a.rate - b.rate
        );

        // Expense charges grouped into their OWN HSN/SAC + rate buckets, mirroring
        // the goods GST summary — each charge is taxed by its per-charge gst_pct
        // against its expense HSN/SAC code (independent of the product HSN).
        const expenseGstBucketMap = new Map<
            string,
            { hsn: string; rate: number; taxable: number; gst: number }
        >();
        if (gstApplies) {
            for (const e of expensesSnapshot) {
                const rate = Number((e as any).gst_pct) || 0;
                if (rate <= 0) continue;
                const taxable = Number(e.amount) || 0;
                const gst = (taxable * rate) / 100;
                const hsn = (e as any).hsn_code || '-';
                const key = `${hsn}|${rate}`;
                const b = expenseGstBucketMap.get(key) || {
                    hsn,
                    rate,
                    taxable: 0,
                    gst: 0,
                };
                b.taxable += taxable;
                b.gst += gst;
                expenseGstBucketMap.set(key, b);
            }
        }
        const expenseGstBuckets = Array.from(
            expenseGstBucketMap.values()
        ).sort((a, b) => a.rate - b.rate);

        return {
            pov,
            logoDataUri,
            company: {
                name: company?.company_name || '',
                email: company?.email || '',
                phone: company?.mobile || '',
                gstin: companyGstin,
                iec: company?.iec || '',
                pan: company?.pan || '',
                cin: company?.cin || '',
                website: company?.website || '',
                footer_address: company?.footer_address || '',
                address: companyAddress,
                state: companyState || '',
                stateCode,
                remarks:
                    company?.pov_default_remarks ||
                    company?.default_remarks ||
                    '',
                dispatched_through:
                    company?.pov_default_dispatched_through || '',
                payment_terms: company?.pov_default_payment_terms || '',
                delivery_terms: company?.pov_default_delivery_terms || '',
                signatory: company?.authorised_signatory_name || '',
            },
            consignee: {
                name: company?.company_name || '',
                address: pov.delivery_address || companyAddress || '',
                gstin: companyGstin,
                state: companyState || '',
            },
            vendor: {
                name: pov.vendor_name || '',
                code: pov.vendor_code || '',
                contact_name: pov.vendor_contact_name || '',
                email: pov.vendor_contact_email || '',
                phone: pov.vendor_contact_phone || '',
                gstin: vendorGstin,
                address: vendorAddress,
                state: vendorState || '',
                stateCode: vendorStateCode,
            },
            inrTotal: linesInrTotal,
            gstInrTotal,
            gstBuckets,
            expenseGstBuckets,
            chargesInrTotal,
            chargeGstInrTotal,
            expensesSnapshot,
        };
    }
}

// ─── types ──────────────────────────────────────────────────────────────

interface PovPdfContext {
    pov: PoVendorGetResponseDto;
    logoDataUri?: string;
    company: {
        name: string;
        email: string;
        phone: string;
        gstin?: string;
        iec?: string;
        pan?: string;
        cin?: string;
        website?: string;
        footer_address?: string;
        address?: string;
        state?: string;
        stateCode?: string;
        remarks?: string;
        /** Company-level fallbacks for a POV that carries no terms of its own. */
        dispatched_through?: string;
        payment_terms?: string;
        delivery_terms?: string;
        signatory?: string;
    };
    consignee: {
        name: string;
        address?: string;
        gstin?: string;
        state?: string;
    };
    vendor: {
        name: string;
        code?: string;
        contact_name?: string;
        email?: string;
        phone?: string;
        gstin?: string;
        address?: string;
        state?: string;
        stateCode?: string;
    };
    inrTotal: number;
    gstInrTotal: number;
    gstBuckets: Array<{
        hsn: string;
        rate: number;
        taxable: number;
        gst: number;
    }>;
    expenseGstBuckets: Array<{
        hsn: string;
        rate: number;
        taxable: number;
        gst: number;
    }>;
    chargesInrTotal: number;
    chargeGstInrTotal: number;
    expensesSnapshot: Array<{
        name: string;
        hsn_code?: string;
        type: string;
        value: string;
        amount: string;
        gst_pct?: string;
    }>;
}

// ─── helpers (shared Tally primitives live in tally-pdf.util) ───────────

const ccyMoney = (sym: string, v: any): string => `${sym}${fmt(v)}`;

/** DD-MM-YYYY, same as every other printed document. Was the raw ISO slice. */
const dateOnly = (v?: string | null): string => (v ? esc(docDate(v)) : '');

// Footer identity line — GSTIN · PAN · CIN · IEC · website.
function buildFooterIdLine(ctx: PovPdfContext): string {
    return [
        ctx.company.gstin ? `GSTIN: ${ctx.company.gstin}` : '',
        ctx.company.pan ? `PAN: ${ctx.company.pan}` : '',
        ctx.company.cin ? `CIN: ${ctx.company.cin}` : '',
        ctx.company.iec ? `IEC: ${ctx.company.iec}` : '',
        ctx.company.website || '',
    ]
        .filter(Boolean)
        .join('  ·  ');
}

// ─── Payment voucher (STIPL/PV/…) ───────────────────────────────────────

function buildPaymentHeaderTemplate(
    ctx: PovPdfContext,
    payment: PoVendorPaymentResponseDto
): string {
    return buildPdfHeaderTemplate({
        companyName: ctx.company.name,
        docLabel: 'PAYMENT VOUCHER',
        voucherNo: payment.payment_voucher_no || '',
    });
}

function buildPaymentFooterTemplate(ctx: PovPdfContext): string {
    return buildPdfFooterTemplate({
        voucherNo: ctx.pov.voucher_no || '',
        addressLine: ctx.company.footer_address || '',
        idLine: buildFooterIdLine(ctx),
    });
}

/** Map the payment-voucher context to styled Excel sections — mirrors the PDF. */
function buildPaymentExcelSections(
    ctx: PovPdfContext,
    payment: PoVendorPaymentResponseDto
): DocSection[] {
    const { pov, company, vendor } = ctx;
    const code = pov.currency_code || 'INR';
    const sym = pov.currency_symbol || code || '₹';
    const voided = !!payment.voided_at;

    // Company (header) block.
    const companyLines: string[] = [];
    if (company.phone) companyLines.push(company.phone);
    if (company.email) companyLines.push(company.email);

    // PAID TO block — vendor.
    const paidToLines = [vendor.name || '-'];
    if (vendor.code) paidToLines.push(`Vendor Code: ${vendor.code}`);
    if (vendor.address)
        paidToLines.push(...String(vendor.address).split('\n'));
    if (vendor.state && !vendor.address) paidToLines.push(vendor.state);
    if (vendor.gstin) paidToLines.push(`GSTIN: ${vendor.gstin}`);

    // PAYMENT DETAILS rows.
    const bankSnap: any = payment.company_bank_snapshot || null;
    const detailPairs: Array<[string, string]> = [
        ['Vendor PO', pov.voucher_no || '-'],
        ['Vendor Invoice No.', payment.invoice_number || '-'],
        ['Payment Date', dateOnly(payment.payment_date) || '-'],
        [
            'Paid From (Bank)',
            bankSnap?.bank_name
                ? `${bankSnap.bank_name}${bankSnap.account_number ? ' — A/c ' + bankSnap.account_number : ''}`
                : '-',
        ],
        ['Notes', payment.notes || '-'],
    ];

    // Summary — Order Value / Total Paid / (TDS · Net) / Balance Payable.
    const povTdsTotal = (pov.payments || [])
        .filter((pp: any) => !pp.voided_at)
        .reduce((s: number, pp: any) => s + Number(pp.tds_amount || 0), 0);
    const grossPaid = Number(pov.amount_paid || 0);
    const netCashPaid = Math.round((grossPaid - povTdsTotal) * 100) / 100;

    const sumCell = (label: string, value: number, opts?: { bold?: boolean; fill?: string; color?: string }): DocCell[] => [
        textCell(label, 'r', { bold: opts?.bold }),
        curCell(value, sym, 2, opts),
    ];
    const summaryRows: DocCell[][] = [
        sumCell('Order Value (Payable)', Number(pov.order_value || 0)),
    ];
    if (povTdsTotal > 0) {
        summaryRows.push(sumCell('Total Paid (Gross)', grossPaid));
        summaryRows.push(sumCell('TDS Deducted', -povTdsTotal));
        summaryRows.push(sumCell('Net Cash Paid', netCashPaid));
    } else {
        summaryRows.push(sumCell('Total Paid', grossPaid));
    }
    summaryRows.push(
        sumCell('Balance Payable', Number(pov.balance_payable || 0), {
            bold: true,
            fill: 'FDEBD8',
            color: 'C25E10',
        })
    );

    const sections: DocSection[] = [
        {
            kind: 'title',
            text: 'PAYMENT VOUCHER',
            subtitle: `${payment.payment_voucher_no || ''}${voided ? '  —  VOIDED' : '  —  PAID'}`,
        },
        {
            kind: 'band',
            left: { label: company.name || 'Company', lines: companyLines },
            right: {
                pairs: [
                    ['Voucher No.', payment.payment_voucher_no || '-'],
                    ['Status', voided ? 'VOIDED' : 'PAID'],
                    ['Currency', code],
                ],
            },
        },
    ];
    if (voided)
        sections.push({
            kind: 'note',
            text: `VOIDED — ${payment.voided_reason || 'this payment has been voided'}`,
            bold: true,
        });
    sections.push({ kind: 'party', label: 'Paid To', lines: paidToLines });
    sections.push({ kind: 'note', text: 'PAYMENT DETAILS', bold: true });
    sections.push({ kind: 'kv', pairs: detailPairs });
    sections.push({ kind: 'spacer' });

    // AMOUNT PAID box — one emphasised table row.
    sections.push({
        kind: 'table',
        head: ['AMOUNT PAID', `(${code})`],
        rows: [
            [
                textCell('AMOUNT PAID', 'l', { bold: true }),
                curCell(Number(payment.amount || 0), sym, 2, {
                    bold: true,
                    fill: 'FDEBD8',
                    color: 'C25E10',
                }),
            ],
        ],
        align: ['l', 'r'],
    });
    if (Number(payment.tds_amount || 0) > 0) {
        const secLabel =
            'TDS' +
            (payment.tds_section
                ? ` (${payment.tds_section}${Number(payment.tds_rate_pct || 0) > 0 ? ' @ ' + payment.tds_rate_pct + '%' : ''})`
                : '');
        summaryRows.unshift(
            sumCell(
                'Net Paid (this voucher)',
                Number(payment.amount || 0) - Number(payment.tds_amount || 0)
            )
        );
        summaryRows.unshift(sumCell(secLabel, -Number(payment.tds_amount || 0)));
        summaryRows.unshift(
            sumCell('Gross Amount (this voucher)', Number(payment.amount || 0))
        );
    }

    sections.push({ kind: 'spacer' });
    sections.push({
        kind: 'table',
        head: ['Summary', `Amount (${sym})`],
        rows: summaryRows,
        align: ['r', 'r'],
    });
    sections.push({ kind: 'spacer' });
    // Signature blocks.
    sections.push({
        kind: 'band',
        left: { label: '', lines: ['', 'Receiver Signature'] },
        right: {
            label: '',
            lines: [
                `for ${company.name || ''}`,
                '',
                company.signatory || '',
                'Authorised Signature',
            ].filter((l, i) => l !== '' || i === 1),
        },
    });
    sections.push({
        kind: 'band',
        left: { label: '', lines: ['', 'Checked by'] },
        right: { label: '', lines: ['', 'Verified by'] },
    });
    return sections;
}

function buildPaymentVoucherHtml(
    ctx: PovPdfContext,
    payment: PoVendorPaymentResponseDto
): string {
    const { pov, company, vendor } = ctx;
    const voided = !!payment.voided_at;
    const letterhead = buildPdfLetterhead(
        {
            logoDataUri: ctx.logoDataUri,
            name: company.name,
            phone: company.phone,
            email: company.email,
        },
        {
            title: 'Payment Voucher',
            voucherNo: payment.payment_voucher_no || '-',
            statusBadge: voided ? 'VOIDED' : 'PAID',
        }
    );
    const sym = pov.currency_symbol || pov.currency_code || '₹';
    // NATIVE model (plan §6.3): the payment amount is recorded in the POV's own
    // currency and stored as-entered, so it prints as-is — no conversion.
    const ccy = (v: any): string => ccyMoney(sym, Number(v) || 0);

    const detailRows: Array<[string, string]> = [
        ['Vendor PO', esc(pov.voucher_no || '-')],
        ['Vendor Invoice No.', esc(payment.invoice_number || '-')],
        ['Payment Date', dateOnly(payment.payment_date) || '-'],
    ];

    // Paying company bank account (#7) — snapshot frozen at payment time.
    const bankSnap: any = payment.company_bank_snapshot || null;
    if (bankSnap?.bank_name) {
        detailRows.push([
            'Paid From (Bank)',
            esc(
                `${bankSnap.bank_name}${
                    bankSnap.account_number
                        ? ' — A/c ' + bankSnap.account_number
                        : ''
                }`
            ),
        ]);
    }

    // Operator's payment note — always shown as a details row (dash when blank).
    detailRows.push(['Notes', esc(payment.notes || '-')]);

    // TDS (#7): Gross (amount) → TDS → Net paid. Shown only when deducted.
    const hasTds = Number(payment.tds_amount || 0) > 0;
    const tdsBlock = hasTds
        ? `<div class="summary" style="margin-top:16px; width:60%; margin-left:auto;">
    <table>
      <tr><td class="k">Gross Amount</td><td class="v">${ccy(
          payment.amount || 0
      )}</td></tr>
      <tr><td class="k">TDS${
          payment.tds_section
              ? ` (${esc(payment.tds_section)}${
                    Number(payment.tds_rate_pct || 0) > 0
                        ? ' @ ' + esc(String(payment.tds_rate_pct)) + '%'
                        : ''
                })`
              : ''
      }</td><td class="v">− ${ccy(payment.tds_amount || 0)}</td></tr>
    </table>
  </div>`
        : '';

    // POV-level TDS total across all non-voided payments (the summary is the
    // vendor's running account, so these are aggregates — not this one payment).
    const povTdsTotal = (pov.payments || [])
        .filter((pp: any) => !pp.voided_at)
        .reduce((s: number, pp: any) => s + Number(pp.tds_amount || 0), 0);
    const grossPaid = Number(pov.amount_paid || 0);
    const netCashPaid = Math.round((grossPaid - povTdsTotal) * 100) / 100;

    // Gross settles the vendor (balance uses gross). When any TDS was deducted,
    // spell out TDS → Net cash so the total reconciles with the Net Paid box.
    const summaryRows: Array<[string, string]> = povTdsTotal > 0
        ? [
              ['Order Value (Payable)', ccy(pov.order_value || 0)],
              ['Total Paid (Gross)', ccy(grossPaid)],
              ['TDS Deducted', `− ${ccy(povTdsTotal)}`],
              ['Net Cash Paid', ccy(netCashPaid)],
              ['Balance Payable', ccy(pov.balance_payable || 0)],
          ]
        : [
              ['Order Value (Payable)', ccy(pov.order_value || 0)],
              ['Total Paid', ccy(pov.amount_paid || 0)],
              ['Balance Payable', ccy(pov.balance_payable || 0)],
          ];

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(payment.payment_voucher_no || 'PV')}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5px; color: #1f2937; margin: 0; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc { width: 100%; }
  .section { margin-top: 16px; }
  .label { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
  .party { white-space: pre-line; line-height: 1.5; }
  .party .nm { font-weight: 700; font-size: 11.5px; color: #111827; }
  table.kv { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.kv td { padding: 7px 10px; border: 1px solid #e5e7eb; }
  table.kv td.k { width: 38%; background: #f9fafb; font-weight: 600; color: #374151; }
  .amount-box {
    margin-top: 18px; border: 1.5px solid #111827; border-radius: 8px;
    padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
  }
  .amount-box .lbl { font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #374151; }
  .amount-box .val { font-size: 20px; font-weight: 800; color: #111827; }
  .summary { margin-top: 18px; width: 60%; margin-left: auto; }
  .summary table { width: 100%; border-collapse: collapse; }
  .summary td { padding: 6px 10px; }
  .summary td.k { color: #6b7280; }
  .summary td.v { text-align: right; font-weight: 600; }
  .summary tr.grand td { border-top: 1px solid #d1d5db; font-weight: 800; color: #111827; }
  .voided-banner {
    margin-top: 14px; padding: 8px 14px; border: 1px solid #fecaca; background: #fef2f2;
    color: #b91c1c; font-weight: 700; border-radius: 6px; text-align: center; letter-spacing: 1px;
  }
  /* Signature block layout uses INLINE styles on a table (below) so it never
     depends on class-CSS reaching this PDF renderer. */
</style>
</head>
<body>
<div class="doc">
  ${letterhead}

  ${
      voided
          ? `<div class="voided-banner">VOIDED — ${esc(
                payment.voided_reason || 'this payment has been voided'
            )}</div>`
          : ''
  }

  <div class="section">
    <div class="label">Paid To</div>
    <div class="party"><span class="nm">${esc(vendor.name || '-')}</span>${
        vendor.code ? `\nVendor Code: ${esc(vendor.code)}` : ''
    }${vendor.address ? `\n${esc(vendor.address)}` : ''}${
        vendor.gstin ? `\nGSTIN: ${esc(vendor.gstin)}` : ''
    }</div>
  </div>

  <div class="section">
    <div class="label">Payment Details</div>
    <table class="kv">
      ${detailRows
          .map(
              ([k, v]) =>
                  `<tr><td class="k">${k}</td><td>${v}</td></tr>`
          )
          .join('')}
    </table>
  </div>

  ${tdsBlock}

  <div class="amount-box">
    <span class="lbl">${hasTds ? 'Net Paid to Vendor' : 'Amount Paid'}</span>
    <span class="val">${ccy(
        hasTds ? payment.net_paid || 0 : payment.amount || 0
    )}</span>
  </div>

  <div class="summary">
    <table>
      ${summaryRows
          .map(
              ([k, v], i) =>
                  `<tr class="${
                      i === summaryRows.length - 1 ? 'grand' : ''
                  }"><td class="k">${k}</td><td class="v">${v}</td></tr>`
          )
          .join('')}
    </table>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:28px;">
    <tr>
      <td style="width:45%;vertical-align:top;text-align:center;color:#374151;">
        <div style="border-top:1px solid #9ca3af;margin-top:44px;padding-top:4px;min-height:34px;">Receiver Signature</div>
        <div style="border-top:1px solid #9ca3af;margin-top:44px;padding-top:4px;">Checked by</div>
      </td>
      <td style="width:10%;">&nbsp;</td>
      <td style="width:45%;vertical-align:top;text-align:center;color:#374151;">
        <div style="border-top:1px solid #9ca3af;margin-top:44px;padding-top:4px;min-height:34px;">${
            company.signatory
                ? `<b>${esc(company.signatory)}</b><br/>`
                : ''
        }Authorised Signature</div>
        <div style="border-top:1px solid #9ca3af;margin-top:44px;padding-top:4px;">Verified by</div>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
}

// GST state codes by state name — used to resolve intra/inter-state when a
// party has a valid state name but no usable GSTIN (or vice-versa).
const GST_STATE_CODE_BY_NAME: Record<string, string> = {
    'jammu and kashmir': '01',
    'jammu & kashmir': '01',
    'himachal pradesh': '02',
    punjab: '03',
    chandigarh: '04',
    uttarakhand: '05',
    haryana: '06',
    delhi: '07',
    rajasthan: '08',
    'uttar pradesh': '09',
    bihar: '10',
    sikkim: '11',
    'arunachal pradesh': '12',
    nagaland: '13',
    manipur: '14',
    mizoram: '15',
    tripura: '16',
    meghalaya: '17',
    assam: '18',
    'west bengal': '19',
    jharkhand: '20',
    odisha: '21',
    orissa: '21',
    chhattisgarh: '22',
    'madhya pradesh': '23',
    gujarat: '24',
    'daman and diu': '25',
    'dadra and nagar haveli': '26',
    maharashtra: '27',
    karnataka: '29',
    goa: '30',
    lakshadweep: '31',
    kerala: '32',
    'tamil nadu': '33',
    puducherry: '34',
    pondicherry: '34',
    'andaman and nicobar islands': '35',
    telangana: '36',
    'andhra pradesh': '37',
    ladakh: '38',
};

// A party's GST state code: first 2 digits of a valid GSTIN, else the state
// name mapped to its code. Returns undefined when neither resolves.
function gstStateCode(gstin?: string, stateName?: string): string | undefined {
    if (gstin && /^\d{2}/.test(gstin)) return gstin.slice(0, 2);
    const key = (stateName || '').trim().toLowerCase();
    return GST_STATE_CODE_BY_NAME[key];
}

/**
 * Map the SAME POV PDF context to styled Excel sections. Mirrors buildPovHtml's
 * layout (Supplier block + voucher meta → line table → tax summary + grand
 * total → amount in words), reusing its money chain so figures match the PDF.
 */
function buildPovExcelSections(ctx: PovPdfContext): DocSection[] {
    const {
        pov,
        company,
        consignee,
        vendor,
        inrTotal,
        gstInrTotal,
        gstBuckets,
        chargesInrTotal,
        chargeGstInrTotal,
        expensesSnapshot,
    } = ctx;

    const interState = (() => {
        const cc = gstStateCode(company.gstin, company.state);
        const vc = gstStateCode(vendor.gstin, vendor.state);
        if (cc && vc) return cc !== vc;
        return false;
    })();
    const lines = pov.lines || [];
    const code = pov.currency_code || 'INR';
    const sym = pov.currency_symbol || code || '₹';
    const gstApplies = code === 'INR';
    const COLS = 11;
    const pad = (cells: DocCell[]): DocCell[] => {
        const out = cells.slice(0, COLS);
        while (out.length < COLS) out.push(textCell(''));
        return out;
    };

    // Money chain (native, rate = 1) — same as the PDF.
    const subtotal = inrTotal;
    const charges = chargesInrTotal;
    const gstTotal = gstInrTotal;
    const chargeGst = chargeGstInrTotal;
    const inputGst = gstTotal + chargeGst;
    const cgst = inputGst / 2;
    const sgst = inputGst - cgst;
    const grandRaw = subtotal + charges + gstTotal + chargeGst;
    const grand = Math.round(grandRaw);
    const roundOff = grand - grandRaw;
    const amountInWords = numberToIndianWords(grand, code);

    const orderDate = pov.dispatch_date || pov.createdAt || '';
    const dispatchedThrough =
        (pov as any).dispatched_through ||
        pov.transporter_name ||
        company.dispatched_through ||
        '';
    const paymentTerms =
        (pov as any).payment_terms || company.payment_terms || '';
    const deliveryTerms =
        (pov as any).delivery_terms || company.delivery_terms || '';
    const remarks = pov.notes || company.remarks || '';

    // Company (Invoice To) block.
    const companyLines: string[] = [];
    if (company.address) companyLines.push(...company.address.split('\n'));
    if (company.gstin) companyLines.push(`GSTIN/UIN: ${company.gstin}`);
    if (company.state)
        companyLines.push(
            `State Name: ${company.state}${company.stateCode ? `, Code: ${company.stateCode}` : ''}`
        );
    if (company.cin) companyLines.push(`CIN: ${company.cin}`);
    if (company.email) companyLines.push(`E-Mail: ${company.email}`);

    // Voucher meta grid.
    const metaPairs: Array<[string, string]> = [
        ['Voucher No.', pov.voucher_no || '-'],
        ['Dated', docDate(orderDate) || '-'],
        ['Reference No. & Date', pov.purchase_order_voucher_no || '-'],
        ['Mode/Terms of Payment', paymentTerms || '-'],
        ['Dispatched through', dispatchedThrough || '-'],
        ['Invoice No.', (pov as any).invoice_number || '-'],
        ['Vehicle No.', pov.vehicle_no || '-'],
        ['LR No.', pov.lr_no || '-'],
        ['Currency', code],
        ['Terms of Delivery', deliveryTerms || '-'],
    ];

    // Consignee (Ship to) | Supplier (Bill from) band.
    const consigneeLines: string[] = [];
    if (consignee.name) consigneeLines.push(consignee.name);
    if (consignee.address) consigneeLines.push(...String(consignee.address).split('\n'));
    if (consignee.gstin) consigneeLines.push(`GSTIN/UIN: ${consignee.gstin}`);
    if (consignee.state) consigneeLines.push(`State Name: ${consignee.state}`);
    const supplierLines = [vendor.name || '-'];
    if (vendor.code) supplierLines.push(`Vendor Code: ${vendor.code}`);
    if (vendor.address) supplierLines.push(...String(vendor.address).split('\n'));
    if (vendor.gstin) supplierLines.push(`GSTIN/UIN: ${vendor.gstin}`);
    if (vendor.state)
        supplierLines.push(
            `State Name: ${vendor.state}${vendor.stateCode ? `, Code: ${vendor.stateCode}` : ''}`
        );

    // Line table (11 cols).
    const head = [
        'Sl No.',
        'Description of Goods',
        'Part No',
        'HSN/SAC',
        'Due on',
        'Quantity',
        'Rate',
        'per',
        'Disc. %',
        interState ? 'IGST %' : 'GST %',
        `Amount (${sym})`,
    ];
    const dueOn = docDate(pov.expected_arrival_date) || '';
    const rows: DocCell[][] = lines.length
        ? lines.map((l: any, i: number) => {
              const qty = Number(l.ordered_qty) || 0;
              const disc = Number(l.discount_pct) || 0;
              const gstPct = Number(l.tax_pct) || 0;
              return pad([
                  textCell(i + 1, 'c'),
                  textCell(l.product_name || '-', 'l', { bold: true }),
                  textCell(l.part_no || '-', 'c'),
                  textCell(l.hsn_code || '-', 'c'),
                  textCell(dueOn, 'c'),
                  textCell(`${fmt(qty)} ${l.unit || ''}`.trim(), 'r'),
                  curCell(Number(l.unit_price) || 0, sym, 2),
                  textCell(l.unit || '', 'c'),
                  textCell(disc > 0 ? `${disc} %` : '', 'r'),
                  textCell(gstPct > 0 ? `${gstPct}%` : '-', 'c'),
                  curCell(Number(l.line_total) || 0, sym, 2, { bold: true }),
              ]);
          })
        : [pad([textCell('No line items.', 'c')])];

    // Tax-summary rows in the Amount column (Tally style).
    const sumRow = (label: string, value: number, opts?: { bold?: boolean; fill?: string; color?: string }): DocCell[] =>
        pad([
            textCell(''),
            textCell(label, 'r', { bold: opts?.bold }),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            textCell(''),
            curCell(value, sym, 2, opts),
        ]);
    rows.push(sumRow('Subtotal', subtotal, { bold: true, fill: 'F3F2F7' }));
    for (const e of expensesSnapshot) {
        const gstPct = Number((e as any).gst_pct) || 0;
        const bits: string[] = [];
        if ((e as any).type === 'percent')
            bits.push(`${Number((e as any).value) || 0}%`);
        bits.push(gstApplies && gstPct > 0 ? `GST ${gstPct}%` : 'GST N/A');
        rows.push(
            sumRow(`${(e as any).name} (${bits.join(', ')})`, Number((e as any).amount) || 0)
        );
    }
    if (inputGst > 0.005) {
        if (interState) rows.push(sumRow('Input IGST', inputGst));
        else {
            rows.push(sumRow('Input CGST', cgst));
            rows.push(sumRow('Input SGST', sgst));
        }
    }
    if (Math.abs(roundOff) > 0.005) rows.push(sumRow('Round Off', roundOff));
    rows.push(
        sumRow('Grand Total', grand, { bold: true, fill: 'FDEBD8', color: 'C25E10' })
    );

    const sections: DocSection[] = [
        { kind: 'title', text: 'PURCHASE ORDER', subtitle: company.name },
        {
            kind: 'band',
            left: { label: company.name || 'Invoice To', lines: companyLines },
            right: { pairs: metaPairs },
        },
        {
            kind: 'band',
            left: { label: 'Consignee (Ship to)', lines: consigneeLines },
            right: { label: 'Supplier (Bill from)', lines: supplierLines },
        },
        { kind: 'spacer' },
        {
            kind: 'table',
            head,
            rows,
            align: ['c', 'l', 'c', 'c', 'c', 'r', 'r', 'c', 'r', 'c', 'r'],
        },
        { kind: 'spacer' },
        { kind: 'note', text: `Amount Chargeable (in words): ${amountInWords}`, bold: true },
    ];

    // GST HSN/rate summary (mirrors the PDF's detailed GST table).
    if (gstBuckets.length) {
        const gstHead = interState
            ? ['HSN/SAC', 'Taxable', 'IGST %', 'IGST Amt', 'Total Tax']
            : ['HSN/SAC', 'Taxable', 'CGST %', 'CGST Amt', 'SGST %', 'SGST Amt', 'Total Tax'];
        const gstRows = gstBuckets.map((b) => {
            const halfRate = b.rate / 2;
            const halfAmt = b.gst / 2;
            return interState
                ? [
                      textCell(b.hsn, 'c'),
                      curCell(b.taxable, sym, 2),
                      textCell(`${b.rate}%`, 'c'),
                      curCell(b.gst, sym, 2),
                      curCell(b.gst, sym, 2, { bold: true }),
                  ]
                : [
                      textCell(b.hsn, 'c'),
                      curCell(b.taxable, sym, 2),
                      textCell(`${halfRate}%`, 'c'),
                      curCell(halfAmt, sym, 2),
                      textCell(`${halfRate}%`, 'c'),
                      curCell(b.gst - halfAmt, sym, 2),
                      curCell(b.gst, sym, 2, { bold: true }),
                  ];
        });
        sections.push({ kind: 'note', text: 'GST Summary (HSN/SAC)', bold: true });
        sections.push({
            kind: 'table',
            head: gstHead,
            rows: gstRows,
            align: interState
                ? ['c', 'r', 'c', 'r', 'r']
                : ['c', 'r', 'c', 'r', 'c', 'r', 'r'],
        });
    }

    // Footer: Declaration | Signatory.
    const leftFooter: string[] = [];
    if (company.pan) leftFooter.push(`Company's PAN: ${company.pan}`);
    leftFooter.push(
        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'
    );
    const rightFooter: string[] = [`for ${company.name || ''}`];
    if (company.signatory) rightFooter.push(company.signatory);
    rightFooter.push('Authorised Signatory');
    if (remarks) sections.push({ kind: 'note', text: `Remarks: ${remarks}` });
    sections.push({
        kind: 'band',
        left: { label: 'Declaration', lines: leftFooter },
        right: { label: '', lines: rightFooter },
    });

    return sections;
}

function buildPovHtml(ctx: PovPdfContext): string {
    const {
        pov,
        company,
        consignee,
        vendor,
        inrTotal,
        gstInrTotal,
        gstBuckets,
        expenseGstBuckets,
        chargesInrTotal,
        chargeGstInrTotal,
        expensesSnapshot,
    } = ctx;

    // Intra-state (same state as ShivaTrade) → CGST + SGST; inter-state → IGST.
    // Resolve each party's GST state code from its GSTIN (first 2 digits) OR,
    // when the GSTIN is missing/malformed, from its state name — so it still
    // works when one side has only a GSTIN and the other only a state name.
    // Default to intra (CGST + SGST) when a code can't be resolved for both.
    const interState = (() => {
        const cc = gstStateCode(company.gstin, company.state);
        const vc = gstStateCode(vendor.gstin, vendor.state);
        if (cc && vc) return cc !== vc;
        return false;
    })();
    const lines = pov.lines || [];

    const sym = pov.currency_symbol || pov.currency_code || '₹';
    // NATIVE model (plan §6.3): POV line amounts are already stored in the POV's
    // own currency, so the document prints them as-is — no conversion. (pov
    // .exchange_rate is now INR-per-unit, used only for INR stock/books valuation.)
    const rate = 1;
    // GST is an Indian (INR) tax — never applies on a foreign-currency POV.
    const gstApplies = ((pov as any).currency_code || 'INR') === 'INR';

    // Money chain: Subtotal + Charges = Taxable; + CGST/SGST; round.
    const subtotalCcy = inrTotal * rate;
    const chargesCcy = chargesInrTotal * rate; // charges taxable value
    const chargeGstCcy = chargeGstInrTotal * rate; // GST on charges (per gst_pct)
    const taxableCcy = subtotalCcy + chargesCcy;
    const gstTotalCcy = gstInrTotal * rate; // goods GST only (goods GST table)
    // Input tax credit = goods GST + charge GST, shown as ONE CGST/SGST (or
    // IGST) figure like a standard tax invoice. The charge GST is no longer a
    // separate "Expense GST" summary line.
    const inputGstCcy = gstTotalCcy + chargeGstCcy;
    const cgstCcy = inputGstCcy / 2;
    const sgstCcy = inputGstCcy - cgstCcy;
    // Grand total = goods + charges + goods GST + charge GST. Charge GST is
    // shown baked into each charge's row (gross), so it's added here too.
    const grandRawCcy = taxableCcy + gstTotalCcy + chargeGstCcy;
    const grandTotalCcy = Math.round(grandRawCcy);
    const roundOffCcy = grandTotalCcy - grandRawCcy;

    const amountInWords = numberToIndianWords(
        grandTotalCcy,
        pov.currency_code || 'INR'
    );

    // Right-hand meta cell — small label over a bold value.
    const meta = (label: string, value: any): string =>
        `<div class="ml">${esc(label)}</div><div class="mv">${value == null || value === '' ? '&nbsp;' : esc(value)}</div>`;

    const totalQty = lines.reduce((s, l) => s + (Number(l.ordered_qty) || 0), 0);
    const unitSet = new Set(lines.map((l) => l.unit).filter(Boolean));
    const totalUnit = unitSet.size === 1 ? `${[...unitSet][0]}` : '';

    // Pass the raw value through — do NOT String() a Date here. `createdAt` is a
    // JS Date, and String(date) yields "Tue Jul 14 2026 17:43:19 GMT+0530 (India
    // Standard Time)", which is not a parseable date string. docDate handles a
    // Date directly.
    const orderDate = pov.dispatch_date || pov.createdAt || '';

    const linesRows = lines.length
        ? lines
              .map((l, i) => {
                  const qty = Number(l.ordered_qty) || 0;
                  const lineTotalCcy = (Number(l.line_total) || 0) * rate;
                  // Rate is the GROSS unit price (before discount); the Disc %
                  // column then reduces it to the (discounted) Amount, which
                  // equals line_total. So Rate × Qty − Disc % = Amount reads.
                  const rateCcy = (Number(l.unit_price) || 0) * rate;
                  const discPct = Number(l.discount_pct) || 0;
                  const dueOn = docDate(pov.expected_arrival_date);
                  const gstPct = Number(l.tax_pct) || 0;
                  return `
        <tr>
          <td class="c">${i + 1}</td>
          <td class="desc"><b>${esc(l.product_name || '-')}</b>${l.product_code ? `<div class="sub ital">${esc(l.product_code)}</div>` : ''}</td>
          <td class="c">${esc(l.part_no || '-')}</td>
          <td class="c">${esc(l.hsn_code || '-')}</td>
          <td class="c nowrap">${dueOn}</td>
          <td class="num nowrap"><b>${fmt(qty)} ${esc(l.unit || '')}</b></td>
          <td class="num nowrap">${ccyMoney(sym, rateCcy)}</td>
          <td class="c">${esc(l.unit || '')}</td>
          <td class="c nowrap">${discPct > 0 ? `${discPct}%` : '-'}</td>
          <td class="c nowrap">${gstPct > 0 ? `${gstPct}%` : '-'}</td>
          <td class="num nowrap"><b>${ccyMoney(sym, lineTotalCcy)}</b></td>
        </tr>`;
              })
              .join('')
        : `<tr><td colspan="11" class="c muted" style="padding:16px">No line items.</td></tr>`;

    // Tax summary rows (Tally-style, in the Amount column).
    const sumRow = (label: string, value: string): string => `
        <tr>
          <td></td>
          <td class="num ital" colspan="9">${label ? `<b>${esc(label)}</b>` : ''}</td>
          <td class="num nowrap"><b>${value}</b></td>
        </tr>`;

    // Each expense at its BASE (without its own GST); the charge GST is folded
    // into the Input CGST/SGST (or IGST) totals below — no separate "Expense
    // GST" row. The per-charge HSN/SAC GST breakdown still prints in its own
    // table (expenseGstDetailTable).
    const summaryRows =
        sumRow('', ccyMoney(sym, subtotalCcy)) +
        expensesSnapshot
            .map((e) => {
                const gstPct = Number(e.gst_pct) || 0;
                // Name + its own % (percent charges) + a GST bracket — always
                // shown: the rate when GST applies, else "GST N/A" so it's clear
                // no GST was charged on that line.
                const bits: string[] = [];
                if (e.type === 'percent') bits.push(`${Number(e.value) || 0}%`);
                bits.push(
                    gstApplies && gstPct > 0 ? `GST ${gstPct}%` : 'GST N/A'
                );
                const label = `${e.name} ${bits.map(b => `(${b})`).join(' ')}`;
                const baseCcy = (Number(e.amount) || 0) * rate;
                return sumRow(label, ccyMoney(sym, baseCcy));
            })
            .join('') +
        (inputGstCcy > 0.005
            ? interState
                ? sumRow('Input IGST', ccyMoney(sym, inputGstCcy))
                : sumRow('Input CGST', ccyMoney(sym, cgstCcy)) +
                  sumRow('Input SGST', ccyMoney(sym, sgstCcy))
            : '') +
        (Math.abs(roundOffCcy) > 0.005
            ? sumRow('Round Off', ccyMoney(sym, roundOffCcy))
            : '');

    // Detailed GST table (Tally-style HSN/rate summary). Columns adapt to the
    // supply type: CGST + SGST for intra-state, IGST for inter-state.
    const gstDetailTable = gstBuckets.length
        ? `<table class="items" style="margin-top:6px">
  <thead>
    <tr>
      <th style="width:70px">HSN/SAC</th>
      <th class="num">Taxable Value</th>
      ${
          interState
              ? `<th class="num" style="width:56px">IGST %</th>
                 <th class="num" style="width:90px">IGST Amt</th>`
              : `<th class="num" style="width:52px">CGST %</th>
                 <th class="num" style="width:84px">CGST Amt</th>
                 <th class="num" style="width:52px">SGST %</th>
                 <th class="num" style="width:84px">SGST Amt</th>`
      }
      <th class="num" style="width:90px">Total Tax</th>
    </tr>
  </thead>
  <tbody>
    ${gstBuckets
        .map((b) => {
            const taxableCcyRow = b.taxable * rate;
            const gstCcyRow = b.gst * rate;
            const halfRate = b.rate / 2;
            const halfAmt = gstCcyRow / 2;
            const cells = interState
                ? `<td class="num nowrap">${b.rate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, gstCcyRow)}</td>`
                : `<td class="num nowrap">${halfRate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, halfAmt)}</td>
                   <td class="num nowrap">${halfRate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, gstCcyRow - halfAmt)}</td>`;
            return `<tr>
      <td class="c">${esc(b.hsn)}</td>
      <td class="num nowrap">${ccyMoney(sym, taxableCcyRow)}</td>
      ${cells}
      <td class="num nowrap"><b>${ccyMoney(sym, gstCcyRow)}</b></td>
    </tr>`;
        })
        .join('')}
    <tr>
      <td class="num"><b>Total</b></td>
      <td class="num nowrap"><b>${ccyMoney(
          sym,
          gstBuckets.reduce((s, b) => s + b.taxable * rate, 0)
      )}</b></td>
      ${interState ? '<td></td>' : '<td></td><td></td>'}
      <td></td>
      ${interState ? '' : '<td></td>'}
      <td class="num nowrap"><b>${ccyMoney(sym, gstTotalCcy)}</b></td>
    </tr>
  </tbody>
</table>`
        : '';

    // Expense-charges HSN/SAC-wise GST summary — mirrors the goods table above,
    // built from each charge's own HSN/SAC code + per-charge gst_pct.
    const expenseGstTotalCcy = expenseGstBuckets.reduce(
        (s, b) => s + b.gst * rate,
        0
    );
    const expenseGstDetailTable = expenseGstBuckets.length
        ? `<table class="items" style="margin-top:6px">
  <thead>
    <tr>
      <th colspan="${interState ? 5 : 7}" class="c"><b>Expense Charges — HSN/SAC wise GST</b></th>
    </tr>
    <tr>
      <th style="width:70px">HSN/SAC</th>
      <th class="num">Taxable Value</th>
      ${
          interState
              ? `<th class="num" style="width:56px">IGST %</th>
                 <th class="num" style="width:90px">IGST Amt</th>`
              : `<th class="num" style="width:52px">CGST %</th>
                 <th class="num" style="width:84px">CGST Amt</th>
                 <th class="num" style="width:52px">SGST %</th>
                 <th class="num" style="width:84px">SGST Amt</th>`
      }
      <th class="num" style="width:90px">Total Tax</th>
    </tr>
  </thead>
  <tbody>
    ${expenseGstBuckets
        .map((b) => {
            const taxableCcyRow = b.taxable * rate;
            const gstCcyRow = b.gst * rate;
            const halfRate = b.rate / 2;
            const halfAmt = gstCcyRow / 2;
            const cells = interState
                ? `<td class="num nowrap">${b.rate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, gstCcyRow)}</td>`
                : `<td class="num nowrap">${halfRate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, halfAmt)}</td>
                   <td class="num nowrap">${halfRate}%</td>
                   <td class="num nowrap">${ccyMoney(sym, gstCcyRow - halfAmt)}</td>`;
            return `<tr>
      <td class="c">${esc(b.hsn)}</td>
      <td class="num nowrap">${ccyMoney(sym, taxableCcyRow)}</td>
      ${cells}
      <td class="num nowrap"><b>${ccyMoney(sym, gstCcyRow)}</b></td>
    </tr>`;
        })
        .join('')}
    <tr>
      <td class="num"><b>Total</b></td>
      <td class="num nowrap"><b>${ccyMoney(
          sym,
          expenseGstBuckets.reduce((s, b) => s + b.taxable * rate, 0)
      )}</b></td>
      ${interState ? '<td></td>' : '<td></td><td></td>'}
      <td></td>
      ${interState ? '' : '<td></td>'}
      <td class="num nowrap"><b>${ccyMoney(sym, expenseGstTotalCcy)}</b></td>
    </tr>
  </tbody>
</table>`
        : '';

    const remarks = pov.notes || company.remarks || '';
    // POV-level terms win; the company defaults fill in for POVs saved before
    // the terms existed (or left blank). Same shape as `remarks` above.
    const dispatchedThrough =
        (pov as any).dispatched_through ||
        pov.transporter_name ||
        company.dispatched_through ||
        '';
    const paymentTerms =
        (pov as any).payment_terms || company.payment_terms || '';
    const deliveryTerms =
        (pov as any).delivery_terms || company.delivery_terms || '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(pov.voucher_no || 'PO')}</title>
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
  .sub { font-size: 8px; color: #333; }
  .num { text-align: right; }
  .c { text-align: center; }
  .nowrap { white-space: nowrap; }
  .muted { color: #555; text-align: center; }
  .items-fill td { height: 60px; }
  .words { padding: 3px 5px; }
  .words b { font-size: 9.5px; }
  .remarks { padding: 3px 5px; font-size: 8.4px; white-space: pre-line; }
  .ital { font-style: italic; }
  .logo { height: 34px; margin-bottom: 2px; }
</style>
</head>
<body>
<div class="title">PURCHASE ORDER</div>

<table class="box">
  <tr>
    <td style="width:50%;padding:0;vertical-align:top">
      <table class="inner">
        <tr><td class="party">
          ${ctx.logoDataUri ? `<img class="logo" src="${ctx.logoDataUri}" />` : ''}
          <div class="cap">Invoice To</div>
          <div class="co-name">${esc(company.name || '')}</div>
          ${company.address ? `<div class="co-line" style="white-space:pre-line">${esc(company.address)}</div>` : ''}
          ${company.gstin ? `<div class="co-line">GSTIN/UIN: ${esc(company.gstin)}</div>` : ''}
          ${company.state ? `<div class="co-line">State Name : ${esc(company.state)}${company.stateCode ? `, Code : ${esc(company.stateCode)}` : ''}</div>` : ''}
          ${company.cin ? `<div class="co-line">CIN: ${esc(company.cin)}</div>` : ''}
          ${company.email ? `<div class="co-line">E-Mail : ${esc(company.email)}</div>` : ''}
        </td></tr>
        <tr><td class="party" style="height:96px">
          <div class="cap">Consignee (Ship to)</div>
          ${consignee.name ? `<div class="pname">${esc(consignee.name)}</div>` : ''}
          ${consignee.address ? `<div class="pline">${esc(consignee.address)}</div>` : ''}
          ${consignee.gstin ? `<div class="co-line">GSTIN/UIN : ${esc(consignee.gstin)}</div>` : ''}
          ${consignee.state ? `<div class="co-line">State Name : ${esc(consignee.state)}</div>` : ''}
        </td></tr>
        <tr><td class="party" style="height:96px">
          <div class="cap">Supplier (Bill from)</div>
          ${vendor.name ? `<div class="pname">${esc(vendor.name)}</div>` : ''}
          ${vendor.code ? `<div class="co-line">Vendor Code : ${esc(vendor.code)}</div>` : ''}
          ${vendor.address ? `<div class="pline">${esc(vendor.address)}</div>` : ''}
          ${vendor.gstin ? `<div class="co-line">GSTIN/UIN : ${esc(vendor.gstin)}</div>` : ''}
          ${vendor.state ? `<div class="co-line">State Name : ${esc(vendor.state)}${vendor.stateCode ? `, Code : ${esc(vendor.stateCode)}` : ''}</div>` : ''}
        </td></tr>
      </table>
    </td>
    <td style="width:50%;padding:0;vertical-align:top">
      <table class="inner">
        <tr>
          <td class="meta" style="width:50%">${meta('Voucher No.', pov.voucher_no)}</td>
          <td class="meta" style="width:50%">${meta('Dated', docDate(orderDate))}</td>
        </tr>
        <tr>
          <td class="meta">${meta('Reference No. & Date', pov.purchase_order_voucher_no)}</td>
          <td class="meta">${meta('Mode/Terms of Payment', paymentTerms)}</td>
        </tr>
        <tr>
          <td class="meta">${meta('Dispatched through', dispatchedThrough)}</td>
          <td class="meta">${meta('Invoice No.', (pov as any).invoice_number)}</td>
        </tr>
        <tr>
          <td class="meta">${meta('Vehicle No.', pov.vehicle_no)}</td>
          <td class="meta">${meta('LR No.', pov.lr_no)}</td>
        </tr>
        <tr>
          <td class="meta">${meta('Currency', pov.currency_code || 'INR')}</td>
          <td class="meta">${meta(
              'Exchange Rate',
              // Frozen at POV creation (INR per 1 vendor unit) — reflects the
              // rate the deal used, NOT today's master rate. Blank for INR.
              (pov.currency_code || 'INR') !== 'INR' &&
                  Number((pov as any).exchange_rate) > 0
                  ? `1 ${pov.currency_code} = ₹${Number(
                        (pov as any).exchange_rate
                    ).toLocaleString('en-IN', {
                        maximumFractionDigits: 4,
                    })}`
                  : ''
          )}</td>
        </tr>
        <tr>
          <td class="meta" colspan="2" style="height:96px;vertical-align:top">${meta('Terms of Delivery', deliveryTerms)}</td>
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
      <th style="width:64px">Part No</th>
      <th style="width:54px">HSN/SAC</th>
      <th style="width:50px">Due on</th>
      <th style="width:74px">Quantity</th>
      <th style="width:60px">Rate</th>
      <th style="width:26px">per</th>
      <th class="num" style="width:40px">Disc %</th>
      <th style="width:42px">${interState ? 'IGST %' : 'GST %'}</th>
      <th style="width:80px">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${linesRows}
    <tr class="items-fill"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    ${summaryRows}
    <tr>
      <td></td>
      <td class="num"><b>Total</b></td>
      <td></td><td></td><td></td>
      <td class="num nowrap"><b>${fmt(totalQty)} ${esc(totalUnit)}</b></td>
      <td></td><td></td><td></td><td></td>
      <td class="num nowrap"><b>${ccyMoney(sym, grandTotalCcy)}</b></td>
    </tr>
  </tbody>
</table>

${gstDetailTable}

${expenseGstDetailTable}

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
        </td>
        <td style="width:45%;vertical-align:top;padding:3px 5px">
          <div style="text-align:right" class="co-line">for <b>${esc(company.name || '')}</b></div>
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
