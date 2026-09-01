import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { InvoiceService } from './invoice.service';
import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { InvoicePaymentRepository } from '../repository/repositories/invoice-payment.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import {
    ENUM_INVOICE_STATUS,
    ENUM_INVOICE_TYPE,
    ENUM_INVOICE_GST_ROUTE,
    ENUM_SHIPPING_MODE,
    ENUM_SHIPPING_BILL_TYPE,
} from '../enums/invoice.enum';
import { ImportContext } from '@common/import/import-context.interface';
import {
    parseDateCell,
    pickSheet,
    resolveBillTo,
    formatAddressText,
    buildCostingCodeColumns,
} from '@common/import/sales-doc-two-sheet.helper';

// Invoice FOUR-SHEET import (the deepest doc):
//   "Invoices"   — one row per invoice (the full header field set).
//   "LineItems"  — full costing lines (+ igst/uqc/packages/weights) + per-code
//                  rebate/expense columns, joined by voucher_no.
//   "Banks"      — bank snapshots (one row per bank), joined by voucher_no.
// Decision-5 (relaxed): a line's purchase_order_line_id may be null, so an
// invoice imports WITHOUT its Sales Order. Preserves voucher_no; runs SILENT;
// idempotent-skip. When status ≥ issued the importer CREATES a draft then calls
// issue() in import mode (voucher preserved, stock NOT moved, grand_total_inr
// snapshotted). port_of_loading comes from the company profile.
const HEADER_HEADERS = [
    'voucher_no',
    'invoice_type',
    'invoice_date',
    'due_date',
    'customer_po_no',
    'so_voucher_no',
    'quotation_voucher_no',
    'customer_name',
    'bill_to_address',
    'consignee_name',
    'consignee_address',
    'notify_party_name',
    'notify_party_address',
    'country_of_destination',
    'country_of_origin',
    'currency_code',
    'exchange_rate',
    'discount_total',
    'freight_charges',
    'insurance_charges',
    'other_charges',
    'advance_received',
    'gst_route',
    'lut_no',
    'lut_date',
    'incoterm',
    'payment_terms',
    'delivery_terms',
    'end_use_code',
    'preferential_agreement',
    'mode',
    'shipping_bill_type',
    'shipping_bill_no',
    'shipping_bill_date',
    'port_of_discharge',
    'pre_carriage_by',
    'place_of_receipt',
    'place_of_delivery',
    'total_packages',
    'net_weight_kg',
    'gross_weight_kg',
    'bl_awb_no',
    'notes_to_buyer',
    'internal_notes',
    'declaration_text',
    'terms',
    'status',
];
const LINE_FIXED = [
    'voucher_no',
    'product_code',
    'product_name',
    'part_no',
    'description',
    'hsn_code',
    'customer_reference',
    'uom',
    'uqc_code',
    'qty',
    'unit_price',
    'discount_pct',
    'margin_pct',
    'tax_pct',
    'igst_rate_pct',
    'packages',
    'net_weight',
    'gross_weight',
];
const BANK_HEADERS = [
    'voucher_no',
    'bank_name',
    'account_no',
    'beneficiary',
    'ad_code',
    'swift_code',
    'branch',
    'currency_code',
];
const RECEIPT_HEADERS = [
    'invoice_voucher_no',
    'payment_date',
    'amount',
    'method',
    'reference',
    'notes',
];
const LINE_FIXED_SET = new Set(LINE_FIXED.map((h) => h.toLowerCase()));

const cell = (raw: Record<string, any>, col: string): string => {
    const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === col);
    return key ? String(raw[key] ?? '').trim() : '';
};
const cellRawOf = (raw: Record<string, any>, col: string): any => {
    const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === col);
    return key ? raw[key] : '';
};
const enumOk = (e: object, v: string) =>
    (Object.values(e) as string[]).includes(v);

export interface InvoiceImportDoc {
    voucher_no: string;
    rowNum: number;
    header: any; // create payload (minus lines), assembled below
    lines: any[];
    banks: any[];
    target_status: ENUM_INVOICE_STATUS;
    docStatus: 'valid_new' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
}

@Injectable()
export class InvoiceImportExportService {
    private readonly logger = new Logger(InvoiceImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly invoiceService: InvoiceService,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoiceLineRepository: InvoiceLineRepository,
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly productRepository: ProductRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly companyRepository: CompanyRepository
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

        const header: Record<string, any> = {};
        for (const h of HEADER_HEADERS) header[h] = '';
        Object.assign(header, {
            voucher_no: 'STIPL/INV/0001/2026-27',
            invoice_type: 'export',
            invoice_date: '20/04/2026',
            customer_name: 'Orient Global Trading LLC',
            country_of_destination: 'United Arab Emirates',
            country_of_origin: 'India',
            currency_code: 'USD',
            exchange_rate: '83',
            gst_route: 'lut_zero_rated',
            incoterm: 'FOB',
            mode: 'sea_fcl',
            shipping_bill_type: 'rodtep',
            port_of_discharge: 'Jebel Ali',
            status: 'issued',
        });
        const line: Record<string, any> = {};
        for (const h of LINE_FIXED) line[h] = '';
        Object.assign(line, {
            voucher_no: 'STIPL/INV/0001/2026-27',
            product_code: 'PRD-001',
            uom: 'KG',
            qty: '100',
            unit_price: '25',
            tax_pct: '0',
            igst_rate_pct: '0',
            hsn_code: '72061000',
        });
        for (const c of codeCols) line[c.header] = '';
        const bank: Record<string, any> = {};
        for (const h of BANK_HEADERS) bank[h] = '';
        Object.assign(bank, {
            voucher_no: 'STIPL/INV/0001/2026-27',
            bank_name: 'Bank of Baroda',
            account_no: '1234567890',
            swift_code: 'BARBINBB',
            currency_code: 'USD',
        });
        return this.fileService.writeExcel([
            { sheetName: 'Invoices', data: [header] },
            { sheetName: 'LineItems', data: [line] },
            { sheetName: 'Banks', data: [bank] },
        ] as any);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: InvoiceImportDoc[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel file.'
            );
        }
        const headerRows =
            pickSheet(sheets as any, ['Invoices', 'Invoice'], 0) || [];
        const lineRows = pickSheet(sheets as any, ['LineItems', 'Lines'], 1) || [];
        const bankRows = pickSheet(sheets as any, ['Banks', 'Bank'], 2) || [];
        if (!headerRows.length)
            throw new BadRequestException(
                'The "Invoices" sheet has no rows. Expected sheets: Invoices, LineItems, Banks.'
            );
        if (!lineRows.length)
            throw new BadRequestException('The "LineItems" sheet has no rows.');

        // ── Resolution maps ──
        const products = await this.productRepository.findByCompanyId(companyId);
        const productByCode = new Map<string, any>();
        for (const p of products as any[])
            if (p.code) productByCode.set(String(p.code).trim().toLowerCase(), p);
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const customerByName = new Map<string, any>();
        for (const c of customers)
            customerByName.set((c.company_name || '').trim().toLowerCase(), c);
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
            if (e.code) expenseByCode.set(String(e.code).trim().toLowerCase(), e);

        const salesOrders = (await this.poRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const soByVoucher = new Map<string, any>();
        for (const so of salesOrders)
            if (so.voucher_no)
                soByVoucher.set((so.voucher_no || '').trim().toLowerCase(), so);
        const quotations = (await this.quotationRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const qByVoucher = new Map<string, any>();
        for (const q of quotations)
            if (q.voucher_no)
                qByVoucher.set((q.voucher_no || '').trim().toLowerCase(), q);

        const existing = (await this.invoiceRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const existingVouchers = new Set<string>(
            existing.map((iv) => (iv.voucher_no || '').trim().toLowerCase())
        );

        // Bank rows grouped by voucher.
        const banksByVoucher = new Map<string, any[]>();
        for (const raw of bankRows as any[]) {
            const vno = cell(raw, 'voucher_no');
            if (!vno || !cell(raw, 'bank_name')) continue;
            const vkey = vno.toLowerCase();
            if (!banksByVoucher.has(vkey)) banksByVoucher.set(vkey, []);
            banksByVoucher.get(vkey).push({
                name: cell(raw, 'bank_name'),
                account_no: cell(raw, 'account_no'),
                beneficiary: cell(raw, 'beneficiary') || undefined,
                ad_code: cell(raw, 'ad_code') || undefined,
                swift_code: cell(raw, 'swift_code') || undefined,
                branch: cell(raw, 'branch') || undefined,
                currency_code: cell(raw, 'currency_code') || undefined,
            });
        }

        // Line rows grouped by voucher (resolved).
        const linesByVoucher = new Map<string, any[]>();
        const lineErrByVoucher = new Map<string, string[]>();
        const lineWarnByVoucher = new Map<string, string[]>();
        const pushLineErr = (v: string, m: string) => {
            if (!lineErrByVoucher.has(v)) lineErrByVoucher.set(v, []);
            lineErrByVoucher.get(v).push(m);
        };
        for (let i = 0; i < lineRows.length; i++) {
            const raw = lineRows[i] as Record<string, any>;
            const vno = cell(raw, 'voucher_no');
            if (!vno) continue;
            const vkey = vno.toLowerCase();
            const rowNum = i + 2;
            const productCode = cell(raw, 'product_code');
            if (!productCode) continue;
            const product = productByCode.get(productCode.toLowerCase());
            if (!product) {
                pushLineErr(
                    vkey,
                    `LineItems row ${rowNum}: product_code "${productCode}" not found`
                );
                continue;
            }
            const qty = cell(raw, 'qty');
            const unit_price = cell(raw, 'unit_price');
            if (!qty || !Number.isFinite(Number(qty)) || Number(qty) <= 0)
                pushLineErr(vkey, `LineItems row ${rowNum}: qty must be > 0`);
            if (
                !unit_price ||
                !Number.isFinite(Number(unit_price)) ||
                Number(unit_price) < 0
            )
                pushLineErr(
                    vkey,
                    `LineItems row ${rowNum}: unit_price is required and must be numeric`
                );

            // per-code rebate/expense snapshots
            const rebates: any[] = [];
            const expenses: any[] = [];
            for (const key of Object.keys(raw)) {
                if (LINE_FIXED_SET.has(key.trim().toLowerCase())) continue;
                const bare = key
                    .trim()
                    .replace(/\(%\)\s*$/, '')
                    .trim()
                    .toLowerCase();
                if (!bare) continue;
                const cr = raw[key];
                const em = expenseByCode.get(bare);
                if (em) {
                    if (cr === '' || cr === null || cr === undefined) continue;
                    expenses.push({
                        expense_id: em._id.toString(),
                        code: em.code,
                        name: em.name,
                        type: String(em.type || 'fixed').toLowerCase(),
                        value: String(Number(cr)),
                    });
                    continue;
                }
                const rm = rebateByCode.get(bare);
                if (rm) {
                    if (cr === '' || cr === null || cr === undefined) continue;
                    rebates.push({
                        rebate_id: rm._id.toString(),
                        code: rm.code,
                        name: rm.name,
                        type: String(rm.type || 'percent').toLowerCase(),
                        pct: String(Number(cr)),
                    });
                }
            }

            if (!linesByVoucher.has(vkey)) linesByVoucher.set(vkey, []);
            linesByVoucher.get(vkey).push({
                _productId: product._id.toString(),
                product_id: product._id.toString(),
                product_name: cell(raw, 'product_name') || undefined,
                product_code: product.code,
                part_no: cell(raw, 'part_no') || undefined,
                description: cell(raw, 'description') || undefined,
                hsn_code: cell(raw, 'hsn_code') || undefined,
                customer_reference: cell(raw, 'customer_reference') || undefined,
                unit: cell(raw, 'uom') || product.unit_of_measure || 'NOS',
                uqc_code: cell(raw, 'uqc_code') || undefined,
                qty,
                unit_price,
                discount_pct: cell(raw, 'discount_pct') || undefined,
                margin_pct: cell(raw, 'margin_pct') || undefined,
                tax_pct: cell(raw, 'tax_pct') || undefined,
                igst_rate_pct: cell(raw, 'igst_rate_pct') || undefined,
                packages: cell(raw, 'packages')
                    ? Number(cell(raw, 'packages'))
                    : undefined,
                net_weight: cell(raw, 'net_weight') || undefined,
                gross_weight: cell(raw, 'gross_weight') || undefined,
                product_rebates_snapshot: rebates,
                product_expenses_snapshot: expenses,
            });
        }

        // Per-customer address cache.
        const addrCache = new Map<string, any[]>();
        const loadAddrs = async (cid: string): Promise<any[]> => {
            if (addrCache.has(cid)) return addrCache.get(cid);
            const rows = (await this.customerAddressRepository.findByCustomerId(
                cid
            )) as any[];
            addrCache.set(cid, rows);
            return rows;
        };

        const seenVouchers = new Set<string>();
        const docs: InvoiceImportDoc[] = [];
        for (let i = 0; i < headerRows.length; i++) {
            const raw = headerRows[i] as Record<string, any>;
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];

            const voucher_no = cell(raw, 'voucher_no');
            const vkey = voucher_no.toLowerCase();
            if (!voucher_no) errors.push('voucher_no is required');
            else if (seenVouchers.has(vkey))
                errors.push('Duplicate voucher_no in the Invoices sheet');
            if (voucher_no) seenVouchers.add(vkey);

            const dateIso = parseDateCell(cellRawOf(raw, 'invoice_date'));
            if (!dateIso)
                errors.push('invoice_date is required and must be a valid date');

            const currency_code = cell(raw, 'currency_code').toUpperCase();
            if (!currency_code) errors.push('currency_code is required');
            else if (!/^[A-Z]{3}$/.test(currency_code))
                errors.push('currency_code must be 3 letters');

            // exchange_rate = ₹ per 1 <ccy> (human); store 1/x.
            let stored_er: string | undefined;
            const erInput = cell(raw, 'exchange_rate');
            if (currency_code === 'INR') stored_er = '1';
            else if (currency_code) {
                if (!erInput)
                    errors.push(
                        `exchange_rate (₹ per 1 ${currency_code}) is required for a foreign-currency invoice`
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

            // Customer (required).
            const customerName = cell(raw, 'customer_name');
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

            // Bill-to (policy A).
            let customer_address_id: string | undefined;
            if (customer_id) {
                const addrs = await loadAddrs(customer_id);
                const billTo = resolveBillTo(cell(raw, 'bill_to_address'), addrs);
                if (billTo.error) errors.push(billTo.error);
                else customer_address_id = billTo.id;
            }

            // Optional source links.
            let purchase_order_id: string | undefined;
            let so: any;
            const soVoucher = cell(raw, 'so_voucher_no');
            if (soVoucher) {
                so = soByVoucher.get(soVoucher.toLowerCase());
                if (!so)
                    warnings.push(
                        `so_voucher_no "${soVoucher}" not found — left unlinked`
                    );
                else purchase_order_id = so._id.toString();
            }
            let quotation_id: string | undefined;
            const qVoucher = cell(raw, 'quotation_voucher_no');
            if (qVoucher) {
                const q = qByVoucher.get(qVoucher.toLowerCase());
                if (!q)
                    warnings.push(
                        `quotation_voucher_no "${qVoucher}" not found — left unlinked`
                    );
                else quotation_id = q._id.toString();
            }

            // Enum validations.
            const invoice_type = cell(raw, 'invoice_type').toLowerCase();
            if (invoice_type && !enumOk(ENUM_INVOICE_TYPE, invoice_type))
                errors.push(`Invalid invoice_type "${invoice_type}"`);
            const gst_route = cell(raw, 'gst_route').toLowerCase();
            if (gst_route && !enumOk(ENUM_INVOICE_GST_ROUTE, gst_route))
                errors.push(`Invalid gst_route "${gst_route}"`);
            const mode = cell(raw, 'mode').toLowerCase();
            if (mode && !enumOk(ENUM_SHIPPING_MODE, mode))
                errors.push(`Invalid mode "${mode}"`);
            const sbType = cell(raw, 'shipping_bill_type').toLowerCase();
            if (sbType && !enumOk(ENUM_SHIPPING_BILL_TYPE, sbType))
                errors.push(`Invalid shipping_bill_type "${sbType}"`);

            let target_status = ENUM_INVOICE_STATUS.ISSUED;
            const statusRaw = cell(raw, 'status').toLowerCase();
            if (statusRaw) {
                if (enumOk(ENUM_INVOICE_STATUS, statusRaw))
                    target_status = statusRaw as ENUM_INVOICE_STATUS;
                else errors.push(`Invalid status "${statusRaw}"`);
            }

            // Lines for this voucher (resolve purchase_order_line_id from SO by
            // product when an SO is linked — decision-5: null when no SO).
            const baseLines = voucher_no ? linesByVoucher.get(vkey) || [] : [];
            errors.push(...(lineErrByVoucher.get(vkey) || []));
            warnings.push(...(lineWarnByVoucher.get(vkey) || []));
            if (!baseLines.length && !(lineErrByVoucher.get(vkey) || []).length)
                errors.push('No line items found for this voucher_no');

            let soLineByProduct = new Map<string, string>();
            if (purchase_order_id) {
                const soLines = (await this.poLineRepository.findAll({
                    purchase_order_id,
                } as any)) as any[];
                for (const sl of soLines) {
                    const pid = sl.product_id?.toString();
                    if (pid && !soLineByProduct.has(pid))
                        soLineByProduct.set(pid, sl._id.toString());
                }
            }
            const lines = baseLines.map((l) => ({
                ...l,
                purchase_order_line_id:
                    soLineByProduct.get(l._productId) || undefined,
                // Import sheets never carry a per-line source (vendor) currency
                // — default to the invoice's own document currency so
                // writeLines()'s `sourceCode === docCur` check takes the safe
                // 1:1 path instead of falling through to a live cross-currency
                // rate lookup (e.g. INR→USD, ~0.01) as an unwanted extra
                // conversion on top of an already-correct unit_price.
                source_currency_code: l.source_currency_code || currency_code,
            }));

            const alreadyExists = !!voucher_no && existingVouchers.has(vkey);
            let docStatus: InvoiceImportDoc['docStatus'];
            if (errors.length) docStatus = 'error';
            else if (alreadyExists) docStatus = 'skip';
            else docStatus = 'valid_new';

            // Assemble the create payload (header).
            const header: any = {
                invoice_type: invoice_type || undefined,
                invoice_date: dateIso || '',
                due_date: parseDateCell(cellRawOf(raw, 'due_date')) || undefined,
                customer_po_no: cell(raw, 'customer_po_no') || undefined,
                purchase_order_id,
                quotation_id,
                customer_id,
                customer_address_id,
                consignee_snapshot: this.snap(
                    cell(raw, 'consignee_name'),
                    cell(raw, 'consignee_address')
                ),
                notify_party_snapshot: this.snap(
                    cell(raw, 'notify_party_name'),
                    cell(raw, 'notify_party_address')
                ),
                country_of_destination:
                    cell(raw, 'country_of_destination') || undefined,
                country_of_origin: cell(raw, 'country_of_origin') || undefined,
                currency_code,
                exchange_rate: stored_er,
                discount_total: cell(raw, 'discount_total') || undefined,
                freight_charges: cell(raw, 'freight_charges') || undefined,
                insurance_charges: cell(raw, 'insurance_charges') || undefined,
                other_charges: cell(raw, 'other_charges') || undefined,
                advance_received: cell(raw, 'advance_received') || undefined,
                gst_route: gst_route || undefined,
                lut_no: cell(raw, 'lut_no') || undefined,
                lut_date: parseDateCell(cellRawOf(raw, 'lut_date')) || undefined,
                incoterm: cell(raw, 'incoterm') || undefined,
                payment_terms: cell(raw, 'payment_terms') || undefined,
                delivery_terms: cell(raw, 'delivery_terms') || undefined,
                end_use_code: cell(raw, 'end_use_code') || undefined,
                preferential_agreement:
                    cell(raw, 'preferential_agreement') || undefined,
                mode: mode || undefined,
                shipping_bill_type: sbType || undefined,
                shipping_bill_no: cell(raw, 'shipping_bill_no') || undefined,
                shipping_bill_date:
                    parseDateCell(cellRawOf(raw, 'shipping_bill_date')) ||
                    undefined,
                port_of_discharge_snapshot: cell(raw, 'port_of_discharge')
                    ? { name: cell(raw, 'port_of_discharge') }
                    : undefined,
                pre_carriage_by: cell(raw, 'pre_carriage_by') || undefined,
                place_of_receipt: cell(raw, 'place_of_receipt') || undefined,
                place_of_delivery: cell(raw, 'place_of_delivery') || undefined,
                total_packages: cell(raw, 'total_packages')
                    ? Number(cell(raw, 'total_packages'))
                    : undefined,
                net_weight_kg: cell(raw, 'net_weight_kg') || undefined,
                gross_weight_kg: cell(raw, 'gross_weight_kg') || undefined,
                bl_awb_no: cell(raw, 'bl_awb_no') || undefined,
                bank_snapshots: banksByVoucher.get(vkey) || undefined,
                notes_to_buyer: cell(raw, 'notes_to_buyer') || undefined,
                internal_notes: cell(raw, 'internal_notes') || undefined,
                declaration_text: cell(raw, 'declaration_text') || undefined,
                terms: cell(raw, 'terms') || undefined,
            };

            docs.push({
                voucher_no,
                rowNum,
                header,
                lines,
                banks: banksByVoucher.get(vkey) || [],
                target_status,
                docStatus,
                errors,
                warnings,
            });
        }

        const summary = {
            total: docs.length,
            valid_new: docs.filter((d) => d.docStatus === 'valid_new').length,
            valid_update: 0,
            skipped: docs.filter((d) => d.docStatus === 'skip').length,
            errors: docs.filter((d) => d.docStatus === 'error').length,
            warnings: docs.reduce((n, d) => n + d.warnings.length, 0),
        };
        return { summary, rows: docs };
    }

    private snap(name: string, address: string): any {
        if (!name && !address) return undefined;
        return {
            name: name || undefined,
            address_line1: address || undefined,
        };
    }

    async importInvoices(
        docs: InvoiceImportDoc[],
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

        // port_of_loading comes from the company profile (default).
        const company: any = await this.companyRepository
            .findOneById(companyId)
            .catch(() => null);
        const polId = company?.default_port_of_loading_id || undefined;
        const polSnap = company?.default_port_of_loading_snapshot || undefined;

        const importCtx: ImportContext = { silent: true };
        for (const doc of docs) {
            if (doc.docStatus === 'skip') {
                skipped++;
                continue;
            }
            if (doc.docStatus !== 'valid_new') continue;
            try {
                const payload = {
                    ...doc.header,
                    port_of_loading_id: polId,
                    port_of_loading_snapshot: polSnap,
                    lines: doc.lines.map((l) => {
                        const { _productId, ...line } = l;
                        return line;
                    }),
                };
                const draft = await this.invoiceService.create(
                    companyId,
                    payload as any,
                    userId,
                    { voucher_no: doc.voucher_no, silent: true }
                );

                // Land the real status. create() always makes a DRAFT; issue()
                // in import mode preserves the voucher + snapshots grand_total_inr
                // and does NOT move stock. paid/partially_paid come from Phase 5
                // receipts; here we take it to ISSUED (or cancel).
                if (doc.target_status !== ENUM_INVOICE_STATUS.DRAFT) {
                    const issued = await this.invoiceService.issue(
                        draft as any,
                        userId,
                        importCtx
                    );
                    if (
                        doc.target_status === ENUM_INVOICE_STATUS.CANCELLED
                    ) {
                        await this.invoiceService.cancel(
                            issued as any,
                            'Imported as cancelled',
                            userId
                        );
                    }
                }
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Invoice import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    /** Export invoices to the same 4-sheet shape. */
    async exportInvoices(companyId: string): Promise<Buffer> {
        const invoices = (await this.invoiceRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];

        const products = await this.productRepository.findByCompanyId(companyId);
        const codeById = new Map<string, string>();
        for (const p of products as any[])
            codeById.set(p._id.toString(), p.code || '');
        const customers = (await this.customerRepository.findByCompanyId(
            companyId
        )) as any[];
        const custNameById = new Map<string, string>();
        for (const c of customers)
            custNameById.set(c._id.toString(), c.company_name || '');
        const addrById = new Map<string, string>();
        const allAddrs = (await this.customerAddressRepository.findByCustomerIds(
            customers.map((c) => c._id.toString())
        )) as any[];
        for (const a of allAddrs)
            addrById.set(a._id.toString(), formatAddressText(a));
        const salesOrders = (await this.poRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const soVoucherById = new Map<string, string>();
        for (const so of salesOrders)
            soVoucherById.set(so._id.toString(), so.voucher_no || '');
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
        const invRate = (v: any): string => {
            const n = Number(v);
            return Number.isFinite(n) && n > 0
                ? String(Math.round((1 / n) * 10000) / 10000)
                : '';
        };

        const headerData: any[] = [];
        const lineData: any[] = [];
        const bankData: any[] = [];
        for (const iv of invoices) {
            const h: any = {};
            for (const k of HEADER_HEADERS) h[k] = '';
            Object.assign(h, {
                voucher_no: iv.voucher_no || '',
                invoice_type: iv.invoice_type || '',
                invoice_date: isoDate(iv.invoice_date),
                due_date: isoDate(iv.due_date),
                customer_po_no: iv.customer_po_no || '',
                so_voucher_no:
                    soVoucherById.get(iv.purchase_order_id?.toString()) || '',
                customer_name: custNameById.get(iv.customer_id?.toString()) || '',
                bill_to_address:
                    addrById.get(iv.customer_address_id?.toString()) || '',
                consignee_name: iv.consignee_snapshot?.name || '',
                consignee_address: iv.consignee_snapshot?.address_line1 || '',
                notify_party_name: iv.notify_party_snapshot?.name || '',
                notify_party_address:
                    iv.notify_party_snapshot?.address_line1 || '',
                country_of_destination: iv.country_of_destination || '',
                country_of_origin: iv.country_of_origin || '',
                currency_code: iv.currency_code || '',
                exchange_rate: invRate(iv.exchange_rate),
                discount_total: iv.discount_total || '',
                freight_charges: iv.freight_charges || '',
                insurance_charges: iv.insurance_charges || '',
                other_charges: iv.other_charges || '',
                advance_received: iv.advance_received || '',
                gst_route: iv.gst_route || '',
                lut_no: iv.lut_no || '',
                lut_date: isoDate(iv.lut_date),
                incoterm: iv.incoterm || '',
                payment_terms: iv.payment_terms || '',
                delivery_terms: iv.delivery_terms || '',
                end_use_code: iv.end_use_code || '',
                preferential_agreement: iv.preferential_agreement || '',
                mode: iv.mode || '',
                shipping_bill_type: iv.shipping_bill_type || '',
                shipping_bill_no: iv.shipping_bill_no || '',
                shipping_bill_date: isoDate(iv.shipping_bill_date),
                port_of_discharge: iv.port_of_discharge_snapshot?.name || '',
                pre_carriage_by: iv.pre_carriage_by || '',
                place_of_receipt: iv.place_of_receipt || '',
                place_of_delivery: iv.place_of_delivery || '',
                total_packages: iv.total_packages ?? '',
                net_weight_kg: iv.net_weight_kg || '',
                gross_weight_kg: iv.gross_weight_kg || '',
                bl_awb_no: iv.bl_awb_no || '',
                notes_to_buyer: iv.notes_to_buyer || '',
                internal_notes: iv.internal_notes || '',
                declaration_text: iv.declaration_text || '',
                terms: iv.terms || '',
                status: iv.status || '',
            });
            headerData.push(h);

            const lines = (await this.invoiceLineRepository.findByInvoiceId(
                iv._id.toString()
            )) as any[];
            for (const ln of lines) {
                const row: any = {
                    voucher_no: iv.voucher_no || '',
                    product_code:
                        ln.product_code ||
                        codeById.get(ln.product_id?.toString()) ||
                        '',
                    product_name: ln.product_name || '',
                    part_no: ln.part_no || '',
                    description: ln.description || '',
                    hsn_code: ln.hsn_code || '',
                    customer_reference: ln.customer_reference || '',
                    uom: ln.unit || '',
                    uqc_code: ln.uqc_code || '',
                    qty: ln.qty ?? '',
                    unit_price: ln.unit_price ?? '',
                    discount_pct: ln.discount_pct ?? '',
                    margin_pct: ln.margin_pct ?? '',
                    tax_pct: ln.tax_pct ?? '',
                    igst_rate_pct: ln.igst_rate_pct ?? '',
                    packages: ln.packages ?? '',
                    net_weight: ln.net_weight ?? '',
                    gross_weight: ln.gross_weight ?? '',
                };
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
            for (const b of iv.bank_snapshots || []) {
                bankData.push({
                    voucher_no: iv.voucher_no || '',
                    bank_name: b.name || '',
                    account_no: b.account_no || '',
                    beneficiary: b.beneficiary || '',
                    ad_code: b.ad_code || '',
                    swift_code: b.swift_code || '',
                    branch: b.branch || '',
                    currency_code: b.currency_code || '',
                });
            }
        }
        const tmpl = (cols: string[], extra: string[] = []) => {
            const o: any = {};
            for (const c of [...cols, ...extra]) o[c] = '';
            return o;
        };
        return this.fileService.writeExcel([
            {
                sheetName: 'Invoices',
                data: headerData.length ? headerData : [tmpl(HEADER_HEADERS)],
            },
            {
                sheetName: 'LineItems',
                data: lineData.length
                    ? lineData
                    : [tmpl(LINE_FIXED, codeCols.map((c) => c.header))],
            },
            {
                sheetName: 'Banks',
                data: bankData.length ? bankData : [tmpl(BANK_HEADERS)],
            },
        ] as any);
    }

    // ════════════════════════════════════════════════════════════════════
    // RECEIPTS (customer payments against invoices) — flat single sheet.
    // Flips issued invoices to partially_paid / paid so the ledgers + Sales-
    // Turnover "Received" reconcile. Idempotent: a receipt matching an existing
    // (invoice, date, amount) non-voided payment is SKIPPED.
    // ════════════════════════════════════════════════════════════════════

    generateReceiptSample(): Buffer {
        const rows = [
            [...RECEIPT_HEADERS],
            [
                'STIPL/INV/0001/2026-27',
                '15/05/2026',
                '2075',
                'bank_transfer',
                'SWIFT-88123',
                'Full payment',
            ],
        ];
        return this.fileService.writeExcelFromArray(rows);
    }

    async parseReceipts(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: any[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException('Unable to read the file.');
        }
        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length)
            throw new BadRequestException('The file contains no data rows.');

        const invoices = (await this.invoiceRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const invByVoucher = new Map<string, any>();
        for (const iv of invoices)
            if (iv.voucher_no)
                invByVoucher.set((iv.voucher_no || '').trim().toLowerCase(), iv);

        // Existing (invoice, date|amount) keys for idempotency + prior-paid sum
        // (to validate the running balance in the PREVIEW, so an over-payment
        // shows as an error here instead of silently failing on commit).
        const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
        const payCache = new Map<string, Set<string>>();
        const priorPaidCache = new Map<string, number>();
        const runningByInvoice = new Map<string, number>();
        const existingKeys = async (invoiceId: string): Promise<Set<string>> => {
            if (payCache.has(invoiceId)) return payCache.get(invoiceId);
            const pays = (await this.invoicePaymentRepository.findActiveByInvoiceId(
                invoiceId
            )) as any[];
            const set = new Set<string>(
                pays.map(
                    (p) =>
                        `${String(p.payment_date).slice(0, 10)}|${Number(
                            p.amount
                        )}`
                )
            );
            payCache.set(invoiceId, set);
            priorPaidCache.set(
                invoiceId,
                pays.reduce((s, p) => s + Number(p.amount || 0), 0)
            );
            return set;
        };

        const rows: any[] = [];
        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2;
            const errors: string[] = [];
            const voucher = cell(raw, 'invoice_voucher_no');
            const dateIso = parseDateCell(cellRawOf(raw, 'payment_date'));
            const amountStr = cell(raw, 'amount');
            const amountNum = Number(amountStr);

            if (!voucher) errors.push('invoice_voucher_no is required');
            if (!dateIso) errors.push('payment_date is required / invalid');
            if (
                !amountStr ||
                !Number.isFinite(amountNum) ||
                amountNum <= 0
            )
                errors.push('amount must be greater than 0');
            const inv = voucher
                ? invByVoucher.get(voucher.toLowerCase())
                : null;
            if (voucher && !inv)
                errors.push(`invoice_voucher_no "${voucher}" not found`);

            let status: 'valid_new' | 'skip' | 'error' = 'valid_new';
            if (inv && !errors.length) {
                const invId = inv._id.toString();
                const keys = await existingKeys(invId); // also fills prior-paid
                const dupKey = `${dateIso}|${amountNum}`;
                if (keys.has(dupKey)) {
                    status = 'skip'; // idempotent re-run — never errors
                } else if (
                    inv.status !== ENUM_INVOICE_STATUS.ISSUED &&
                    inv.status !== ENUM_INVOICE_STATUS.PARTIALLY_PAID
                ) {
                    errors.push(
                        `invoice "${voucher}" is ${inv.status} — only issued / partially-paid invoices can take a receipt`
                    );
                } else {
                    const priorPaid = priorPaidCache.get(invId) || 0;
                    const running = runningByInvoice.get(invId) || 0;
                    // Adjustment Notes applied to the invoice settle part of
                    // it, so they lower the ceiling here too — mirrors
                    // InvoiceService.recordPayment.
                    const outstanding =
                        Number(inv.grand_total) -
                        Number(inv.adjustment_total || 0) -
                        priorPaid -
                        running;
                    if (amountNum > outstanding + 0.01) {
                        errors.push(
                            `amount ${amountNum} exceeds the invoice's outstanding balance ${r2(
                                outstanding
                            )} (${inv.currency_code || ''})`
                        );
                    } else {
                        runningByInvoice.set(invId, running + amountNum);
                    }
                }
            }
            if (errors.length) status = 'error';

            rows.push({
                rowNum,
                invoice_voucher_no: voucher,
                invoice_id: inv?._id?.toString(),
                payment_date: dateIso,
                amount: amountStr,
                method: cell(raw, 'method') || undefined,
                reference: cell(raw, 'reference') || undefined,
                notes: cell(raw, 'notes') || undefined,
                status,
                errors,
            });
        }
        const summary = {
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            skipped: rows.filter((r) => r.status === 'skip').length,
            errors: rows.filter((r) => r.status === 'error').length,
        };
        return { summary, rows };
    }

    async importReceipts(
        rows: any[],
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
        for (const r of rows) {
            if (r.status === 'skip') {
                skipped++;
                continue;
            }
            if (r.status !== 'valid_new') continue;
            try {
                const invoice = await this.invoiceRepository.findOneById(
                    r.invoice_id
                );
                await this.invoiceService.recordPayment(
                    invoice as any,
                    {
                        payment_date: r.payment_date,
                        amount: String(r.amount),
                        method: r.method,
                        reference: r.reference,
                        notes: r.notes,
                    } as any,
                    userId
                );
                created++;
            } catch (err: any) {
                errors.push({
                    row: r.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    async exportReceipts(companyId: string): Promise<Buffer> {
        const invoices = (await this.invoiceRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const aoa: any[][] = [[...RECEIPT_HEADERS]];
        for (const iv of invoices) {
            const pays = (await this.invoicePaymentRepository.findActiveByInvoiceId(
                iv._id.toString()
            )) as any[];
            for (const p of pays) {
                aoa.push([
                    iv.voucher_no || '',
                    String(p.payment_date).slice(0, 10),
                    p.amount ?? '',
                    p.method || '',
                    p.reference || '',
                    p.notes || '',
                ]);
            }
        }
        return this.fileService.writeExcelFromArray(aoa);
    }
}
