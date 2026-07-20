import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { QuotationService } from './quotation.service';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationLineRepository } from '../repository/repositories/quotation-line.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { ENUM_QUOTATION_STATUS } from '../enums/quotation.enum';
import {
    parseDateCell,
    parseLineItemsSheet,
    resolveBillTo,
    formatAddressText,
    pickSheet,
    LINE_ITEM_FIXED_HEADERS,
    buildCostingCodeColumns,
    ResolvedDocLine,
} from '@common/import/sales-doc-two-sheet.helper';

// Quotation TWO-SHEET import:
//   Sheet "Quotations" — one clean row per quote (header fields).
//   Sheet "LineItems"  — full costing lines, joined to a quote by voucher_no.
// Preserves the original voucher_no + status, runs SILENT, and is idempotent
// (an existing voucher is SKIPPED). Bill-to that is typed but not a saved
// address of the customer is a per-document ERROR (policy A — Bill-to has no
// snapshot field, so we never silently substitute a different address).
const HEADER_HEADERS = [
    'voucher_no',
    'quotation_date',
    'customer_name',
    'bill_to_address',
    'consignee_same_as_buyer',
    'consignee_name',
    'consignee_address',
    'currency_code',
    'exchange_rate',
    'valid_until',
    'payment_terms',
    'delivery_terms',
    'delivery_location',
    'lead_voucher_no',
    'freight_total',
    'notes_to_client',
    'internal_notes',
    'status',
];

interface QuotationHeader {
    quotation_date: string;
    customer_id?: string;
    customer_name?: string;
    customer_address_id?: string;
    consignee_same_as_buyer: boolean;
    consignee_snapshot?: any;
    lead_id?: string;
    currency_code: string;
    exchange_rate?: string;
    valid_until?: string;
    payment_terms?: string;
    delivery_terms?: string;
    delivery_location?: string;
    freight_total?: string;
    notes_to_client?: string;
    internal_notes?: string;
    status: ENUM_QUOTATION_STATUS;
}

export interface QuotationImportDoc {
    voucher_no: string;
    rowNum: number;
    header: QuotationHeader;
    lines: ResolvedDocLine[];
    status: 'valid_new' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
}

const YES = new Set(['yes', 'y', 'true', '1', 'same', 'same as buyer']);
const NO = new Set(['no', 'n', 'false', '0']);

@Injectable()
export class QuotationImportExportService {
    private readonly logger = new Logger(QuotationImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly quotationService: QuotationService,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly leadRepository: LeadRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository
    ) {}

    async generateSampleExcel(companyId: string): Promise<Buffer> {
        const [rebateMasters, expenseMasters] = await Promise.all([
            this.rebateRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
            this.expenseRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
        ]);
        const codeCols = buildCostingCodeColumns(
            rebateMasters as any[],
            expenseMasters as any[]
        );

        const headers: Record<string, any> = {
            voucher_no: 'STIPL/QT0001/2026-27',
            quotation_date: '15/04/2026',
            customer_name: 'Orient Global Trading LLC',
            bill_to_address: '',
            consignee_same_as_buyer: 'yes',
            consignee_name: '',
            consignee_address: '',
            currency_code: 'USD',
            exchange_rate: '83', // ₹ per 1 USD (human-friendly, like the UI)
            valid_until: '15/05/2026',
            payment_terms: '100% advance',
            delivery_terms: 'FOB',
            delivery_location: '',
            lead_voucher_no: 'STIPL/RQ/0001/2026-27',
            freight_total: '50', // in the quote's currency (USD)
            notes_to_client: 'Prices valid 30 days',
            internal_notes: 'Backfilled from paper quote',
            status: 'sent',
        };
        // One example line; each rebate/expense code is its own column (value =
        // the per-line amount/percent). First of each is pre-filled as a hint.
        const line1: Record<string, any> = {
            voucher_no: 'STIPL/QT0001/2026-27',
            product_code: 'PRD-001',
            vendor_code: 'VND-0001',
            qty: '100',
            unit_price: '25',
            discount_pct: '0',
            tax_pct: '0',
            margin_pct: '10',
            part_no: 'PN-1001',
            hs_code: '72061000',
            unit: 'KG',
            description: 'Hot rolled coil',
            customer_reference: 'BUYER-REF-1',
            net_weight_kg: '1',
            gross_weight_kg: '1.2',
            package_count: '5',
        };
        let firstReb = true;
        let firstExp = true;
        for (const c of codeCols) {
            if (c.kind === 'rebate') {
                line1[c.header] = firstReb ? '2' : '';
                firstReb = false;
            } else {
                line1[c.header] = firstExp ? '500' : '';
                firstExp = false;
            }
        }
        return this.fileService.writeExcel([
            { sheetName: 'Quotations', data: [headers] },
            { sheetName: 'LineItems', data: [line1] },
        ] as any);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: QuotationImportDoc[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }
        const headerRows =
            pickSheet(sheets as any, ['Quotations', 'Quotation'], 0) || [];
        const lineRows =
            pickSheet(sheets as any, ['LineItems', 'Lines'], 1) || [];
        if (!headerRows.length)
            throw new BadRequestException(
                'The "Quotations" sheet has no rows. Expected a header sheet (one row per quote) and a "LineItems" sheet.'
            );
        if (!lineRows.length)
            throw new BadRequestException(
                'The "LineItems" sheet has no rows. Expected the line items on a second sheet named "LineItems".'
            );

        // ── Resolution maps ──
        const products = await this.productRepository.findByCompanyId(companyId);
        const productByCode = new Map<string, any>();
        for (const p of products as any[])
            if (p.code) productByCode.set(String(p.code).trim().toLowerCase(), p);

        const vendors = await this.vendorRepository.findByCompanyId(companyId);
        const vendorByCode = new Map<string, any>();
        for (const v of vendors as any[])
            if (v.vendor_code)
                vendorByCode.set(String(v.vendor_code).trim().toLowerCase(), v);

        const [rebateMasters, expenseMasters] = await Promise.all([
            this.rebateRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
            this.expenseRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
        ]);
        const rebateByCode = new Map<string, any>();
        for (const r of rebateMasters as any[])
            if (r.code) rebateByCode.set(String(r.code).trim().toLowerCase(), r);
        const expenseByCode = new Map<string, any>();
        for (const e of expenseMasters as any[])
            if (e.code)
                expenseByCode.set(String(e.code).trim().toLowerCase(), e);

        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const customerByName = new Map<string, any>();
        for (const c of customers)
            customerByName.set((c.company_name || '').trim().toLowerCase(), c);

        const leads = (await this.leadRepository.findByCompanyId(
            companyId
        )) as any[];
        const leadByVoucher = new Map<string, any>();
        for (const l of leads)
            if (l.voucher_no)
                leadByVoucher.set((l.voucher_no || '').trim().toLowerCase(), l);

        const existingQuotes = (await this.quotationRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const existingVouchers = new Set<string>(
            existingQuotes.map((q) => (q.voucher_no || '').trim().toLowerCase())
        );

        // ── Parse the LineItems sheet once (grouped by voucher_no) ──
        const parsedLines = parseLineItemsSheet(lineRows as any, {
            productByCode,
            vendorByCode,
            rebateByCode,
            expenseByCode,
        });

        // Per-customer saved-address cache (for Bill-to resolution).
        const addrCache = new Map<string, any[]>();
        const loadAddrs = async (customerId: string): Promise<any[]> => {
            if (addrCache.has(customerId)) return addrCache.get(customerId);
            const rows = (await this.customerAddressRepository.findByCustomerId(
                customerId
            )) as any[];
            addrCache.set(customerId, rows);
            return rows;
        };

        const get = (raw: Record<string, any>, col: string): string => {
            const key = Object.keys(raw).find(
                (k) => k.trim().toLowerCase() === col
            );
            return key ? String(raw[key] ?? '').trim() : '';
        };
        const getRaw = (raw: Record<string, any>, col: string): any => {
            const key = Object.keys(raw).find(
                (k) => k.trim().toLowerCase() === col
            );
            return key ? raw[key] : '';
        };

        const seenVouchers = new Set<string>();
        const docs: QuotationImportDoc[] = [];

        for (let i = 0; i < headerRows.length; i++) {
            const raw = headerRows[i] as Record<string, any>;
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];

            const voucher_no = get(raw, 'voucher_no');
            const vkey = voucher_no.toLowerCase();
            if (!voucher_no) errors.push('voucher_no is required');
            else if (seenVouchers.has(vkey))
                errors.push('Duplicate voucher_no in the Quotations sheet');
            if (voucher_no) seenVouchers.add(vkey);

            const dateIso = parseDateCell(getRaw(raw, 'quotation_date'));
            if (!dateIso)
                errors.push(
                    'quotation_date is required and must be a valid date (DD/MM/YYYY or YYYY-MM-DD)'
                );

            const currency_code = get(raw, 'currency_code').toUpperCase();
            if (!currency_code) errors.push('currency_code is required');
            else if (!/^[A-Z]{3}$/.test(currency_code))
                errors.push('currency_code must be 3 letters (e.g. USD)');

            // Customer (by name) — required.
            const customerName = get(raw, 'customer_name');
            let customer: any;
            let customer_id: string | undefined;
            if (!customerName) errors.push('customer_name is required');
            else {
                customer = customerByName.get(customerName.toLowerCase());
                if (!customer)
                    errors.push(
                        `customer_name "${customerName}" not found (import Customers first)`
                    );
                else customer_id = customer._id.toString();
            }

            // Bill-to (policy A: typed-but-unmatched → error).
            let customer_address_id: string | undefined;
            if (customer_id) {
                const addrs = await loadAddrs(customer_id);
                const billTo = resolveBillTo(get(raw, 'bill_to_address'), addrs);
                if (billTo.error) errors.push(billTo.error);
                else customer_address_id = billTo.id;
            }

            // Consignee — same-as-buyer default; else snapshot from the sheet.
            const cSameRaw = get(raw, 'consignee_same_as_buyer').toLowerCase();
            const consigneeName = get(raw, 'consignee_name');
            const consigneeAddress = get(raw, 'consignee_address');
            let consignee_same_as_buyer = true;
            let consignee_snapshot: any;
            if (NO.has(cSameRaw) || consigneeName || consigneeAddress) {
                consignee_same_as_buyer = false;
                consignee_snapshot = {
                    name: consigneeName || undefined,
                    address_line1: consigneeAddress || undefined,
                };
            } else if (cSameRaw && !YES.has(cSameRaw)) {
                warnings.push(
                    `consignee_same_as_buyer "${cSameRaw}" not understood — treated as yes`
                );
            }

            // Optional source lead.
            let lead_id: string | undefined;
            const leadVoucher = get(raw, 'lead_voucher_no');
            if (leadVoucher) {
                const l = leadByVoucher.get(leadVoucher.toLowerCase());
                if (!l)
                    warnings.push(
                        `lead_voucher_no "${leadVoucher}" not found — left unlinked`
                    );
                else lead_id = l._id.toString();
            }

            // status
            let status = ENUM_QUOTATION_STATUS.DRAFT;
            const statusRaw = get(raw, 'status').toLowerCase();
            if (statusRaw) {
                if (
                    (Object.values(ENUM_QUOTATION_STATUS) as string[]).includes(
                        statusRaw
                    )
                )
                    status = statusRaw as ENUM_QUOTATION_STATUS;
                else
                    errors.push(
                        `Invalid status "${statusRaw}" (expected ${Object.values(
                            ENUM_QUOTATION_STATUS
                        ).join(', ')})`
                    );
            }

            // exchange_rate column is HUMAN-friendly "₹ per 1 <currency>" (same
            // as the UI banner, e.g. 83 for USD). The system stores the inverse
            // (foreign-per-₹1), so we store 1 / input. INR is always 1.
            let stored_er: string | undefined;
            const erInput = get(raw, 'exchange_rate');
            if (currency_code === 'INR') {
                stored_er = '1';
            } else if (currency_code) {
                if (!erInput)
                    errors.push(
                        `exchange_rate (₹ per 1 ${currency_code}) is required for a foreign-currency quotation`
                    );
                else {
                    const r = Number(erInput);
                    if (!Number.isFinite(r) || r <= 0)
                        errors.push(
                            `exchange_rate must be a positive number (₹ per 1 ${currency_code})`
                        );
                    else stored_er = String(1 / r);
                }
            }

            // Lines for this voucher (from the LineItems sheet).
            const lines = voucher_no
                ? parsedLines.byVoucher.get(vkey) || []
                : [];
            const lineErrors = parsedLines.errorsByVoucher.get(vkey) || [];
            const lineWarnings = parsedLines.warningsByVoucher.get(vkey) || [];
            errors.push(...lineErrors);
            warnings.push(...lineWarnings);
            if (!lines.length && !lineErrors.length)
                errors.push(
                    'No line items found for this voucher_no in the "LineItems" sheet'
                );

            const alreadyExists =
                !!voucher_no && existingVouchers.has(vkey);
            let docStatus: QuotationImportDoc['status'];
            if (errors.length) docStatus = 'error';
            else if (alreadyExists) docStatus = 'skip';
            else docStatus = 'valid_new';

            docs.push({
                voucher_no,
                rowNum,
                header: {
                    quotation_date: dateIso || '',
                    customer_id,
                    customer_name: customerName || undefined,
                    customer_address_id,
                    consignee_same_as_buyer,
                    consignee_snapshot,
                    lead_id,
                    currency_code,
                    exchange_rate: stored_er,
                    valid_until:
                        parseDateCell(getRaw(raw, 'valid_until')) || undefined,
                    payment_terms: get(raw, 'payment_terms') || undefined,
                    delivery_terms: get(raw, 'delivery_terms') || undefined,
                    delivery_location:
                        get(raw, 'delivery_location') || undefined,
                    freight_total: get(raw, 'freight_total') || undefined,
                    notes_to_client: get(raw, 'notes_to_client') || undefined,
                    internal_notes: get(raw, 'internal_notes') || undefined,
                    status,
                },
                lines,
                status: docStatus,
                errors,
                warnings,
            });
        }

        // Flag LineItems voucher groups that have no matching header row.
        const headerVouchers = new Set(docs.map((d) => d.voucher_no.toLowerCase()));
        const orphanVouchers = Array.from(parsedLines.byVoucher.keys()).filter(
            (v) => v && !headerVouchers.has(v)
        );

        const summary = {
            total: docs.length,
            valid_new: docs.filter((d) => d.status === 'valid_new').length,
            valid_update: 0,
            skipped: docs.filter((d) => d.status === 'skip').length,
            errors: docs.filter((d) => d.status === 'error').length,
            warnings: docs.reduce((n, d) => n + d.warnings.length, 0),
            orphan_line_vouchers: orphanVouchers,
        };
        return { summary, rows: docs };
    }

    async importQuotations(
        docs: QuotationImportDoc[],
        companyId: string,
        userId: string
    ): Promise<{
        created: number;
        skipped: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let skipped = 0;
        const errors: { row: number; message: string }[] = [];

        for (const doc of docs) {
            if (doc.status === 'skip') {
                skipped++;
                continue;
            }
            if (doc.status !== 'valid_new') continue;
            const h = doc.header;
            try {
                await this.quotationService.create(
                    companyId,
                    {
                        customer_id: h.customer_id,
                        lead_id: h.lead_id,
                        customer_address_id: h.customer_address_id,
                        consignee_same_as_buyer: h.consignee_same_as_buyer,
                        consignee_snapshot: h.consignee_snapshot,
                        quotation_date: h.quotation_date,
                        valid_until: h.valid_until,
                        currency_code: h.currency_code,
                        exchange_rate: h.exchange_rate,
                        freight_total: h.freight_total,
                        payment_terms: h.payment_terms,
                        delivery_terms: h.delivery_terms,
                        delivery_location: h.delivery_location,
                        notes_to_client: h.notes_to_client,
                        internal_notes: h.internal_notes,
                        status: h.status,
                        lines: doc.lines.map((l) => ({
                            product_id: l.product_id,
                            vendor_id: l.vendor_id,
                            qty: l.qty,
                            unit: l.unit,
                            unit_price: l.unit_price,
                            discount_pct: l.discount_pct,
                            tax_pct: l.tax_pct,
                            margin_pct: l.margin_pct,
                            part_no: l.part_no,
                            hs_code: l.hs_code,
                            description: l.description,
                            customer_reference: l.customer_reference,
                            net_weight_kg: l.net_weight_kg,
                            gross_weight_kg: l.gross_weight_kg,
                            package_count: l.package_count,
                            product_rebates_snapshot:
                                l.product_rebates_snapshot,
                            product_expenses_snapshot:
                                l.product_expenses_snapshot,
                        })),
                    } as any,
                    userId,
                    {
                        voucher_no: doc.voucher_no,
                        status: h.status,
                        silent: true,
                    }
                );
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Quotation import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    /** Export quotations to the same two-sheet shape (round-trips the import). */
    async exportQuotations(companyId: string): Promise<Buffer> {
        const quotes = (await this.quotationRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];

        const products = await this.productRepository.findByCompanyId(companyId);
        const codeById = new Map<string, string>();
        for (const p of products as any[])
            codeById.set(p._id.toString(), p.code || '');
        const vendors = await this.vendorRepository.findByCompanyId(companyId);
        const vendorCodeById = new Map<string, string>();
        for (const v of vendors as any[])
            vendorCodeById.set(v._id.toString(), v.vendor_code || '');
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const custNameById = new Map<string, string>();
        for (const c of customers)
            custNameById.set(c._id.toString(), c.company_name || '');

        // Bill-to address text per referenced customer.
        const addrById = new Map<string, string>();
        const allAddrs = (await this.customerAddressRepository.findByCustomerIds(
            customers.map((c) => c._id.toString())
        )) as any[];
        for (const a of allAddrs)
            addrById.set(a._id.toString(), formatAddressText(a));

        const [rebateMasters, expenseMasters] = await Promise.all([
            this.rebateRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
            this.expenseRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
        ]);
        const codeCols = buildCostingCodeColumns(
            rebateMasters as any[],
            expenseMasters as any[]
        );

        const isoDate = (v: any) => (v ? String(v).slice(0, 10) : '');
        // Stored rate is foreign-per-₹1; export the human "₹ per 1 <ccy>" = 1/stored.
        const invRate = (v: any): string => {
            const n = Number(v);
            return Number.isFinite(n) && n > 0
                ? String(Math.round((1 / n) * 10000) / 10000)
                : '';
        };

        const headerData: any[] = [];
        const lineData: any[] = [];
        for (const q of quotes) {
            headerData.push({
                voucher_no: q.voucher_no || '',
                quotation_date: isoDate(q.quotation_date),
                customer_name: custNameById.get(q.customer_id?.toString()) || '',
                bill_to_address:
                    addrById.get(q.customer_address_id?.toString()) || '',
                consignee_same_as_buyer: q.consignee_same_as_buyer
                    ? 'yes'
                    : 'no',
                consignee_name: q.consignee_snapshot?.name || '',
                consignee_address: q.consignee_snapshot?.address_line1 || '',
                currency_code: q.currency_code || '',
                // Export as ₹ per 1 <currency> (inverse of the stored rate).
                exchange_rate: invRate(q.exchange_rate),
                valid_until: isoDate(q.valid_until),
                payment_terms: q.payment_terms || '',
                delivery_terms: q.delivery_terms || '',
                delivery_location: q.delivery_location || '',
                lead_voucher_no: '',
                freight_total: q.freight_total || '',
                notes_to_client: q.notes_to_client || '',
                internal_notes: q.internal_notes || '',
                status: q.status || '',
            });
            const lines = (await this.quotationLineRepository.findAll({
                quotation_id: q._id.toString(),
            } as any)) as any[];
            for (const ln of lines) {
                const row: any = {
                    voucher_no: q.voucher_no || '',
                    product_code: codeById.get(ln.product_id?.toString()) || '',
                    vendor_code:
                        vendorCodeById.get(ln.vendor_id?.toString()) || '',
                    qty: ln.qty ?? '',
                    unit_price: ln.unit_price ?? '',
                    discount_pct: ln.discount_pct ?? '',
                    tax_pct: ln.tax_pct ?? '',
                    margin_pct: ln.margin_pct ?? '',
                    part_no: ln.part_no ?? '',
                    hs_code: ln.hs_code ?? '',
                    unit: ln.unit ?? '',
                    description: ln.description ?? '',
                    customer_reference: ln.customer_reference ?? '',
                    net_weight_kg: ln.net_weight_kg ?? '',
                    gross_weight_kg: ln.gross_weight_kg ?? '',
                    package_count: ln.package_count ?? '',
                };
                // Per-code rebate/expense columns (value = per-line amount/pct).
                const rebByCode = new Map<string, any>();
                for (const r of ln.product_rebates_snapshot || [])
                    if (r?.code) rebByCode.set(String(r.code), r.pct ?? '');
                const expByCode = new Map<string, any>();
                for (const e of ln.product_expenses_snapshot || [])
                    if (e?.code) expByCode.set(String(e.code), e.value ?? '');
                for (const c of codeCols)
                    row[c.header] =
                        c.kind === 'rebate'
                            ? rebByCode.get(c.code) ?? ''
                            : expByCode.get(c.code) ?? '';
                lineData.push(row);
            }
        }
        // Guarantee headers even when empty by seeding a keys-only template row.
        const headerTemplate: any = {};
        for (const h of HEADER_HEADERS) headerTemplate[h] = '';
        const lineTemplate: any = {};
        for (const h of LINE_ITEM_FIXED_HEADERS) lineTemplate[h] = '';
        for (const c of codeCols) lineTemplate[c.header] = '';

        return this.fileService.writeExcel([
            {
                sheetName: 'Quotations',
                data: headerData.length ? headerData : [headerTemplate],
            },
            {
                sheetName: 'LineItems',
                data: lineData.length ? lineData : [lineTemplate],
            },
        ] as any);
    }
}
