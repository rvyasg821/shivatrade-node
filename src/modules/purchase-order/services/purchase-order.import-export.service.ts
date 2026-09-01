import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderRepository } from '../repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '../repository/repositories/purchase-order-line.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { ENUM_PURCHASE_ORDER_STATUS } from '../enums/purchase-order.enum';
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

// Sales Order (purchase-order) TWO-SHEET import — same design + line format as
// Quotation. Sheet "SalesOrders" = one row per SO; sheet "LineItems" = the same
// full costing lines (SO carries vendor_code too). SO-specific header fields:
// customer_po_number, expected_delivery_date, dispatched_through, remarks,
// advance_*, and quotation_voucher_no (source link). Each line is tied to the
// matching source quotation line (source_quotation_line_id) when a quotation is
// linked. Bill-to mismatch → per-document error (policy A). Idempotent skip.
const HEADER_HEADERS = [
    'voucher_no',
    'po_date',
    'customer_name',
    'bill_to_address',
    'consignee_same_as_buyer',
    'consignee_name',
    'consignee_address',
    'quotation_voucher_no',
    'currency_code',
    'exchange_rate',
    'expected_delivery_date',
    'customer_po_number',
    'payment_terms',
    'delivery_terms',
    'dispatched_through',
    'freight_total',
    'internal_notes',
    'remarks',
    'advance_amount',
    'advance_date',
    'advance_notes',
    'status',
];

interface SoHeader {
    po_date: string;
    customer_id?: string;
    customer_name?: string;
    customer_address_id?: string;
    consignee_same_as_buyer: boolean;
    consignee_snapshot?: any;
    quotation_id?: string;
    currency_code: string;
    exchange_rate?: string;
    expected_delivery_date?: string;
    customer_po_number?: string;
    payment_terms?: string;
    delivery_terms?: string;
    dispatched_through?: string;
    freight_total?: string;
    internal_notes?: string;
    remarks?: string;
    advance_amount?: string;
    advance_date?: string;
    advance_notes?: string;
    status: ENUM_PURCHASE_ORDER_STATUS;
}

export interface SoImportDoc {
    voucher_no: string;
    rowNum: number;
    header: SoHeader;
    lines: ResolvedDocLine[];
    status: 'valid_new' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
}

const YES = new Set(['yes', 'y', 'true', '1', 'same', 'same as buyer']);
const NO = new Set(['no', 'n', 'false', '0']);

@Injectable()
export class PurchaseOrderImportExportService {
    private readonly logger = new Logger(
        PurchaseOrderImportExportService.name
    );

    constructor(
        private readonly fileService: FileService,
        private readonly poService: PurchaseOrderService,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
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

        const header: Record<string, any> = {
            voucher_no: 'STIPL/SO/0001/2026-27',
            po_date: '18/04/2026',
            customer_name: 'Orient Global Trading LLC',
            bill_to_address: '',
            consignee_same_as_buyer: 'yes',
            consignee_name: '',
            consignee_address: '',
            quotation_voucher_no: 'STIPL/QT0001/2026-27',
            currency_code: 'USD',
            exchange_rate: '83', // ₹ per 1 USD (human-friendly, like the UI)
            expected_delivery_date: '30/04/2026',
            customer_po_number: 'PO-778',
            payment_terms: '100% advance',
            delivery_terms: 'FOB',
            dispatched_through: 'Sea',
            freight_total: '50', // in the SO's currency (USD)
            internal_notes: 'Backfilled from paper SO',
            remarks: '1 100% advance along with PO.\n2 Partial shipment allowed.',
            advance_amount: '0',
            advance_date: '',
            advance_notes: '',
            status: 'confirmed',
        };
        const line: Record<string, any> = {
            voucher_no: 'STIPL/SO/0001/2026-27',
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
                line[c.header] = firstReb ? '2' : '';
                firstReb = false;
            } else {
                line[c.header] = firstExp ? '500' : '';
                firstExp = false;
            }
        }
        return this.fileService.writeExcel([
            { sheetName: 'SalesOrders', data: [header] },
            { sheetName: 'LineItems', data: [line] },
        ] as any);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: SoImportDoc[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.'
            );
        }
        const headerRows =
            pickSheet(sheets as any, ['SalesOrders', 'SalesOrder', 'Orders'], 0) ||
            [];
        const lineRows =
            pickSheet(sheets as any, ['LineItems', 'Lines'], 1) || [];
        if (!headerRows.length)
            throw new BadRequestException(
                'The "SalesOrders" sheet has no rows. Expected a header sheet (one row per SO) and a "LineItems" sheet.'
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

        const quotations = (await this.quotationRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const quotationByVoucher = new Map<string, any>();
        for (const q of quotations)
            if (q.voucher_no)
                quotationByVoucher.set(
                    (q.voucher_no || '').trim().toLowerCase(),
                    q
                );

        const existingSo = (await this.poRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const existingVouchers = new Set<string>(
            existingSo.map((s) => (s.voucher_no || '').trim().toLowerCase())
        );

        const parsedLines = parseLineItemsSheet(lineRows as any, {
            productByCode,
            vendorByCode,
            rebateByCode,
            expenseByCode,
        });

        const addrCache = new Map<string, any[]>();
        const loadAddrs = async (customerId: string): Promise<any[]> => {
            if (addrCache.has(customerId)) return addrCache.get(customerId);
            const rows = (await this.customerAddressRepository.findByCustomerId(
                customerId
            )) as any[];
            addrCache.set(customerId, rows);
            return rows;
        };

        // product_id → first quotation_line_id, per linked quotation.
        const qLineMapCache = new Map<string, Map<string, string>>();
        const loadQLineMap = async (
            quotationId: string
        ): Promise<Map<string, string>> => {
            if (qLineMapCache.has(quotationId))
                return qLineMapCache.get(quotationId);
            const qLines = (await this.quotationLineRepository.findAll({
                quotation_id: quotationId,
            } as any)) as any[];
            const m = new Map<string, string>();
            for (const ql of qLines) {
                const pid = ql.product_id?.toString();
                if (pid && !m.has(pid)) m.set(pid, ql._id.toString());
            }
            qLineMapCache.set(quotationId, m);
            return m;
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
        const docs: SoImportDoc[] = [];

        for (let i = 0; i < headerRows.length; i++) {
            const raw = headerRows[i] as Record<string, any>;
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];

            const voucher_no = get(raw, 'voucher_no');
            const vkey = voucher_no.toLowerCase();
            if (!voucher_no) errors.push('voucher_no is required');
            else if (seenVouchers.has(vkey))
                errors.push('Duplicate voucher_no in the SalesOrders sheet');
            if (voucher_no) seenVouchers.add(vkey);

            const dateIso = parseDateCell(getRaw(raw, 'po_date'));
            if (!dateIso)
                errors.push(
                    'po_date is required and must be a valid date (DD/MM/YYYY or YYYY-MM-DD)'
                );

            // Source quotation link (optional).
            let quotation: any;
            let quotation_id: string | undefined;
            const qVoucher = get(raw, 'quotation_voucher_no');
            if (qVoucher) {
                quotation = quotationByVoucher.get(qVoucher.toLowerCase());
                if (!quotation)
                    warnings.push(
                        `quotation_voucher_no "${qVoucher}" not found — left unlinked`
                    );
                else quotation_id = quotation._id.toString();
            }

            // Customer (by name), else inherit from linked quotation.
            const customerName = get(raw, 'customer_name');
            let customer_id: string | undefined;
            if (customerName) {
                const c = customerByName.get(customerName.toLowerCase());
                if (!c)
                    errors.push(
                        `customer_name "${customerName}" not found (import Customers first)`
                    );
                else customer_id = c._id.toString();
            } else if (quotation?.customer_id) {
                customer_id = quotation.customer_id.toString();
            }
            if (!customer_id)
                errors.push(
                    'customer_name is required (or a resolvable quotation_voucher_no that carries the customer)'
                );

            // Bill-to (policy A).
            let customer_address_id: string | undefined;
            if (customer_id) {
                const addrs = await loadAddrs(customer_id);
                const billTo = resolveBillTo(get(raw, 'bill_to_address'), addrs);
                if (billTo.error) errors.push(billTo.error);
                else customer_address_id = billTo.id;
            }

            // Consignee.
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

            // currency / exchange — sheet wins, else inherit the quotation.
            let currency_code =
                get(raw, 'currency_code').toUpperCase() ||
                (quotation?.currency_code
                    ? String(quotation.currency_code).toUpperCase()
                    : '') ||
                'INR';
            if (!/^[A-Z]{3}$/.test(currency_code)) {
                errors.push('currency_code must be 3 letters (e.g. USD)');
                currency_code = 'INR';
            }
            // exchange_rate column is HUMAN-friendly "₹ per 1 <currency>" (like
            // the UI). Stored inverse = foreign-per-₹1. A linked quotation's
            // stored rate is inherited AS-IS (already inverse) when the sheet
            // leaves the cell blank.
            let stored_er: string | undefined;
            const erInput = get(raw, 'exchange_rate');
            if (currency_code === 'INR') {
                stored_er = '1';
            } else if (erInput) {
                const r = Number(erInput);
                if (!Number.isFinite(r) || r <= 0)
                    errors.push(
                        `exchange_rate must be a positive number (₹ per 1 ${currency_code})`
                    );
                else stored_er = String(1 / r);
            } else if (quotation?.exchange_rate) {
                stored_er = String(quotation.exchange_rate);
            } else if (currency_code) {
                errors.push(
                    `exchange_rate (₹ per 1 ${currency_code}) is required for a foreign-currency sales order`
                );
            }

            // status
            let status = ENUM_PURCHASE_ORDER_STATUS.DRAFT;
            const statusRaw = get(raw, 'status').toLowerCase();
            if (statusRaw) {
                if (
                    (
                        Object.values(ENUM_PURCHASE_ORDER_STATUS) as string[]
                    ).includes(statusRaw)
                )
                    status = statusRaw as ENUM_PURCHASE_ORDER_STATUS;
                else
                    errors.push(
                        `Invalid status "${statusRaw}" (expected ${Object.values(
                            ENUM_PURCHASE_ORDER_STATUS
                        ).join(', ')})`
                    );
            }

            // Lines + tie each to the matching source quotation line.
            const baseLines = voucher_no
                ? parsedLines.byVoucher.get(vkey) || []
                : [];
            const lineErrors = parsedLines.errorsByVoucher.get(vkey) || [];
            const lineWarnings = parsedLines.warningsByVoucher.get(vkey) || [];
            errors.push(...lineErrors);
            warnings.push(...lineWarnings);
            if (!baseLines.length && !lineErrors.length)
                errors.push(
                    'No line items found for this voucher_no in the "LineItems" sheet'
                );

            let lines = baseLines;
            if (quotation_id && baseLines.length) {
                const qMap = await loadQLineMap(quotation_id);
                lines = baseLines.map((l) => ({
                    ...l,
                    source_quotation_line_id: qMap.get(l.product_id),
                }));
            }
            // Import sheets never carry a per-line source (vendor) currency —
            // default to the SO's own document currency so the create path's
            // `sourceCode === docCur` check takes the safe 1:1 path instead of
            // falling through to a live cross-currency rate lookup (e.g.
            // INR→USD, ~0.01) as an unwanted extra conversion on top of an
            // already-correct unit_price. Same bug/fix as the Invoice import.
            lines = lines.map((l) => ({
                ...l,
                source_currency_code:
                    (l as any).source_currency_code || currency_code,
            }));

            const alreadyExists = !!voucher_no && existingVouchers.has(vkey);
            let docStatus: SoImportDoc['status'];
            if (errors.length) docStatus = 'error';
            else if (alreadyExists) docStatus = 'skip';
            else docStatus = 'valid_new';

            docs.push({
                voucher_no,
                rowNum,
                header: {
                    po_date: dateIso || '',
                    customer_id,
                    customer_name: customerName || undefined,
                    customer_address_id,
                    consignee_same_as_buyer,
                    consignee_snapshot,
                    quotation_id,
                    currency_code,
                    exchange_rate: stored_er,
                    expected_delivery_date:
                        parseDateCell(getRaw(raw, 'expected_delivery_date')) ||
                        undefined,
                    customer_po_number:
                        get(raw, 'customer_po_number') || undefined,
                    payment_terms: get(raw, 'payment_terms') || undefined,
                    delivery_terms: get(raw, 'delivery_terms') || undefined,
                    dispatched_through:
                        get(raw, 'dispatched_through') || undefined,
                    freight_total: get(raw, 'freight_total') || undefined,
                    internal_notes: get(raw, 'internal_notes') || undefined,
                    remarks: get(raw, 'remarks') || undefined,
                    advance_amount: get(raw, 'advance_amount') || undefined,
                    advance_date:
                        parseDateCell(getRaw(raw, 'advance_date')) || undefined,
                    advance_notes: get(raw, 'advance_notes') || undefined,
                    status,
                },
                lines,
                status: docStatus,
                errors,
                warnings,
            });
        }

        const headerVouchers = new Set(
            docs.map((d) => d.voucher_no.toLowerCase())
        );
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

    async importSalesOrders(
        docs: SoImportDoc[],
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
                await this.poService.create(
                    companyId,
                    {
                        customer_id: h.customer_id,
                        customer_address_id: h.customer_address_id,
                        consignee_same_as_buyer: h.consignee_same_as_buyer,
                        consignee_snapshot: h.consignee_snapshot,
                        quotation_id: h.quotation_id,
                        po_date: h.po_date,
                        expected_delivery_date: h.expected_delivery_date,
                        customer_po_number: h.customer_po_number,
                        advance_amount: h.advance_amount,
                        advance_date: h.advance_date,
                        advance_notes: h.advance_notes,
                        currency_code: h.currency_code,
                        exchange_rate: h.exchange_rate,
                        freight_total: h.freight_total,
                        payment_terms: h.payment_terms,
                        delivery_terms: h.delivery_terms,
                        dispatched_through: h.dispatched_through,
                        internal_notes: h.internal_notes,
                        remarks: h.remarks,
                        status: h.status,
                        lines: doc.lines.map((l) => ({
                            product_id: l.product_id,
                            vendor_id: l.vendor_id,
                            source_quotation_line_id: (l as any)
                                .source_quotation_line_id,
                            qty: l.qty,
                            unit: l.unit,
                            unit_price: l.unit_price,
                            source_currency_code: (l as any)
                                .source_currency_code,
                            discount_pct: l.discount_pct,
                            tax_pct: l.tax_pct,
                            margin_pct: l.margin_pct,
                            part_no: l.part_no,
                            hsn_code: l.hs_code,
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
                    `Sales Order import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    /** Export Sales Orders to the same two-sheet shape. */
    async exportSalesOrders(companyId: string): Promise<Buffer> {
        const orders = (await this.poRepository.findAll({
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
        const quotations = (await this.quotationRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const qVoucherById = new Map<string, string>();
        for (const q of quotations)
            qVoucherById.set(q._id.toString(), q.voucher_no || '');

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
        const invRate = (v: any): string => {
            const n = Number(v);
            return Number.isFinite(n) && n > 0
                ? String(Math.round((1 / n) * 10000) / 10000)
                : '';
        };

        const headerData: any[] = [];
        const lineData: any[] = [];
        for (const so of orders) {
            headerData.push({
                voucher_no: so.voucher_no || '',
                po_date: isoDate(so.po_date),
                customer_name: custNameById.get(so.customer_id?.toString()) || '',
                bill_to_address:
                    addrById.get(so.customer_address_id?.toString()) || '',
                consignee_same_as_buyer: so.consignee_same_as_buyer
                    ? 'yes'
                    : 'no',
                consignee_name: so.consignee_snapshot?.name || '',
                consignee_address: so.consignee_snapshot?.address_line1 || '',
                quotation_voucher_no:
                    qVoucherById.get(so.quotation_id?.toString()) || '',
                currency_code: so.currency_code || '',
                // Export as ₹ per 1 <currency> (inverse of the stored rate).
                exchange_rate: invRate(so.exchange_rate),
                expected_delivery_date: isoDate(so.expected_delivery_date),
                customer_po_number: so.customer_po_number || '',
                payment_terms: so.payment_terms || '',
                delivery_terms: so.delivery_terms || '',
                dispatched_through: so.dispatched_through || '',
                freight_total: so.freight_total || '',
                internal_notes: so.internal_notes || '',
                remarks: so.remarks || '',
                advance_amount: so.advance_amount || '',
                advance_date: isoDate(so.advance_date),
                advance_notes: so.advance_notes || '',
                status: so.status || '',
            });
            const lines = (await this.poLineRepository.findAll({
                purchase_order_id: so._id.toString(),
            } as any)) as any[];
            for (const ln of lines) {
                const row: any = {
                    voucher_no: so.voucher_no || '',
                    product_code: codeById.get(ln.product_id?.toString()) || '',
                    vendor_code:
                        vendorCodeById.get(ln.vendor_id?.toString()) || '',
                    qty: ln.qty ?? '',
                    unit_price: ln.unit_price ?? '',
                    discount_pct: ln.discount_pct ?? '',
                    tax_pct: ln.tax_pct ?? '',
                    margin_pct: ln.margin_pct ?? '',
                    part_no: ln.part_no ?? '',
                    hs_code: ln.hsn_code ?? '',
                    unit: ln.unit ?? '',
                    description: ln.description ?? '',
                    customer_reference: ln.customer_reference ?? '',
                    net_weight_kg: ln.net_weight_kg ?? '',
                    gross_weight_kg: ln.gross_weight_kg ?? '',
                    package_count: ln.package_count ?? '',
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
        }
        const headerTemplate: any = {};
        for (const h of HEADER_HEADERS) headerTemplate[h] = '';
        const lineTemplate: any = {};
        for (const h of LINE_ITEM_FIXED_HEADERS) lineTemplate[h] = '';
        for (const c of codeCols) lineTemplate[c.header] = '';

        return this.fileService.writeExcel([
            {
                sheetName: 'SalesOrders',
                data: headerData.length ? headerData : [headerTemplate],
            },
            {
                sheetName: 'LineItems',
                data: lineData.length ? lineData : [lineTemplate],
            },
        ] as any);
    }
}
