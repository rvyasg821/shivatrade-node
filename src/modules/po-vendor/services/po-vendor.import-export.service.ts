import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { PoVendorService } from './po-vendor.service';
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '../repository/repositories/po-vendor-line.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PoVendorPaymentRepository } from '../repository/repositories/po-vendor-payment.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { ENUM_PO_VENDOR_STATUS } from '../enums/po-vendor.enum';
import {
    parseDateCell,
    pickSheet,
    norm,
} from '@common/import/sales-doc-two-sheet.helper';

// Vendor PO (POV) THREE-SHEET import:
//   "VPOs"          — one row per POV (header). INR-only.
//   "LineItems"     — product lines (voucher_no + product_code + qty + rate + gst).
//   "VendorCharges" — one row per charge (voucher_no + charge_code + type + value + gst%).
// Uses the standalone create path in SILENT import mode (which relaxes the
// vendor-price-list guard). Preserves voucher_no + status, idempotent-skip.
const HEADER_HEADERS = [
    'voucher_no',
    'vendor_code',
    'so_voucher_no',
    'deliver_to',
    'dispatched_through',
    'payment_terms',
    'delivery_terms',
    'remarks',
    'internal_notes',
    'advance_amount',
    'advance_date',
    'advance_notes',
    'status',
];
const LINE_HEADERS = [
    'voucher_no',
    'product_code',
    'part_no',
    'hsn',
    'uom',
    'qty',
    'rate',
    'gst_pct',
];
const CHARGE_HEADERS = [
    'voucher_no',
    'charge_code',
    'type',
    'value',
    'gst_pct',
];
const PAYMENT_HEADERS = [
    'vpo_voucher_no',
    'payment_date',
    'amount',
    'tds_section',
    'tds_rate_pct',
    'tds_amount',
    'invoice_number',
    'bank',
    'notes',
];

interface VpoLine {
    rowNum: number;
    product_id: string;
    ordered_qty: string;
    unit_price: string;
    part_no?: string;
    hsn_code?: string;
    unit?: string;
    tax_pct?: string;
}
interface VpoCharge {
    rowNum: number;
    expense_id: string;
    type?: 'percent' | 'fixed';
    value: string;
    gst_pct?: string;
}
export interface VpoImportDoc {
    voucher_no: string;
    rowNum: number;
    vendor_id?: string;
    purchase_order_id?: string;
    delivery_address_id?: string;
    delivery_address?: string;
    dispatched_through?: string;
    payment_terms?: string;
    delivery_terms?: string;
    notes?: string;
    internal_notes?: string;
    advance?: { payment_date?: string; amount: string; notes?: string };
    status: ENUM_PO_VENDOR_STATUS;
    lines: VpoLine[];
    charges: VpoCharge[];
    docStatus: 'valid_new' | 'skip' | 'error';
    errors: string[];
    warnings: string[];
}

@Injectable()
export class PoVendorImportExportService {
    private readonly logger = new Logger(PoVendorImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly povService: PoVendorService,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly productRepository: ProductRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly locationRepository: LocationRepository,
        private readonly purchaseOrderRepository: PurchaseOrderRepository,
        private readonly povPaymentRepository: PoVendorPaymentRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository
    ) {}

    generateSampleExcel(): Buffer {
        const header: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            vendor_code: 'VND-0001',
            so_voucher_no: '',
            deliver_to: '',
            dispatched_through: 'By Road',
            payment_terms: '50% ADVANCE & 50% AT DISPATCH',
            delivery_terms: 'DELIVERY: 4 TO 5 WEEKS',
            remarks: 'Backfilled from paper VPO',
            internal_notes: '',
            advance_amount: '0',
            advance_date: '',
            advance_notes: '',
            status: 'draft',
        };
        const line: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            product_code: 'PRD-001',
            part_no: 'PN-1001',
            hsn: '72061000',
            uom: 'KG',
            qty: '100',
            rate: '9000',
            gst_pct: '18',
        };
        const charge: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            charge_code: 'PKC',
            type: 'fixed',
            value: '2000',
            gst_pct: '0',
        };
        return this.fileService.writeExcel([
            { sheetName: 'VPOs', data: [header] },
            { sheetName: 'LineItems', data: [line] },
            { sheetName: 'VendorCharges', data: [charge] },
        ] as any);
    }

    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string
    ): Promise<{ summary: any; rows: VpoImportDoc[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel file.'
            );
        }
        const headerRows = pickSheet(sheets as any, ['VPOs', 'VPO'], 0) || [];
        const lineRows = pickSheet(sheets as any, ['LineItems', 'Lines'], 1) || [];
        const chargeRows =
            pickSheet(sheets as any, ['VendorCharges', 'Charges'], 2) || [];
        if (!headerRows.length)
            throw new BadRequestException(
                'The "VPOs" sheet has no rows. Expected sheets: VPOs, LineItems, VendorCharges.'
            );
        if (!lineRows.length)
            throw new BadRequestException(
                'The "LineItems" sheet has no rows.'
            );

        // Resolution maps.
        const products = await this.productRepository.findByCompanyId(companyId);
        const productByCode = new Map<string, any>();
        for (const p of products as any[])
            if (p.code) productByCode.set(String(p.code).trim().toLowerCase(), p);
        const vendors = await this.vendorRepository.findByCompanyId(companyId);
        const vendorByCode = new Map<string, any>();
        for (const v of vendors as any[])
            if (v.vendor_code)
                vendorByCode.set(String(v.vendor_code).trim().toLowerCase(), v);
        const expenses = (await this.expenseRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const expenseByCode = new Map<string, any>();
        for (const e of expenses)
            if (e.code) expenseByCode.set(String(e.code).trim().toLowerCase(), e);

        const locations = (await this.locationRepository.findByCompanyId(
            companyId
        )) as any[];
        const defaultLoc = await this.locationRepository.findDefaultLocation(
            companyId
        );

        // Optional source Sales Order link (header-level).
        const salesOrders = (await this.purchaseOrderRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const soByVoucher = new Map<string, any>();
        for (const so of salesOrders)
            if (so.voucher_no)
                soByVoucher.set((so.voucher_no || '').trim().toLowerCase(), so);

        const existing = (await this.povRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const existingVouchers = new Set<string>(
            existing.map((p) => (p.voucher_no || '').trim().toLowerCase())
        );

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

        // Group lines + charges by voucher_no.
        const linesByVoucher = new Map<string, VpoLine[]>();
        const lineErrByVoucher = new Map<string, string[]>();
        for (let i = 0; i < lineRows.length; i++) {
            const raw = lineRows[i] as Record<string, any>;
            const vno = get(raw, 'voucher_no');
            if (!vno) continue;
            const vkey = vno.toLowerCase();
            const rowNum = i + 2;
            const pushErr = (m: string) => {
                if (!lineErrByVoucher.has(vkey)) lineErrByVoucher.set(vkey, []);
                lineErrByVoucher.get(vkey).push(m);
            };
            const productCode = get(raw, 'product_code');
            if (!productCode) continue;
            const product = productByCode.get(productCode.toLowerCase());
            if (!product) {
                pushErr(
                    `LineItems row ${rowNum}: product_code "${productCode}" not found`
                );
                continue;
            }
            const qty = get(raw, 'qty');
            const rate = get(raw, 'rate');
            if (!qty || !Number.isFinite(Number(qty)) || Number(qty) <= 0)
                pushErr(`LineItems row ${rowNum}: qty must be greater than 0`);
            if (!rate || !Number.isFinite(Number(rate)) || Number(rate) < 0)
                pushErr(
                    `LineItems row ${rowNum}: rate is required and must be numeric`
                );
            if (!linesByVoucher.has(vkey)) linesByVoucher.set(vkey, []);
            linesByVoucher.get(vkey).push({
                rowNum,
                product_id: product._id.toString(),
                ordered_qty: qty,
                unit_price: rate,
                part_no: get(raw, 'part_no') || undefined,
                hsn_code: get(raw, 'hsn') || undefined,
                unit: get(raw, 'uom') || undefined,
                tax_pct: get(raw, 'gst_pct') || undefined,
            });
        }

        const chargesByVoucher = new Map<string, VpoCharge[]>();
        const chargeWarnByVoucher = new Map<string, string[]>();
        for (let i = 0; i < chargeRows.length; i++) {
            const raw = chargeRows[i] as Record<string, any>;
            const vno = get(raw, 'voucher_no');
            if (!vno) continue;
            const vkey = vno.toLowerCase();
            const rowNum = i + 2;
            const chargeCode = get(raw, 'charge_code');
            if (!chargeCode) continue;
            const m = expenseByCode.get(chargeCode.toLowerCase());
            if (!m) {
                if (!chargeWarnByVoucher.has(vkey))
                    chargeWarnByVoucher.set(vkey, []);
                chargeWarnByVoucher
                    .get(vkey)
                    .push(
                        `VendorCharges row ${rowNum}: charge_code "${chargeCode}" not found — skipped`
                    );
                continue;
            }
            const typeRaw = get(raw, 'type').toLowerCase();
            const type =
                typeRaw === 'percent' || typeRaw === 'fixed'
                    ? (typeRaw as 'percent' | 'fixed')
                    : undefined;
            if (!chargesByVoucher.has(vkey)) chargesByVoucher.set(vkey, []);
            chargesByVoucher.get(vkey).push({
                rowNum,
                expense_id: m._id.toString(),
                type,
                value: get(raw, 'value') || '0',
                gst_pct: get(raw, 'gst_pct') || undefined,
            });
        }

        const seenVouchers = new Set<string>();
        const docs: VpoImportDoc[] = [];
        for (let i = 0; i < headerRows.length; i++) {
            const raw = headerRows[i] as Record<string, any>;
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];

            const voucher_no = get(raw, 'voucher_no');
            const vkey = voucher_no.toLowerCase();
            if (!voucher_no) errors.push('voucher_no is required');
            else if (seenVouchers.has(vkey))
                errors.push('Duplicate voucher_no in the VPOs sheet');
            if (voucher_no) seenVouchers.add(vkey);

            // Vendor (required).
            const vendorCode = get(raw, 'vendor_code');
            let vendor_id: string | undefined;
            if (!vendorCode) errors.push('vendor_code is required');
            else {
                const v = vendorByCode.get(vendorCode.toLowerCase());
                if (!v)
                    errors.push(
                        `vendor_code "${vendorCode}" not found (import Vendors first)`
                    );
                else vendor_id = v._id.toString();
            }

            // Optional source Sales Order link (header-level, by voucher).
            let purchase_order_id: string | undefined;
            const soVoucher = get(raw, 'so_voucher_no');
            if (soVoucher) {
                const so = soByVoucher.get(soVoucher.toLowerCase());
                if (!so)
                    warnings.push(
                        `so_voucher_no "${soVoucher}" not found — left standalone (unlinked)`
                    );
                else purchase_order_id = so._id.toString();
            }

            // Deliver-to → a company location, else free-text, else default.
            const deliverTo = get(raw, 'deliver_to');
            let delivery_address_id: string | undefined;
            let delivery_address: string | undefined;
            if (deliverTo) {
                const loc = locations.find(
                    (l) =>
                        norm(l.location_code) === norm(deliverTo) ||
                        norm(l.location_name) === norm(deliverTo)
                );
                if (loc) delivery_address_id = loc._id.toString();
                else delivery_address = deliverTo; // free-text snapshot
            } else if (defaultLoc) {
                delivery_address_id = defaultLoc._id.toString();
            } else {
                errors.push(
                    'deliver_to is required (no default company location is set)'
                );
            }

            // status
            let status = ENUM_PO_VENDOR_STATUS.DRAFT;
            const statusRaw = get(raw, 'status').toLowerCase();
            if (statusRaw) {
                if (
                    (Object.values(ENUM_PO_VENDOR_STATUS) as string[]).includes(
                        statusRaw
                    )
                )
                    status = statusRaw as ENUM_PO_VENDOR_STATUS;
                else
                    errors.push(
                        `Invalid status "${statusRaw}" (expected ${Object.values(
                            ENUM_PO_VENDOR_STATUS
                        ).join(', ')})`
                    );
            }

            // advance (optional)
            let advance:
                | { payment_date?: string; amount: string; notes?: string }
                | undefined;
            const advAmount = get(raw, 'advance_amount');
            if (advAmount && Number(advAmount) > 0) {
                advance = {
                    amount: advAmount,
                    payment_date:
                        parseDateCell(getRaw(raw, 'advance_date')) || undefined,
                    notes: get(raw, 'advance_notes') || undefined,
                };
            }

            // Lines + charges from their sheets.
            const lines = voucher_no
                ? linesByVoucher.get(vkey) || []
                : [];
            errors.push(...(lineErrByVoucher.get(vkey) || []));
            warnings.push(...(chargeWarnByVoucher.get(vkey) || []));
            if (!lines.length && !(lineErrByVoucher.get(vkey) || []).length)
                errors.push(
                    'No line items found for this voucher_no in the "LineItems" sheet'
                );

            const alreadyExists = !!voucher_no && existingVouchers.has(vkey);
            let docStatus: VpoImportDoc['docStatus'];
            if (errors.length) docStatus = 'error';
            else if (alreadyExists) docStatus = 'skip';
            else docStatus = 'valid_new';

            docs.push({
                voucher_no,
                rowNum,
                vendor_id,
                purchase_order_id,
                delivery_address_id,
                delivery_address,
                dispatched_through: get(raw, 'dispatched_through') || undefined,
                payment_terms: get(raw, 'payment_terms') || undefined,
                delivery_terms: get(raw, 'delivery_terms') || undefined,
                notes: get(raw, 'remarks') || undefined,
                internal_notes: get(raw, 'internal_notes') || undefined,
                advance,
                status,
                lines,
                charges: chargesByVoucher.get(vkey) || [],
                docStatus,
                errors,
                warnings,
            });
        }

        const headerVouchers = new Set(
            docs.map((d) => d.voucher_no.toLowerCase())
        );
        const orphanLineVouchers = Array.from(linesByVoucher.keys()).filter(
            (v) => v && !headerVouchers.has(v)
        );

        const summary = {
            total: docs.length,
            valid_new: docs.filter((d) => d.docStatus === 'valid_new').length,
            valid_update: 0,
            skipped: docs.filter((d) => d.docStatus === 'skip').length,
            errors: docs.filter((d) => d.docStatus === 'error').length,
            warnings: docs.reduce((n, d) => n + d.warnings.length, 0),
            orphan_line_vouchers: orphanLineVouchers,
        };
        return { summary, rows: docs };
    }

    async importVpos(
        docs: VpoImportDoc[],
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
            if (doc.docStatus === 'skip') {
                skipped++;
                continue;
            }
            if (doc.docStatus !== 'valid_new') continue;
            try {
                const createdPov = await this.povService.createStandalone(
                    companyId,
                    {
                        vendor_id: doc.vendor_id,
                        delivery_address_id: doc.delivery_address_id,
                        delivery_address: doc.delivery_address,
                        dispatched_through: doc.dispatched_through,
                        payment_terms: doc.payment_terms,
                        delivery_terms: doc.delivery_terms,
                        notes: doc.notes,
                        internal_notes: doc.internal_notes,
                        lines: doc.lines.map((l) => ({
                            product_id: l.product_id,
                            ordered_qty: l.ordered_qty,
                            unit_price: l.unit_price,
                            part_no: l.part_no,
                            hsn_code: l.hsn_code,
                            unit: l.unit,
                            tax_pct: l.tax_pct,
                        })),
                        expenses: doc.charges.length
                            ? doc.charges.map((c) => ({
                                  expense_id: c.expense_id,
                                  type: c.type,
                                  value: c.value,
                                  gst_pct: c.gst_pct,
                              }))
                            : undefined,
                        advance: doc.advance,
                    } as any,
                    userId,
                    {
                        voucher_no: doc.voucher_no,
                        status: doc.status,
                        silent: true,
                    }
                );
                // Header-level source Sales Order link (import-only): the
                // standalone create nulls purchase_order_id, so patch it here
                // when so_voucher_no resolved. Best-effort — never fails the row.
                if (doc.purchase_order_id && createdPov) {
                    try {
                        (createdPov as any).purchase_order_id =
                            doc.purchase_order_id;
                        await this.povRepository.save(createdPov as any);
                    } catch (e: any) {
                        this.logger.warn(
                            `VPO ${doc.voucher_no}: could not link SO — ${e?.message}`
                        );
                    }
                }
                created++;
            } catch (err: any) {
                this.logger.error(
                    `VPO import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }
        return { created, skipped, errors };
    }

    /** Export VPOs to the same 3-sheet shape. */
    async exportVpos(companyId: string): Promise<Buffer> {
        const vpos = (await this.povRepository.findAll({
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
        const locations = (await this.locationRepository.findByCompanyId(
            companyId
        )) as any[];
        const locNameById = new Map<string, string>();
        for (const l of locations)
            locNameById.set(l._id.toString(), l.location_name || '');

        const salesOrders = (await this.purchaseOrderRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const soVoucherById = new Map<string, string>();
        for (const so of salesOrders)
            soVoucherById.set(so._id.toString(), so.voucher_no || '');

        const isoDate = (v: any) => (v ? String(v).slice(0, 10) : '');

        const headerData: any[] = [];
        const lineData: any[] = [];
        const chargeData: any[] = [];
        for (const p of vpos) {
            headerData.push({
                voucher_no: p.voucher_no || '',
                vendor_code: vendorCodeById.get(p.vendor_id?.toString()) || '',
                so_voucher_no:
                    soVoucherById.get(p.purchase_order_id?.toString()) || '',
                deliver_to:
                    locNameById.get(p.delivery_address_id?.toString()) ||
                    p.delivery_address ||
                    '',
                dispatched_through: p.dispatched_through || '',
                payment_terms: p.payment_terms || '',
                delivery_terms: p.delivery_terms || '',
                remarks: p.notes || '',
                internal_notes: p.internal_notes || '',
                advance_amount: '',
                advance_date: '',
                advance_notes: '',
                status: p.status || '',
            });
            const lines = (await this.povLineRepository.findAll({
                po_vendor_id: p._id.toString(),
            } as any)) as any[];
            for (const ln of lines) {
                lineData.push({
                    voucher_no: p.voucher_no || '',
                    product_code: codeById.get(ln.product_id?.toString()) || '',
                    part_no: ln.part_no ?? '',
                    hsn: ln.hsn_code ?? '',
                    uom: ln.unit ?? '',
                    qty: ln.ordered_qty ?? '',
                    rate: ln.unit_price ?? '',
                    gst_pct: ln.tax_pct ?? '',
                });
            }
            for (const ch of p.expenses_snapshot || []) {
                chargeData.push({
                    voucher_no: p.voucher_no || '',
                    charge_code: ch.code || '',
                    type: ch.type || '',
                    value: ch.value ?? '',
                    gst_pct: ch.gst_pct ?? '',
                });
            }
        }
        const tmpl = (cols: string[]) => {
            const o: any = {};
            for (const c of cols) o[c] = '';
            return o;
        };
        return this.fileService.writeExcel([
            {
                sheetName: 'VPOs',
                data: headerData.length ? headerData : [tmpl(HEADER_HEADERS)],
            },
            {
                sheetName: 'LineItems',
                data: lineData.length ? lineData : [tmpl(LINE_HEADERS)],
            },
            {
                sheetName: 'VendorCharges',
                data: chargeData.length ? chargeData : [tmpl(CHARGE_HEADERS)],
            },
        ] as any);
    }

    // ════════════════════════════════════════════════════════════════════
    // VENDOR PAYMENTS — flat single sheet. amount is GROSS (settles the POV
    // payable); net_paid = amount − tds. Reconciles the vendor ledger + POV
    // payment status. Idempotent: a payment matching an existing (POV, date,
    // gross-amount) non-voided payment is SKIPPED.
    // ════════════════════════════════════════════════════════════════════

    generatePaymentSample(): Buffer {
        const rows = [
            [...PAYMENT_HEADERS],
            [
                'STIPL/VPO/0001/2026-27',
                '17/05/2026',
                '50000',
                '194C',
                '2',
                '1000',
                'VINV-5521',
                'Bank of Baroda',
                'NEFT ref 88231',
            ],
        ];
        return this.fileService.writeExcelFromArray(rows);
    }

    async parsePayments(
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

        const vpos = (await this.povRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const vpoByVoucher = new Map<string, any>();
        for (const p of vpos)
            if (p.voucher_no)
                vpoByVoucher.set((p.voucher_no || '').trim().toLowerCase(), p);

        const banks = (await this.companyBankAccountRepository.findByCompanyId(
            companyId
        )) as any[];

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

        const payCache = new Map<string, Set<string>>();
        const existingKeys = async (povId: string): Promise<Set<string>> => {
            if (payCache.has(povId)) return payCache.get(povId);
            const pays = (await this.povPaymentRepository.findActiveByPoVendorId(
                povId
            )) as any[];
            const set = new Set<string>(
                pays.map(
                    (p) =>
                        `${String(p.payment_date).slice(0, 10)}|${Number(
                            p.amount
                        )}`
                )
            );
            payCache.set(povId, set);
            return set;
        };

        const rows: any[] = [];
        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2;
            const errors: string[] = [];
            const warnings: string[] = [];
            const voucher = get(raw, 'vpo_voucher_no');
            const dateIso = parseDateCell(getRaw(raw, 'payment_date'));
            const amount = get(raw, 'amount');

            if (!voucher) errors.push('vpo_voucher_no is required');
            const pov = voucher ? vpoByVoucher.get(voucher.toLowerCase()) : null;
            if (voucher && !pov)
                errors.push(`vpo_voucher_no "${voucher}" not found`);
            if (!dateIso) errors.push('payment_date is required / invalid');
            if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0)
                errors.push('amount (gross) must be greater than 0');

            // Paying bank (optional) — match by name or account number.
            let company_bank_account_id: string | undefined;
            const bankRaw = get(raw, 'bank');
            if (bankRaw) {
                const b = banks.find(
                    (x) =>
                        norm(x.bank_name) === norm(bankRaw) ||
                        norm(x.account_number) === norm(bankRaw) ||
                        norm(x.nickname) === norm(bankRaw)
                );
                if (b) company_bank_account_id = b._id.toString();
                else
                    warnings.push(
                        `bank "${bankRaw}" not matched to a company bank account — left blank`
                    );
            }

            let status: 'valid_new' | 'skip' | 'error' = 'valid_new';
            if (errors.length) status = 'error';
            else {
                const keys = await existingKeys(pov._id.toString());
                if (keys.has(`${dateIso}|${Number(amount)}`)) status = 'skip';
            }

            rows.push({
                rowNum,
                vpo_voucher_no: voucher,
                po_vendor_id: pov?._id?.toString(),
                payment_date: dateIso,
                amount,
                tds_section: get(raw, 'tds_section') || undefined,
                tds_rate_pct: get(raw, 'tds_rate_pct') || undefined,
                tds_amount: get(raw, 'tds_amount') || undefined,
                invoice_number: get(raw, 'invoice_number') || undefined,
                company_bank_account_id,
                notes: get(raw, 'notes') || undefined,
                status,
                errors,
                warnings,
            });
        }
        const summary = {
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            skipped: rows.filter((r) => r.status === 'skip').length,
            errors: rows.filter((r) => r.status === 'error').length,
            warnings: rows.reduce((n, r) => n + (r.warnings?.length || 0), 0),
        };
        return { summary, rows };
    }

    async importPayments(
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
                const pov = await this.povRepository.findOneById(r.po_vendor_id);
                await this.povService.recordPayment(
                    pov as any,
                    {
                        payment_date: r.payment_date,
                        amount: String(r.amount),
                        invoice_number: r.invoice_number,
                        company_bank_account_id: r.company_bank_account_id,
                        tds_section: r.tds_section,
                        tds_rate_pct: r.tds_rate_pct,
                        tds_amount: r.tds_amount,
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

    async exportPayments(companyId: string): Promise<Buffer> {
        const vpos = (await this.povRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const banks = (await this.companyBankAccountRepository.findByCompanyId(
            companyId
        )) as any[];
        const bankNameById = new Map<string, string>();
        for (const b of banks)
            bankNameById.set(b._id.toString(), b.bank_name || '');

        const aoa: any[][] = [[...PAYMENT_HEADERS]];
        for (const pov of vpos) {
            const pays = (await this.povPaymentRepository.findActiveByPoVendorId(
                pov._id.toString()
            )) as any[];
            for (const p of pays) {
                aoa.push([
                    pov.voucher_no || '',
                    String(p.payment_date).slice(0, 10),
                    p.amount ?? '',
                    p.tds_section || '',
                    p.tds_rate_pct ?? '',
                    p.tds_amount ?? '',
                    p.invoice_number || '',
                    bankNameById.get(p.company_bank_account_id?.toString()) ||
                        p.company_bank_snapshot?.bank_name ||
                        '',
                    p.notes || '',
                ]);
            }
        }
        return this.fileService.writeExcelFromArray(aoa);
    }
}
