import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { PoVendorService } from './po-vendor.service';
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '../repository/repositories/po-vendor-line.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PoVendorPaymentRepository } from '../repository/repositories/po-vendor-payment.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { ENUM_PO_VENDOR_STATUS } from '../enums/po-vendor.enum';
import { GrnService } from '@modules/grn/services/grn.service';
import { DebitNoteService } from '@modules/grn/services/debit-note.service';
import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { DebitNoteRepository } from '@modules/grn/repository/repositories/debit-note.repository';
import { DebitNoteLineRepository } from '@modules/grn/repository/repositories/debit-note-line.repository';
import { ENUM_GRN_STATUS } from '@modules/grn/enums/grn.enum';
import { ENUM_DEBIT_NOTE_STATUS } from '@modules/grn/enums/debit-note.enum';
import { AuditLogService } from '@modules/tracking/services/audit-log.service';
import { RequestContextService } from '@common/request/services/request-context.service';
import {
    parseDateCell,
    pickSheet,
    norm,
} from '@common/import/sales-doc-two-sheet.helper';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

// Vendor PO (POV) import, FIVE sheets in one workbook:
//   "VPOs"          — one row per POV (header). INR-only.
//   "LineItems"     — product lines (voucher_no + product_code + qty + rate + gst).
//   "VendorCharges" — one row per charge (voucher_no + charge_code + type + value + gst%).
//   "GRNs"          — one row per product per GRN (2026-09-10). Flat, not a
//                     separate header+lines pair — grn_date/invoice_number/
//                     status repeat on every row sharing the same grn_ref
//                     (po_vendor_voucher_no, grn_voucher_no), same convention
//                     LineItems already uses repeating voucher_no per row.
//                     Requires the POV to already be DISPATCHED/CLOSED (by
//                     this same import pass, or already live).
//   "DebitNotes"    — one row per returned product (2026-09-10). Flat; keyed
//                     by (po_vendor_voucher_no, grn_voucher_no) — a Debit
//                     Note is always 1:1 with a CONFIRMED GRN (createFromGrn
//                     enforces "one active DN per GRN"), so no separate ref
//                     column is needed to disambiguate it.
// GRN/DN existence is 100% sheet-driven — the POV import itself never
// auto-raises or auto-confirms a GRN (removed 2026-09-10; see
// so-import-full-update-on-reimport.md for why). GRNs/DebitNotes are only
// ever a FULL update while still DRAFT — CONFIRMED/ISSUED/CANCELLED rows are
// skipped on re-import, same precedent as the VPO itself, even though the
// live app's own GrnService.update() technically permits editing a
// CONFIRMED GRN (import intentionally treats it as locked for safety).
// VPOs uses the standalone create path in SILENT import mode (which relaxes
// the vendor-price-list guard). Preserves voucher_no + status, idempotent-skip.
const HEADER_HEADERS = [
    'voucher_no',
    'vendor_code',
    'so_voucher_no',
    'linked_so_voucher_nos',
    'dispatch_date',
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
    'invoice_number',
    'creation_date',
    'vendor_address_label',
    // Historical FX: a bulk import of past VPOs must freeze the rate the
    // voucher was actually booked at. Blank keeps the existing behaviour
    // (vendor's currency at the CURRENT master rate), which silently
    // rewrites every historical import to today's rate.
    'currency_code',
    'exchange_rate',
];
const LINE_HEADERS = [
    'voucher_no',
    'product_code',
    'part_no',
    'hsn',
    'uom',
    'qty',
    'rate',
    'discount_pct',
    'gst_pct',
    'dispatched_qty',
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
const GRN_HEADERS = [
    'po_vendor_voucher_no',
    'grn_voucher_no',
    'grn_date',
    'invoice_number',
    'notes',
    'status',
    'product_code',
    'received_qty',
    'rejected_qty',
    'batch_no',
    'remarks',
];
const DEBIT_NOTE_HEADERS = [
    'po_vendor_voucher_no',
    'grn_voucher_no',
    'dn_date',
    'notes',
    'product_code',
    'returned_qty',
    'unit_price',
    'remarks',
    'status',
];

// EXPORT-ONLY trailing columns (read-only, not read back on import — same
// convention as the SO/Quotation/Invoice export's trailing total_value/
// line_total columns). taxable/gst_value/total are computed here, not
// pulled from a stored field, EXCEPT VendorCharges (uses the already-
// computed expenses_snapshot amount) and DebitNotes' `total` (uses the
// already-computed line_total — no GST is modeled on a Debit Note line at
// all, so there's no taxable/gst_value column for it). `total_inr` uses the
// POV's own exchange_rate (INR-per-1-unit convention, §4) — the COLUMN is
// always present (a sheet mixes many vouchers, can't hide it only for
// some), but the VALUE is left blank for an INR-native POV and only filled
// in for a foreign-currency one.
const LINE_HEADERS_EXPORT = [
    ...LINE_HEADERS,
    'taxable',
    'gst_value',
    'total',
    'total_inr',
];
// hsn_code is export-only (not an import input) — it always follows the
// expense MASTER's own hsn_code, resolved automatically from charge_code;
// there's nothing to independently set per import row.
const CHARGE_HEADERS_EXPORT = [
    ...CHARGE_HEADERS.slice(0, 2),
    'hsn_code',
    ...CHARGE_HEADERS.slice(2),
    'taxable',
    'gst_value',
    'total',
    'total_inr',
];
// GRN lines have no rate/GST of their own (snapshotted from the POV line at
// receipt time isn't stored) — taxable/gst_value/total here are valued
// against the GOOD/accepted qty, i.e. what the vendor is actually billed
// for once QC-rejected units are excluded (decision confirmed 2026-09-10).
// No separate accepted_qty column — `received_qty` in the export IS that
// good/accepted figure (the GRN line's `accepted_qty` DB field), matching
// what the live Receipt & Quality Check page itself labels "Received";
// the DB's own internal `received_qty` column (accepted + rejected, an
// invariant the entity itself enforces) isn't surfaced here at all — it's
// not shown anywhere in the live UI either.
const GRN_HEADERS_EXPORT = [
    ...GRN_HEADERS,
    // The rate/discount/GST used to compute taxable/total below —
    // snapshotted from the matching POV line (GRN lines carry none of
    // their own), same as the live GRN detail page's own columns.
    'unit_price',
    'discount_pct',
    'gst_pct',
    'taxable',
    'gst_value',
    'total',
    'total_inr',
];
// part_no/hsn_code/rejected_qty are shown on the live DN detail page (part_no
// its own column, hsn_code inline under the item name, rejected_qty as the
// "Rejected" cap column) but were missing from the export — export-only,
// not import inputs: part_no/hsn_code are always snapshotted from the
// source GRN line, and rejected_qty is always the source GRN line's own
// rejected qty (the DN import sheet only ever supplies returned_qty, the
// portion of that being returned, never rejected_qty itself).
// discount_pct (2026-09-10, real bug fix, not just a display gap): a
// Debit Note used to credit the vendor at the raw pre-discount rate,
// ignoring any discount already agreed on the source POV line — a return
// should net out at the SAME price the original sale did, not the sticker
// rate. Always the source POV line's own value, never an independent
// override (see DebitNoteService.createFromGrn's own comment) — export-only
// here too, same as part_no/hsn_code/rejected_qty above. No GST concept
// exists on a Debit Note line though — that part of the earlier comment
// was correct, `line_total = returned_qty × unit_price × (1 − discount%)`.
const DEBIT_NOTE_HEADERS_EXPORT = [
    ...DEBIT_NOTE_HEADERS,
    'part_no',
    'hsn_code',
    'rejected_qty',
    'discount_pct',
    'total',
    'total_inr',
];

interface VpoLine {
    rowNum: number;
    product_id: string;
    ordered_qty: string;
    unit_price: string;
    discount_pct?: string;
    part_no?: string;
    hsn_code?: string;
    unit?: string;
    tax_pct?: string;
    // Actual qty shipped, when it differs from ordered_qty (under/over-
    // shipment) — only meaningful once the voucher is dispatched/closed;
    // blank falls back to "fully dispatched" (the existing default).
    dispatched_qty?: string;
}
interface VpoCharge {
    rowNum: number;
    expense_id: string;
    type?: 'percent' | 'fixed';
    value: string;
    gst_pct?: string;
}
interface GrnImportLine {
    rowNum: number;
    product_id: string;
    received_qty: string;
    rejected_qty: string;
    batch_no?: string;
    remarks?: string;
}
interface GrnImportGroup {
    grn_voucher_no?: string;
    grn_date?: string;
    invoice_number?: string;
    notes?: string;
    status: 'draft' | 'confirmed';
    lines: GrnImportLine[];
}
interface DnImportLine {
    rowNum: number;
    product_id: string;
    returned_qty?: string;
    unit_price?: string;
    remarks?: string;
}
interface DnImportGroup {
    grn_voucher_no: string;
    dn_date?: string;
    notes?: string;
    status: 'draft' | 'issued';
    lines: DnImportLine[];
}
export interface VpoImportDoc {
    voucher_no: string;
    rowNum: number;
    vendor_id?: string;
    purchase_order_id?: string;
    // Resolved from the optional linked_so_voucher_nos column (comma-
    // separated SO voucher numbers) — the multi-link traceability array,
    // distinct from the single purchase_order_id FK above (from
    // so_voucher_no). Falls back to [purchase_order_id] when this column is
    // blank but so_voucher_no resolved one (backward compatible).
    linked_purchase_order_ids?: string[];
    // Which of the vendor's own addresses to snapshot (picked by label) —
    // blank falls back to the vendor's default, same as before.
    vendor_address_id?: string;
    dispatch_date?: string;
    delivery_address_id?: string;
    delivery_address?: string;
    dispatched_through?: string;
    payment_terms?: string;
    delivery_terms?: string;
    notes?: string;
    internal_notes?: string;
    invoice_number?: string;
    creation_date?: string;
    /** Explicit historical FX — blank falls back to the vendor's currency at
     *  the current master rate (see HEADER_HEADERS). */
    currency_code?: string;
    exchange_rate?: string;
    advance?: { payment_date?: string; amount: string; notes?: string };
    status: ENUM_PO_VENDOR_STATUS;
    lines: VpoLine[];
    charges: VpoCharge[];
    // GRN(s) / Debit Note(s) for this voucher, grouped by grn_voucher_no
    // (blank grn_voucher_no on every GRNs-sheet row for this voucher
    // collapses into ONE new-GRN group). Processed regardless of the VPO
    // row's own docStatus — a CLOSED (skip) voucher can still legitimately
    // get a corrected/additional GRN via re-import.
    grns: GrnImportGroup[];
    debitNotes: DnImportGroup[];
    docStatus: 'valid_new' | 'valid_update' | 'skip' | 'error';
    // Existing VPO's _id — set only when docStatus === 'valid_update'.
    existingId?: string;
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
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly productRepository: ProductRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly locationRepository: LocationRepository,
        private readonly purchaseOrderRepository: PurchaseOrderRepository,
        private readonly povPaymentRepository: PoVendorPaymentRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository,
        private readonly grnService: GrnService,
        private readonly debitNoteService: DebitNoteService,
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly debitNoteRepository: DebitNoteRepository,
        private readonly debitNoteLineRepository: DebitNoteLineRepository,
        private readonly auditLogService: AuditLogService,
        private readonly requestContext: RequestContextService
    ) {}

    generateSampleExcel(): Buffer {
        const header: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            vendor_code: 'VND-0001',
            so_voucher_no: '',
            linked_so_voucher_nos: '',
            dispatch_date: '20/04/2026',
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
            invoice_number: '',
            creation_date: '',
            vendor_address_label: '',
            currency_code: 'USD',
            exchange_rate: '95.18',
        };
        const line: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            product_code: 'PRD-001',
            part_no: 'PN-1001',
            hsn: '72061000',
            uom: 'KG',
            qty: '100',
            rate: '9000',
            discount_pct: '0',
            gst_pct: '18',
            dispatched_qty: '',
        };
        const charge: Record<string, any> = {
            voucher_no: 'STIPL/VPO/0001/2026-27',
            charge_code: 'PKC',
            type: 'fixed',
            value: '2000',
            gst_pct: '0',
        };
        const grn: Record<string, any> = {
            po_vendor_voucher_no: 'STIPL/VPO/0001/2026-27',
            grn_voucher_no: '',
            grn_date: '25/04/2026',
            invoice_number: 'VEND-INV-778',
            notes: '',
            status: 'confirmed',
            product_code: 'PRD-001',
            received_qty: '100',
            rejected_qty: '0',
            batch_no: '',
            remarks: '',
        };
        const dn: Record<string, any> = {
            po_vendor_voucher_no: 'STIPL/VPO/0001/2026-27',
            grn_voucher_no: '',
            dn_date: '',
            notes: '',
            product_code: 'PRD-001',
            returned_qty: '',
            unit_price: '',
            remarks: '',
            status: 'draft',
        };
        return this.fileService.writeExcel([
            { sheetName: 'VPOs', data: [header] },
            { sheetName: 'LineItems', data: [line] },
            { sheetName: 'VendorCharges', data: [charge] },
            { sheetName: 'GRNs', data: [grn] },
            { sheetName: 'DebitNotes', data: [dn] },
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
        // Both optional — a workbook with only the original 3 sheets still
        // imports fine, it just has nothing to receipt/return.
        const grnRows = pickSheet(sheets as any, ['GRNs', 'GRN'], 3) || [];
        const dnRows =
            pickSheet(sheets as any, ['DebitNotes', 'DebitNote'], 4) || [];
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
        // Optional: pick a specific vendor address by label (blank → the
        // vendor's own default, unchanged existing behaviour).
        const vendorAddresses = vendors.length
            ? await this.vendorAddressRepository.findByVendorIds(
                  (vendors as any[]).map((v) => v._id.toString())
              )
            : [];
        const vendorAddressesByVendorId = new Map<string, any[]>();
        for (const a of vendorAddresses as any[]) {
            const vid = a.vendor_id?.toString();
            if (!vid) continue;
            if (!vendorAddressesByVendorId.has(vid))
                vendorAddressesByVendorId.set(vid, []);
            vendorAddressesByVendorId.get(vid).push(a);
        }
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
        const existingPovByVoucher = new Map<string, any>();
        for (const p of existing)
            if (p.voucher_no)
                existingPovByVoucher.set(
                    (p.voucher_no || '').trim().toLowerCase(),
                    p
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
            if (!productCode) {
                // Previously silently dropped — a blank code vanished the
                // whole line with no error, surfacing only as a misleading
                // top-level "no line items found" on the voucher. Always
                // flag it instead (same fix as SO/Quotation's shared
                // parseLineItemsSheet()).
                pushErr(`LineItems row ${rowNum}: product_code is required`);
                continue;
            }
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
            const dispatchedQtyRaw = get(raw, 'dispatched_qty');
            if (dispatchedQtyRaw && !Number.isFinite(Number(dispatchedQtyRaw)))
                pushErr(
                    `LineItems row ${rowNum}: dispatched_qty must be numeric`
                );
            if (!linesByVoucher.has(vkey)) linesByVoucher.set(vkey, []);
            linesByVoucher.get(vkey).push({
                rowNum,
                product_id: product._id.toString(),
                ordered_qty: qty,
                unit_price: rate,
                discount_pct: get(raw, 'discount_pct') || undefined,
                part_no: get(raw, 'part_no') || undefined,
                hsn_code: get(raw, 'hsn') || undefined,
                unit: get(raw, 'uom') || undefined,
                tax_pct: get(raw, 'gst_pct') || undefined,
                dispatched_qty: dispatchedQtyRaw || undefined,
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

        // ── GRNs sheet (flat: one row per product per GRN) ──────────────
        // Grouped by (po_vendor_voucher_no, grn_voucher_no) — a blank
        // grn_voucher_no collapses every such row for that voucher into
        // ONE new-GRN group (can't create two un-named new GRNs for the
        // same voucher in one file; supply distinct grn_voucher_no values
        // to do that).
        const grnGroupsByVoucher = new Map<string, GrnImportGroup[]>();
        const grnErrByVoucher = new Map<string, string[]>();
        {
            const groupByKey = new Map<string, GrnImportGroup>();
            const orderByKey: string[] = [];
            const voucherByKey = new Map<string, string>();
            for (let i = 0; i < grnRows.length; i++) {
                const raw = grnRows[i] as Record<string, any>;
                const vno = get(raw, 'po_vendor_voucher_no');
                if (!vno) continue;
                const vkey = vno.toLowerCase();
                const rowNum = i + 2;
                const pushErr = (m: string) => {
                    if (!grnErrByVoucher.has(vkey)) grnErrByVoucher.set(vkey, []);
                    grnErrByVoucher.get(vkey).push(m);
                };
                const productCode = get(raw, 'product_code');
                if (!productCode) {
                    pushErr(`GRNs row ${rowNum}: product_code is required`);
                    continue;
                }
                const product = productByCode.get(productCode.toLowerCase());
                if (!product) {
                    pushErr(
                        `GRNs row ${rowNum}: product_code "${productCode}" not found`
                    );
                    continue;
                }
                const receivedRaw = get(raw, 'received_qty');
                if (
                    !receivedRaw ||
                    !Number.isFinite(Number(receivedRaw)) ||
                    Number(receivedRaw) < 0
                ) {
                    pushErr(
                        `GRNs row ${rowNum}: received_qty is required and must be numeric`
                    );
                    continue;
                }
                const rejectedRaw = get(raw, 'rejected_qty') || '0';
                if (
                    !Number.isFinite(Number(rejectedRaw)) ||
                    Number(rejectedRaw) < 0
                ) {
                    pushErr(
                        `GRNs row ${rowNum}: rejected_qty must be numeric`
                    );
                    continue;
                }
                const grnDateRaw = getRaw(raw, 'grn_date');
                const grn_date = grnDateRaw
                    ? parseDateCell(grnDateRaw) || undefined
                    : undefined;
                if (grnDateRaw && !grn_date) {
                    pushErr(`GRNs row ${rowNum}: grn_date "${grnDateRaw}" could not be parsed`);
                    continue;
                }
                if (!grn_date) {
                    pushErr(`GRNs row ${rowNum}: grn_date is required`);
                    continue;
                }
                const statusRaw = get(raw, 'status').toLowerCase() || 'draft';
                if (statusRaw !== 'draft' && statusRaw !== 'confirmed') {
                    pushErr(
                        `GRNs row ${rowNum}: status must be draft or confirmed`
                    );
                    continue;
                }
                const grnVoucherNo = get(raw, 'grn_voucher_no');
                const key = `${vkey}|||${grnVoucherNo.toLowerCase()}`;
                let group = groupByKey.get(key);
                if (!group) {
                    group = {
                        grn_voucher_no: grnVoucherNo || undefined,
                        grn_date,
                        invoice_number: get(raw, 'invoice_number') || undefined,
                        notes: get(raw, 'notes') || undefined,
                        status: statusRaw as 'draft' | 'confirmed',
                        lines: [],
                    };
                    groupByKey.set(key, group);
                    orderByKey.push(key);
                    voucherByKey.set(key, vkey);
                }
                group.lines.push({
                    rowNum,
                    product_id: product._id.toString(),
                    received_qty: receivedRaw,
                    rejected_qty: rejectedRaw,
                    batch_no: get(raw, 'batch_no') || undefined,
                    remarks: get(raw, 'remarks') || undefined,
                });
            }
            for (const key of orderByKey) {
                const vkey = voucherByKey.get(key);
                if (!grnGroupsByVoucher.has(vkey)) grnGroupsByVoucher.set(vkey, []);
                grnGroupsByVoucher.get(vkey).push(groupByKey.get(key));
            }
        }

        // ── DebitNotes sheet (flat: one row per returned product) ───────
        // Grouped by (po_vendor_voucher_no, grn_voucher_no) — always 1:1
        // with a GRN (createFromGrn enforces one active DN per GRN), so
        // grn_voucher_no alone disambiguates; it's required here (unlike
        // the GRNs sheet, where it's only required for a 2nd+ new GRN).
        const dnGroupsByVoucher = new Map<string, DnImportGroup[]>();
        const dnErrByVoucher = new Map<string, string[]>();
        {
            const groupByKey = new Map<string, DnImportGroup>();
            const orderByKey: string[] = [];
            const voucherByKey = new Map<string, string>();
            for (let i = 0; i < dnRows.length; i++) {
                const raw = dnRows[i] as Record<string, any>;
                const vno = get(raw, 'po_vendor_voucher_no');
                if (!vno) continue;
                const vkey = vno.toLowerCase();
                const rowNum = i + 2;
                const pushErr = (m: string) => {
                    if (!dnErrByVoucher.has(vkey)) dnErrByVoucher.set(vkey, []);
                    dnErrByVoucher.get(vkey).push(m);
                };
                const grnVoucherNo = get(raw, 'grn_voucher_no');
                if (!grnVoucherNo) {
                    pushErr(`DebitNotes row ${rowNum}: grn_voucher_no is required`);
                    continue;
                }
                const productCode = get(raw, 'product_code');
                if (!productCode) {
                    pushErr(`DebitNotes row ${rowNum}: product_code is required`);
                    continue;
                }
                const product = productByCode.get(productCode.toLowerCase());
                if (!product) {
                    pushErr(
                        `DebitNotes row ${rowNum}: product_code "${productCode}" not found`
                    );
                    continue;
                }
                const statusRaw = get(raw, 'status').toLowerCase() || 'draft';
                if (statusRaw !== 'draft' && statusRaw !== 'issued') {
                    pushErr(
                        `DebitNotes row ${rowNum}: status must be draft or issued`
                    );
                    continue;
                }
                const dnDateRaw = getRaw(raw, 'dn_date');
                const dn_date = dnDateRaw
                    ? parseDateCell(dnDateRaw) || undefined
                    : undefined;
                if (dnDateRaw && !dn_date) {
                    pushErr(
                        `DebitNotes row ${rowNum}: dn_date "${dnDateRaw}" could not be parsed`
                    );
                    continue;
                }
                const key = `${vkey}|||${grnVoucherNo.toLowerCase()}`;
                let group = groupByKey.get(key);
                if (!group) {
                    group = {
                        grn_voucher_no: grnVoucherNo,
                        dn_date,
                        notes: get(raw, 'notes') || undefined,
                        status: statusRaw as 'draft' | 'issued',
                        lines: [],
                    };
                    groupByKey.set(key, group);
                    orderByKey.push(key);
                    voucherByKey.set(key, vkey);
                }
                group.lines.push({
                    rowNum,
                    product_id: product._id.toString(),
                    returned_qty: get(raw, 'returned_qty') || undefined,
                    unit_price: get(raw, 'unit_price') || undefined,
                    remarks: get(raw, 'remarks') || undefined,
                });
            }
            for (const key of orderByKey) {
                const vkey = voucherByKey.get(key);
                if (!dnGroupsByVoucher.has(vkey)) dnGroupsByVoucher.set(vkey, []);
                dnGroupsByVoucher.get(vkey).push(groupByKey.get(key));
            }
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

            // Optional: pick a specific vendor address by label (blank →
            // createStandalone()'s own existing fallback to the vendor's
            // default address, unchanged).
            let vendor_address_id: string | undefined;
            const vendorAddressLabel = get(raw, 'vendor_address_label');
            if (vendorAddressLabel && vendor_id) {
                const addr = (vendorAddressesByVendorId.get(vendor_id) || []).find(
                    (a) => norm(a.label) === norm(vendorAddressLabel)
                );
                if (addr) vendor_address_id = addr._id.toString();
                else
                    warnings.push(
                        `vendor_address_label "${vendorAddressLabel}" not found on this vendor — using the vendor's default address`
                    );
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

            // Optional multi-link traceability (comma-separated SO voucher
            // numbers) — distinct from the single purchase_order_id FK
            // above. Falls back to [purchase_order_id] when blank, so
            // existing files (so_voucher_no only) keep working exactly as
            // before.
            let linked_purchase_order_ids: string[] | undefined;
            const linkedSoRaw = get(raw, 'linked_so_voucher_nos');
            if (linkedSoRaw) {
                const ids: string[] = [];
                for (const part of linkedSoRaw.split(',')) {
                    const v = part.trim();
                    if (!v) continue;
                    const so = soByVoucher.get(v.toLowerCase());
                    if (!so)
                        warnings.push(
                            `linked_so_voucher_nos "${v}" not found — skipped`
                        );
                    else ids.push(so._id.toString());
                }
                if (ids.length) linked_purchase_order_ids = ids;
            }
            if (!linked_purchase_order_ids && purchase_order_id) {
                linked_purchase_order_ids = [purchase_order_id];
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

            // dispatch_date — required once status lands DISPATCHED/CLOSED
            // (see the DTO doc comment on `PoVendorStandaloneCreateRequestDto
            // .dispatch_date`); every date-scoped report keys off this
            // field, so a historical row without one would silently read as
            // "today" everywhere.
            const dispatchDateRaw = getRaw(raw, 'dispatch_date');
            const dispatch_date = dispatchDateRaw
                ? parseDateCell(dispatchDateRaw) || undefined
                : undefined;
            if (dispatchDateRaw && !dispatch_date) {
                errors.push(`dispatch_date "${dispatchDateRaw}" could not be parsed`);
            }
            if (
                (status === ENUM_PO_VENDOR_STATUS.DISPATCHED ||
                    status === ENUM_PO_VENDOR_STATUS.CLOSED) &&
                !dispatch_date
            ) {
                errors.push(
                    'dispatch_date is required when status is dispatched or closed'
                );
            }

            // creation_date (optional — the real historical creation date;
            // blank defaults to today server-side, same as a live create).
            const creationDateRaw = getRaw(raw, 'creation_date');
            const creation_date = creationDateRaw
                ? parseDateCell(creationDateRaw) || undefined
                : undefined;
            if (creationDateRaw && !creation_date) {
                errors.push(
                    `creation_date "${creationDateRaw}" could not be parsed`
                );
            }

            // Historical currency + FX rate (both optional). The POV header
            // rate is INR-per-1-unit (native x rate = INR), the OPPOSITE of
            // the sales-doc convention — see CLAUDE.md section 4.
            const currency_code =
                get(raw, 'currency_code').toUpperCase() || undefined;
            const exchangeRateRaw = get(raw, 'exchange_rate');
            let exchange_rate: string | undefined;
            if (exchangeRateRaw) {
                const n = Number(exchangeRateRaw);
                if (!Number.isFinite(n) || n <= 0) {
                    errors.push(
                        `exchange_rate "${exchangeRateRaw}" must be a number greater than 0`
                    );
                } else if (!currency_code) {
                    errors.push(
                        'exchange_rate needs currency_code to be set as well'
                    );
                } else {
                    exchange_rate = String(n);
                }
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

            // A re-import of an already-existing voucher_no is a FULL UPDATE
            // (2026-09-10, replaces the old tax-rate-only behaviour) when the
            // existing VPO is still DRAFT. A DISPATCHED existing VPO isn't
            // fully locked though — the live app already lets qty/rate/
            // discount_pct be revised in place (line_edits) right up until a
            // GRN exists; the header and GST% are what actually freeze at
            // dispatch. So DISPATCHED is also 'valid_update' here, just via
            // that narrower in-place path (see importVpos' DISPATCHED
            // branch) instead of a full replace — new/removed lines aren't
            // supported there (can't add/drop items from a shipment
            // already with the vendor), and a GRN already existing makes
            // the whole thing a normal skip (caught at commit time, since
            // checking here would need a separate GRN-existence query).
            // Only CLOSED/CANCELLED (and any other non-draft/dispatched
            // status) are unconditionally skipped — no "revert to draft"
            // exists for a POV (§19.11: the qty audit trail is immutable).
            const existingRow = voucher_no
                ? existingPovByVoucher.get(vkey)
                : undefined;
            const existingRevisable =
                !!existingRow &&
                (existingRow.status === ENUM_PO_VENDOR_STATUS.DRAFT ||
                    existingRow.status === ENUM_PO_VENDOR_STATUS.DISPATCHED);
            let docStatus: VpoImportDoc['docStatus'];
            if (errors.length) docStatus = 'error';
            else if (existingRow && !existingRevisable) {
                docStatus = 'skip';
                warnings.push(
                    `Vendor PO ${voucher_no} is ${existingRow.status} — cannot be updated by re-import; this row will be skipped.`
                );
            } else if (existingRow) {
                docStatus = 'valid_update';
                if (existingRow.status === ENUM_PO_VENDOR_STATUS.DISPATCHED)
                    warnings.push(
                        `Vendor PO ${voucher_no} is dispatched — only qty/rate/discount will be revised in place (header and GST% are frozen); lines will be skipped instead if a GRN already exists.`
                    );
            } else docStatus = 'valid_new';

            // GRN/DebitNotes sheet problems surface as warnings on the VPO
            // row (not errors) — a bad GRN/DN row shouldn't block the VPO's
            // own valid header+lines from importing; that row is simply
            // skipped on its own at commit time (see processGrnGroups /
            // processDebitNoteGroups).
            warnings.push(
                ...(grnErrByVoucher.get(vkey) || []),
                ...(dnErrByVoucher.get(vkey) || [])
            );

            docs.push({
                voucher_no,
                rowNum,
                existingId: existingRow?._id?.toString(),
                vendor_id,
                purchase_order_id,
                linked_purchase_order_ids,
                vendor_address_id,
                dispatch_date,
                delivery_address_id,
                delivery_address,
                dispatched_through: get(raw, 'dispatched_through') || undefined,
                payment_terms: get(raw, 'payment_terms') || undefined,
                delivery_terms: get(raw, 'delivery_terms') || undefined,
                notes: get(raw, 'remarks') || undefined,
                internal_notes: get(raw, 'internal_notes') || undefined,
                invoice_number: get(raw, 'invoice_number') || undefined,
                creation_date,
                currency_code,
                exchange_rate,
                advance,
                status,
                lines,
                charges: chargesByVoucher.get(vkey) || [],
                grns: grnGroupsByVoucher.get(vkey) || [],
                debitNotes: dnGroupsByVoucher.get(vkey) || [],
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
            valid_update: docs.filter((d) => d.docStatus === 'valid_update')
                .length,
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
        updated: number;
        skipped: number;
        errors: { row: number; message: string }[];
        grnCreated: number;
        grnUpdated: number;
        grnSkipped: number;
        dnCreated: number;
        dnUpdated: number;
        dnSkipped: number;
    }> {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: { row: number; message: string }[] = [];
        let grnCreated = 0;
        let grnUpdated = 0;
        let grnSkipped = 0;
        let dnCreated = 0;
        let dnUpdated = 0;
        let dnSkipped = 0;

        this.requestContext.suppressAudit();

        for (const doc of docs) {
            // GRN(s)/Debit Note(s) are processed for every voucher except a
            // hard 'error' row (can't trust its context) — even a 'skip' VPO
            // row (e.g. already CLOSED) can legitimately get a corrected or
            // additional GRN via re-import. Runs regardless of what the VPO
            // branch below does with this doc.
            const processGrnDn = doc.docStatus !== 'error';

            if (doc.docStatus === 'skip') {
                skipped++;
                if (processGrnDn) {
                    const r = await this.processGrnAndDnGroups(
                        doc,
                        companyId,
                        userId,
                        errors
                    );
                    grnCreated += r.grnCreated;
                    grnUpdated += r.grnUpdated;
                    grnSkipped += r.grnSkipped;
                    dnCreated += r.dnCreated;
                    dnUpdated += r.dnUpdated;
                    dnSkipped += r.dnSkipped;
                }
                continue;
            }
            if (doc.docStatus === 'valid_update') {
                try {
                    const existing: any = await this.povRepository.findOne({
                        company_id: companyId,
                        voucher_no: doc.voucher_no,
                        soft_delete: false,
                    } as any);
                    if (!existing) {
                        skipped++;
                        continue;
                    }
                    if (existing.status === ENUM_PO_VENDOR_STATUS.DRAFT) {
                        await this.updateExistingDraftPov(
                            existing,
                            doc,
                            companyId,
                            userId
                        );
                        updated++;
                    } else if (
                        existing.status === ENUM_PO_VENDOR_STATUS.DISPATCHED
                    ) {
                        const revised = await this.reviseDispatchedPovLines(
                            existing,
                            doc,
                            companyId,
                            userId
                        );
                        if (revised) updated++;
                        else skipped++;
                    } else {
                        // Parse-time skip should have caught this, but the
                        // live record may have moved on since preview —
                        // never force-edit a closed/cancelled VPO.
                        skipped++;
                    }
                } catch (err: any) {
                    this.logger.error(
                        `VPO update ${doc.voucher_no} failed: ${err?.message}`
                    );
                    errors.push({
                        row: doc.rowNum,
                        message: err?.message || 'Update failed',
                    });
                }
                if (processGrnDn) {
                    const r = await this.processGrnAndDnGroups(
                        doc,
                        companyId,
                        userId,
                        errors
                    );
                    grnCreated += r.grnCreated;
                    grnUpdated += r.grnUpdated;
                    grnSkipped += r.grnSkipped;
                    dnCreated += r.dnCreated;
                    dnUpdated += r.dnUpdated;
                    dnSkipped += r.dnSkipped;
                }
                continue;
            }
            if (doc.docStatus !== 'valid_new') continue;
            try {
                const createdPov = await this.povService.createStandalone(
                    companyId,
                    {
                        vendor_id: doc.vendor_id,
                        vendor_address_id: doc.vendor_address_id,
                        invoice_number: doc.invoice_number,
                        creation_date: doc.creation_date,
                        // Explicit historical FX wins over the vendor-currency
                        // fallback inside resolvePovCurrency().
                        currency_code: doc.currency_code,
                        exchange_rate: doc.exchange_rate,
                        dispatch_date: doc.dispatch_date,
                        delivery_address_id: doc.delivery_address_id,
                        delivery_address: doc.delivery_address,
                        dispatched_through: doc.dispatched_through,
                        payment_terms: doc.payment_terms,
                        delivery_terms: doc.delivery_terms,
                        notes: doc.notes,
                        internal_notes: doc.internal_notes,
                        linked_sales_order_ids: doc.linked_purchase_order_ids,
                        lines: doc.lines.map((l) => ({
                            product_id: l.product_id,
                            ordered_qty: l.ordered_qty,
                            unit_price: l.unit_price,
                            discount_pct: l.discount_pct,
                            part_no: l.part_no,
                            hsn_code: l.hsn_code,
                            unit: l.unit,
                            tax_pct: l.tax_pct,
                            // Import-only field, not on the DTO's own type —
                            // createStandalone() reads it via an `as any`
                            // cast (see its own comment).
                            dispatched_qty: l.dispatched_qty,
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

                // GRN/DN creation is no longer auto-inferred from the VPO's
                // status here (removed 2026-09-10) — it's 100% sheet-driven
                // via the GRNs/DebitNotes sheets, processed uniformly below
                // for every doc regardless of docStatus.
            } catch (err: any) {
                this.logger.error(
                    `VPO import ${doc.voucher_no} failed: ${err?.message}`
                );
                errors.push({
                    row: doc.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
            if (processGrnDn) {
                const r = await this.processGrnAndDnGroups(
                    doc,
                    companyId,
                    userId,
                    errors
                );
                grnCreated += r.grnCreated;
                grnUpdated += r.grnUpdated;
                grnSkipped += r.grnSkipped;
                dnCreated += r.dnCreated;
                dnUpdated += r.dnUpdated;
                dnSkipped += r.dnSkipped;
            }
        }

        if (created || updated) {
            this.auditLogService.recordSummary({
                entity_name: 'PoVendorEntity',
                entity_label: `Vendor PO import — ${created + updated} order(s)`,
                summary: { created, updated, skipped, failed: errors.length },
                company_id: companyId,
                user_id: userId,
            });
        }
        if (grnCreated || grnUpdated) {
            this.auditLogService.recordSummary({
                entity_name: 'GrnEntity',
                entity_label: `GRN import (via VPO) — ${grnCreated + grnUpdated} receipt(s)`,
                summary: {
                    created: grnCreated,
                    updated: grnUpdated,
                    skipped: grnSkipped,
                    failed: 0,
                },
                company_id: companyId,
                user_id: userId,
            });
        }
        if (dnCreated || dnUpdated) {
            this.auditLogService.recordSummary({
                entity_name: 'DebitNoteEntity',
                entity_label: `Debit Note import (via VPO) — ${dnCreated + dnUpdated} note(s)`,
                summary: {
                    created: dnCreated,
                    updated: dnUpdated,
                    skipped: dnSkipped,
                    failed: 0,
                },
                company_id: companyId,
                user_id: userId,
            });
        }

        return {
            created,
            updated,
            skipped,
            errors,
            grnCreated,
            grnUpdated,
            grnSkipped,
            dnCreated,
            dnUpdated,
            dnSkipped,
        };
    }

    /**
     * Processes a voucher's `GRNs` groups, then its `DebitNotes` groups (a
     * DN needs the GRN it references to already exist — same pass, but DN
     * must run second). One failing group is caught and reported against
     * that group's own rows without failing the others.
     */
    private async processGrnAndDnGroups(
        doc: VpoImportDoc,
        companyId: string,
        userId: string,
        errors: { row: number; message: string }[]
    ): Promise<{
        grnCreated: number;
        grnUpdated: number;
        grnSkipped: number;
        dnCreated: number;
        dnUpdated: number;
        dnSkipped: number;
    }> {
        let grnCreated = 0;
        let grnUpdated = 0;
        let grnSkipped = 0;
        let dnCreated = 0;
        let dnUpdated = 0;
        let dnSkipped = 0;

        if (!doc.grns.length && !doc.debitNotes.length) {
            return { grnCreated, grnUpdated, grnSkipped, dnCreated, dnUpdated, dnSkipped };
        }

        const pov: any = await this.povRepository.findOne({
            company_id: companyId,
            voucher_no: doc.voucher_no,
            soft_delete: false,
        } as any);
        if (!pov) {
            if (doc.grns.length || doc.debitNotes.length) {
                errors.push({
                    row: doc.rowNum,
                    message: `GRNs/DebitNotes reference VPO ${doc.voucher_no}, but it doesn't exist.`,
                });
            }
            grnSkipped = doc.grns.length;
            dnSkipped = doc.debitNotes.length;
            return { grnCreated, grnUpdated, grnSkipped, dnCreated, dnUpdated, dnSkipped };
        }

        for (const group of doc.grns) {
            try {
                const result = await this.upsertGrnGroup(
                    pov,
                    group,
                    companyId,
                    userId
                );
                if (result === 'created') grnCreated++;
                else if (result === 'updated') grnUpdated++;
                else grnSkipped++;
            } catch (err: any) {
                grnSkipped++;
                this.logger.error(
                    `GRN import for VPO ${doc.voucher_no}${
                        group.grn_voucher_no ? ` (${group.grn_voucher_no})` : ''
                    } failed: ${err?.message}`
                );
                errors.push({
                    row: group.lines[0]?.rowNum || doc.rowNum,
                    message: `GRN ${group.grn_voucher_no || '(new)'}: ${
                        err?.message || 'import failed'
                    }`,
                });
            }
        }

        for (const group of doc.debitNotes) {
            try {
                const result = await this.upsertDebitNoteGroup(
                    pov,
                    group,
                    companyId,
                    userId
                );
                if (result === 'created') dnCreated++;
                else if (result === 'updated') dnUpdated++;
                else dnSkipped++;
            } catch (err: any) {
                dnSkipped++;
                this.logger.error(
                    `Debit Note import for VPO ${doc.voucher_no} (GRN ${group.grn_voucher_no}) failed: ${err?.message}`
                );
                errors.push({
                    row: group.lines[0]?.rowNum || doc.rowNum,
                    message: `Debit Note for GRN ${group.grn_voucher_no}: ${
                        err?.message || 'import failed'
                    }`,
                });
            }
        }

        return { grnCreated, grnUpdated, grnSkipped, dnCreated, dnUpdated, dnSkipped };
    }

    /**
     * Create-or-update ONE GRN group. Existing GRN is matched by
     * `grn_voucher_no` (an explicit, sheet-supplied real voucher — blank
     * means "always a new GRN, never matchable on a later re-import", same
     * trade-off every other auto-numbered import doc in this codebase
     * accepts). Only a DRAFT existing GRN is updatable — CONFIRMED/
     * CANCELLED are skipped, matching the "import treats it as locked"
     * decision (even though the live `GrnService.update()` itself doesn't
     * enforce that). `override: true` is always passed when confirming via
     * import — historical book data is trusted, and a qty-tolerance hold
     * would otherwise silently block the confirm with no operator present
     * to override it.
     */
    private async upsertGrnGroup(
        pov: any,
        group: GrnImportGroup,
        companyId: string,
        userId: string
    ): Promise<'created' | 'updated' | 'skipped'> {
        const existingGrn: any = group.grn_voucher_no
            ? await this.grnRepository.findOne({
                  company_id: companyId,
                  voucher_no: group.grn_voucher_no,
                  soft_delete: false,
              } as any)
            : null;
        // grn_voucher_no is meant to be a real, company-wide-unique historical
        // GRN number (same convention as every other voucher_no in this
        // system) — a collision with a DIFFERENT POV's GRN is a data error,
        // not "doesn't exist yet". Silently treating it as "not found" would
        // create a second GRN with the identical voucher_no (found via
        // testing: two ambiguous "GRN-REF-1" rows, ownerless-looking in any
        // GRN list search).
        if (existingGrn && existingGrn.po_vendor_id?.toString() !== pov._id.toString()) {
            throw new BadRequestException(
                `grn_voucher_no "${group.grn_voucher_no}" already belongs to a different Vendor PO (${
                    existingGrn.po_vendor_voucher_no || existingGrn.po_vendor_id
                }) — GRN voucher numbers must be unique.`
            );
        }

        if (existingGrn) {
            if (existingGrn.status !== ENUM_GRN_STATUS.DRAFT) {
                this.logger.warn(
                    `GRN ${group.grn_voucher_no} is ${existingGrn.status} — skipped (only DRAFT GRNs are updated by re-import).`
                );
                return 'skipped';
            }
            const existingLines = await this.grnLineRepository.findByGrnId(
                existingGrn._id.toString()
            );
            const byProduct = new Map<string, any>();
            for (const l of existingLines as any[])
                if (l.product_id) byProduct.set(l.product_id.toString(), l);
            const lineEdits: any[] = [];
            for (const ln of group.lines) {
                const row = byProduct.get(ln.product_id);
                if (!row) {
                    this.logger.warn(
                        `GRN ${group.grn_voucher_no}: product ${ln.product_id} isn't on this GRN — cannot add a new line, skipped.`
                    );
                    continue;
                }
                // Sheet `received_qty` means GOOD units received (matches
                // the live Receipt & Quality Check form's own "Received"
                // field — entered independently of Rejected, same
                // convention its own help text uses: "Received (good) and
                // Rejected are entered independently"). It maps to the
                // GRN line's `accepted_qty`, NOT its `received_qty` column
                // (a separate, internal "gross processed so far" field —
                // accepted + rejected — that the entity's own invariant
                // requires and `update()`'s validation checks against, but
                // that the live UI never surfaces on its own; correction
                // 2026-09-10, the sheet's received_qty used to be treated
                // as that gross figure, silently under-crediting accepted
                // qty by the rejected amount).
                const received = round4(num(ln.received_qty));
                const rejected = round4(num(ln.rejected_qty));
                lineEdits.push({
                    _id: row._id.toString(),
                    received_qty: String(round4(received + rejected)),
                    rejected_qty: String(rejected),
                    accepted_qty: String(received),
                    batch_no: ln.batch_no,
                    remarks: ln.remarks,
                });
            }
            if (group.invoice_number !== undefined) {
                existingGrn.po_vendor_invoice_number = group.invoice_number || null;
                await this.grnRepository.save(existingGrn);
            }
            await this.grnService.update(
                companyId,
                existingGrn._id.toString(),
                {
                    grn_date: group.grn_date,
                    notes: group.notes,
                    status: group.status as any,
                    lines: lineEdits,
                    override: group.status === 'confirmed',
                } as any,
                userId
            );
            return 'updated';
        }

        const created = await this.grnService.createFromPov(
            companyId,
            pov._id.toString(),
            {
                grn_date: group.grn_date,
                invoice_number: group.invoice_number,
                notes: group.notes,
            },
            userId,
            { voucher_no: group.grn_voucher_no, silent: true }
        );
        const newLines = await this.grnLineRepository.findByGrnId(
            created._id.toString()
        );
        const byProduct = new Map<string, any>();
        for (const l of newLines as any[])
            if (l.product_id) byProduct.set(l.product_id.toString(), l);
        const lineEdits: any[] = [];
        for (const ln of group.lines) {
            const row = byProduct.get(ln.product_id);
            if (!row) {
                this.logger.warn(
                    `GRN ${group.grn_voucher_no || created.voucher_no}: product ${ln.product_id} has nothing pending to receive (already fully received on other GRNs, or not dispatched) — skipped.`
                );
                continue;
            }
            // Same received_qty→accepted_qty mapping as the existing-GRN
            // branch above — see its comment.
            const received = round4(num(ln.received_qty));
            const rejected = round4(num(ln.rejected_qty));
            lineEdits.push({
                _id: row._id.toString(),
                received_qty: String(round4(received + rejected)),
                rejected_qty: String(rejected),
                accepted_qty: String(received),
                batch_no: ln.batch_no,
                remarks: ln.remarks,
            });
        }
        await this.grnService.update(
            companyId,
            created._id.toString(),
            {
                lines: lineEdits,
                status: group.status as any,
                override: group.status === 'confirmed',
            } as any,
            userId
        );
        return 'created';
    }

    /**
     * Create-or-update ONE Debit Note group, keyed by its source GRN (always
     * 1:1 — `createFromGrn` enforces one active DN per GRN, so no separate
     * ref column is needed). Requires that GRN to already be CONFIRMED
     * (either just processed above in this same pass, or already live).
     * Only a DRAFT existing DN is updatable — ISSUED/CANCELLED skipped.
     */
    private async upsertDebitNoteGroup(
        pov: any,
        group: DnImportGroup,
        companyId: string,
        userId: string
    ): Promise<'created' | 'updated' | 'skipped'> {
        const grn: any = await this.grnRepository.findOne({
            company_id: companyId,
            voucher_no: group.grn_voucher_no,
            soft_delete: false,
        } as any);
        if (!grn || grn.po_vendor_id?.toString() !== pov._id.toString()) {
            throw new BadRequestException(
                `GRN ${group.grn_voucher_no} not found on this VPO.`
            );
        }
        if (grn.status !== ENUM_GRN_STATUS.CONFIRMED) {
            throw new BadRequestException(
                `GRN ${group.grn_voucher_no} is ${grn.status} — a Debit Note can only be raised against a confirmed GRN.`
            );
        }

        const existingDns = await this.debitNoteRepository.findByGrnId(
            companyId,
            grn._id.toString()
        );
        const existingDn = existingDns.find(
            (d: any) => d.status !== ENUM_DEBIT_NOTE_STATUS.CANCELLED
        );

        if (existingDn) {
            if ((existingDn as any).status !== ENUM_DEBIT_NOTE_STATUS.DRAFT) {
                this.logger.warn(
                    `Debit Note for GRN ${group.grn_voucher_no} is ${(existingDn as any).status} — skipped (only DRAFT is updated by re-import).`
                );
                return 'skipped';
            }
            const existingLines =
                await this.debitNoteLineRepository.findByDebitNoteId(
                    (existingDn as any)._id.toString()
                );
            const byProduct = new Map<string, any>();
            for (const l of existingLines as any[])
                if (l.product_id) byProduct.set(l.product_id.toString(), l);
            const lineEdits: any[] = [];
            for (const ln of group.lines) {
                const row = byProduct.get(ln.product_id);
                if (!row) {
                    this.logger.warn(
                        `Debit Note for GRN ${group.grn_voucher_no}: product ${ln.product_id} isn't a rejected line on this GRN — skipped.`
                    );
                    continue;
                }
                lineEdits.push({
                    _id: row._id.toString(),
                    returned_qty: ln.returned_qty,
                    unit_price: ln.unit_price,
                    remarks: ln.remarks,
                });
            }
            await this.debitNoteService.update(
                companyId,
                (existingDn as any)._id.toString(),
                {
                    dn_date: group.dn_date,
                    notes: group.notes,
                    lines: lineEdits,
                    status:
                        group.status === 'issued'
                            ? (ENUM_DEBIT_NOTE_STATUS.ISSUED as any)
                            : undefined,
                } as any,
                userId
            );
            return 'updated';
        }

        const rejectedLines = await this.grnLineRepository.findByGrnId(
            grn._id.toString()
        );
        const byProduct = new Map<string, any>();
        for (const l of rejectedLines as any[])
            if (l.product_id && round4(num(l.rejected_qty)) > 1e-6)
                byProduct.set(l.product_id.toString(), l);
        const overrides: any[] = [];
        for (const ln of group.lines) {
            const row = byProduct.get(ln.product_id);
            if (!row) {
                this.logger.warn(
                    `Debit Note for GRN ${group.grn_voucher_no}: product ${ln.product_id} has no rejected qty on this GRN — skipped.`
                );
                continue;
            }
            overrides.push({
                grn_line_id: row._id.toString(),
                returned_qty: ln.returned_qty,
                unit_price: ln.unit_price,
                remarks: ln.remarks,
            });
        }
        const created = await this.debitNoteService.createFromGrn(
            companyId,
            grn._id.toString(),
            {
                dn_date: group.dn_date,
                notes: group.notes,
                lines: overrides.length ? overrides : undefined,
            } as any,
            userId,
            { silent: true }
        );
        if (group.status === 'issued') {
            await this.debitNoteService.update(
                companyId,
                created._id.toString(),
                { status: ENUM_DEBIT_NOTE_STATUS.ISSUED as any } as any,
                userId
            );
        }
        return 'created';
    }

    /**
     * Full header+lines+charges update for a re-imported voucher whose
     * existing VPO is still DRAFT (guaranteed by the caller). Doesn't route
     * through `PoVendorService.update()`'s `lines` path — that goes through
     * `replaceLinesOnDraft()`, which requires every line to carry a
     * `purchase_order_line_id` (a PO-backed POV's own matching logic); an
     * imported VPO is always standalone (`createStandalone`, lines with
     * `purchase_order_line_id = null`), so lines are replaced directly here,
     * mirroring `createStandalone()`'s own line-creation loop instead.
     *
     * Status/dispatch_date/actual_arrival_date are also written directly
     * (not via `update()`'s `status` field, which enforces the live
     * draft→dispatched→closed transition guard and has no dispatch_date
     * field at all) — same historical-import bypass `createStandalone()`
     * already uses for a fresh `valid_new` row landing straight at
     * dispatched/closed.
     *
     * Advance is intentionally NOT re-applied here (unlike every other
     * header field): it's a recorded vendor Payment, not a column — running
     * it again on every re-import would double-post the payment. If the
     * sheet's advance changed, that's a manual/Payments-tab correction.
     */
    private async updateExistingDraftPov(
        existing: any,
        doc: VpoImportDoc,
        companyId: string,
        userId: string
    ): Promise<void> {
        const povId = existing._id.toString();
        const targetDispatchedOrClosed =
            doc.status === ENUM_PO_VENDOR_STATUS.DISPATCHED ||
            doc.status === ENUM_PO_VENDOR_STATUS.CLOSED;

        // ── Lines: full replace, standalone-style (no purchase_order_line_id) ──
        const productIds = Array.from(
            new Set(doc.lines.map((l) => l.product_id))
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
                  company_id: companyId,
              } as any)
            : [];
        const productById = new Map<string, any>();
        for (const p of products as any[]) productById.set(p._id.toString(), p);

        await this.povLineRepository.deleteByPoVendorId(povId);
        let seq = 0;
        for (const ln of doc.lines) {
            seq += 1;
            const prod = productById.get(ln.product_id);
            const ordered = num(ln.ordered_qty);
            const unitPrice = num(ln.unit_price);
            const discount = num(ln.discount_pct);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                purchase_order_line_id: null,
                product_id: ln.product_id,
                description: prod?.description || prod?.name || null,
                part_no: ln.part_no || prod?.part_no || null,
                hsn_code: ln.hsn_code || prod?.hsn_code || null,
                unit: ln.unit || prod?.unit_of_measure || null,
                tax_pct: String(ln.tax_pct ?? prod?.tax_pct ?? '0'),
                unit_price: String(unitPrice),
                ordered_qty: String(ordered),
                discount_pct: String(discount),
                dispatched_qty: targetDispatchedOrClosed
                    ? ln.dispatched_qty != null && ln.dispatched_qty !== ''
                        ? String(Math.max(0, num(ln.dispatched_qty)))
                        : String(ordered)
                    : '0',
                received_qty: '0',
                line_total: String(
                    round2(ordered * unitPrice * (1 - discount / 100))
                ),
                seq,
            } as any);
            // Same "auto-add missing (vendor, product) to the price list"
            // behaviour createStandalone()'s own silent branch does — this
            // path bypasses createStandalone entirely (builds lines
            // directly), so it needs its own call.
            await this.povService.autoAddMissingPriceListEntry(
                companyId,
                existing.vendor_id?.toString(),
                ln.product_id,
                unitPrice,
                userId
            );
        }

        // ── Header scalar fields + expenses (all draft-editable, one call) ──
        const updatePayload: Record<string, any> = {
            dispatched_through: doc.dispatched_through,
            payment_terms: doc.payment_terms,
            delivery_terms: doc.delivery_terms,
            notes: doc.notes,
            internal_notes: doc.internal_notes,
            invoice_number: doc.invoice_number,
            creation_date: doc.creation_date,
            ...(doc.currency_code ? { currency_code: doc.currency_code } : {}),
            ...(doc.exchange_rate ? { exchange_rate: doc.exchange_rate } : {}),
            expenses: doc.charges.map((c) => ({
                expense_id: c.expense_id,
                type: c.type,
                value: c.value,
                gst_pct: c.gst_pct,
            })),
        };
        if (doc.delivery_address_id)
            updatePayload.delivery_address_id = doc.delivery_address_id;
        else if (doc.delivery_address)
            updatePayload.delivery_address = doc.delivery_address;
        if (doc.linked_purchase_order_ids)
            updatePayload.linked_sales_order_ids = doc.linked_purchase_order_ids;
        await this.povService.update(existing, updatePayload as any, userId);

        // ── Header-level source SO link (single FK, separate from the
        // linked_sales_orders snapshot above) — same best-effort patch as
        // the valid_new branch. ──
        if (doc.purchase_order_id) {
            try {
                const row = await this.povRepository.findOneById(povId);
                (row as any).purchase_order_id = doc.purchase_order_id;
                await this.povRepository.save(row as any);
            } catch (e: any) {
                this.logger.warn(
                    `VPO ${doc.voucher_no}: could not link SO — ${e?.message}`
                );
            }
        }

        // ── Vendor address — direct write (not in update()'s draftEditable
        // allowlist at all — the live app never lets this change after
        // create). Only touched when the sheet gives an explicit
        // vendor_address_label; blank means "leave whatever it already is",
        // unlike create's "blank → vendor's default" (there's no sensible
        // "revert to default" meaning on an update). ──
        if (doc.vendor_address_id) {
            try {
                const row = await this.povRepository.findOneById(povId);
                (row as any).vendor_address_id = doc.vendor_address_id;
                await this.povRepository.save(row as any);
            } catch (e: any) {
                this.logger.warn(
                    `VPO ${doc.voucher_no}: could not set vendor address — ${e?.message}`
                );
            }
        }

        // ── Status / dispatch_date / actual_arrival_date — direct write,
        // same historical-import bypass as createStandalone(). Only touched
        // when the sheet actually moves the doc past draft. Deliberately
        // does NOT auto-raise/confirm a GRN here, unlike `valid_new` — that
        // auto-receipt is a fresh-create-only historical-backfill shortcut
        // (there's no live document yet, so import is the only way to
        // establish the full history in one shot). Correcting an EXISTING
        // draft's status via re-import is the update-path equivalent of
        // clicking "Dispatch" in the UI, which never creates a GRN either —
        // it's a separate, deliberate action. Auto-raising one here would
        // silently receive goods the operator never said arrived, and
        // (since a full GRN receipt auto-closes the POV) could jump the
        // status straight to CLOSED from a plain "mark this dispatched"
        // edit — exactly the bug this comment is here to prevent
        // reintroducing (2026-09-10, caught in review).
        if (doc.status !== ENUM_PO_VENDOR_STATUS.DRAFT) {
            const row = await this.povRepository.findOneById(povId);
            (row as any).status = doc.status;
            (row as any).dispatch_date = doc.dispatch_date || null;
            (row as any).actual_arrival_date = doc.dispatch_date || null;
            await this.povRepository.save(row as any);
        }
    }

    /**
     * Narrower re-import revision for an existing DISPATCHED voucher — the
     * live app already allows qty/rate/discount_pct to be revised in place
     * (`PoVendorService.update()`'s `line_edits`) right up until a GRN
     * exists; the header and GST% are what actually freeze at dispatch (see
     * the "This Vendor PO is already with the vendor" banner on the Edit
     * page). So instead of the full replace `updateExistingDraftPov()` does
     * for DRAFT, this matches sheet lines to existing lines by product_id
     * and patches ONLY `ordered_qty`/`unit_price` in place — never `_id`
     * `tax_pct` (would throw: GST is frozen once dispatched), never adds or
     * removes a line (can't change what's already shipped to the vendor).
     *
     * Returns false (treated as a skip by the caller) when nothing could be
     * applied — no sheet line matched an existing product, or `update()`
     * itself rejects the whole batch (most commonly: a GRN already exists,
     * which the parse-time preview can't cheaply know in advance).
     */
    private async reviseDispatchedPovLines(
        existing: any,
        doc: VpoImportDoc,
        companyId: string,
        userId: string
    ): Promise<boolean> {
        const existingLines = (await this.povLineRepository.findAll({
            po_vendor_id: existing._id.toString(),
        } as any)) as any[];
        const existingByProduct = new Map<string, any>();
        for (const l of existingLines)
            if (l.product_id) existingByProduct.set(l.product_id.toString(), l);

        const lineEdits: Array<{
            _id: string;
            ordered_qty: string;
            unit_price: string;
            discount_pct: string;
        }> = [];
        for (const ln of doc.lines) {
            const existingLine = existingByProduct.get(ln.product_id);
            if (!existingLine) {
                this.logger.warn(
                    `VPO ${doc.voucher_no}: product ${ln.product_id} isn't on the dispatched voucher — cannot add a new line post-dispatch, skipped.`
                );
                continue;
            }
            lineEdits.push({
                _id: existingLine._id.toString(),
                ordered_qty: String(num(ln.ordered_qty)),
                unit_price: String(num(ln.unit_price)),
                // Discount rides the same rules as the rate (editable until
                // a GRN exists) — same as updateExistingDraftPov's full
                // replace. '0' when the sheet has no column/value, matching
                // the create path's own default rather than leaving it
                // undefined (which would mean "don't touch" and silently
                // strand a stale discount from before this revision).
                discount_pct: String(num(ln.discount_pct)),
            });
        }
        if (!lineEdits.length) return false;

        try {
            await this.povService.update(
                existing,
                {
                    line_edits: lineEdits,
                    notes: doc.notes,
                    internal_notes: doc.internal_notes,
                } as any,
                userId
            );
            return true;
        } catch (err: any) {
            // Most commonly: a GRN already exists (update() blocks price/qty
            // edits once one does) — same "too late to touch" outcome as
            // any other locked skip, just discovered at commit time instead
            // of preview time.
            this.logger.warn(
                `VPO ${doc.voucher_no}: dispatched-line revision skipped — ${err?.message}`
            );
            return false;
        }
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
        const vendorAddresses = vendors.length
            ? await this.vendorAddressRepository.findByVendorIds(
                  (vendors as any[]).map((v) => v._id.toString())
              )
            : [];
        const vendorAddressLabelById = new Map<string, string>();
        for (const a of vendorAddresses as any[])
            vendorAddressLabelById.set(a._id.toString(), a.label || '');
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
        const grnData: any[] = [];
        const dnData: any[] = [];
        for (const p of vpos) {
            headerData.push({
                voucher_no: p.voucher_no || '',
                vendor_code: vendorCodeById.get(p.vendor_id?.toString()) || '',
                so_voucher_no:
                    soVoucherById.get(p.purchase_order_id?.toString()) || '',
                linked_so_voucher_nos: ((p.linked_sales_orders || []) as any[])
                    .map((s) => s.voucher_no)
                    .filter(Boolean)
                    .join(', '),
                dispatch_date: isoDate(p.dispatch_date),
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
                invoice_number: p.invoice_number || '',
                creation_date: isoDate(p.creation_date),
                vendor_address_label:
                    vendorAddressLabelById.get(p.vendor_address_id?.toString()) ||
                    '',
                currency_code: p.currency_code || '',
                // Blank for an INR-native POV so a round-trip re-import does
                // not pin a meaningless rate of 1 onto every home-currency row.
                exchange_rate:
                    num(p.exchange_rate) && num(p.exchange_rate) !== 1
                        ? String(p.exchange_rate)
                        : '',
            });
            const povExchangeRate = num(p.exchange_rate) || 1;
            // Blank for an INR-native POV (exchange_rate === 1 by
            // construction — resolvePovCurrency always pins it to 1 for the
            // home currency) — a column applies to the whole sheet, so it
            // can't be removed only for some rows, but leaving it blank
            // keeps INR rows visually uncluttered while foreign-currency
            // rows still show their INR equivalent.
            const inrTotal = (total: number): string | number =>
                povExchangeRate !== 1 ? round2(total * povExchangeRate) : '';
            const lines = (await this.povLineRepository.findAll({
                po_vendor_id: p._id.toString(),
            } as any)) as any[];
            const poLineById = new Map<string, any>();
            for (const ln of lines) poLineById.set(ln._id.toString(), ln);
            for (const ln of lines) {
                const qty = num(ln.ordered_qty);
                const rate = num(ln.unit_price);
                const disc = num(ln.discount_pct);
                const taxable = round2(qty * rate * (1 - disc / 100));
                const gstValue = round2(taxable * (num(ln.tax_pct) / 100));
                const total = round2(taxable + gstValue);
                lineData.push({
                    voucher_no: p.voucher_no || '',
                    product_code: codeById.get(ln.product_id?.toString()) || '',
                    part_no: ln.part_no ?? '',
                    hsn: ln.hsn_code ?? '',
                    uom: ln.unit ?? '',
                    qty: ln.ordered_qty ?? '',
                    rate: ln.unit_price ?? '',
                    discount_pct: ln.discount_pct ?? '',
                    gst_pct: ln.tax_pct ?? '',
                    dispatched_qty: ln.dispatched_qty ?? '',
                    taxable,
                    gst_value: gstValue,
                    total,
                    total_inr: inrTotal(total),
                });
            }
            for (const ch of p.expenses_snapshot || []) {
                const taxable = num(ch.amount);
                const gstValue = round2(taxable * (num(ch.gst_pct) / 100));
                const total = round2(taxable + gstValue);
                chargeData.push({
                    voucher_no: p.voucher_no || '',
                    charge_code: ch.code || '',
                    hsn_code: ch.hsn_code || '',
                    type: ch.type || '',
                    value: ch.value ?? '',
                    gst_pct: ch.gst_pct ?? '',
                    taxable,
                    gst_value: gstValue,
                    total,
                    total_inr: inrTotal(total),
                });
            }

            const grns = (await this.grnRepository.findAll({
                company_id: companyId,
                po_vendor_id: p._id.toString(),
                soft_delete: false,
            } as any)) as any[];
            for (const g of grns) {
                const gLines = await this.grnLineRepository.findByGrnId(
                    g._id.toString()
                );
                for (const gl of gLines as any[]) {
                    // GRN lines carry no rate/GST of their own — valued
                    // against the matching POV line, on ACCEPTED qty (what
                    // the vendor is actually billed for, excluding rejected
                    // units), not received qty.
                    const poLine = gl.po_vendor_line_id
                        ? poLineById.get(gl.po_vendor_line_id.toString())
                        : undefined;
                    const accepted = num(gl.accepted_qty);
                    const rate = num(poLine?.unit_price);
                    const disc = num(poLine?.discount_pct);
                    const gstPct = num(poLine?.tax_pct);
                    const taxable = round2(accepted * rate * (1 - disc / 100));
                    const gstValue = round2(taxable * (gstPct / 100));
                    const total = round2(taxable + gstValue);
                    grnData.push({
                        po_vendor_voucher_no: p.voucher_no || '',
                        grn_voucher_no: g.voucher_no || '',
                        grn_date: isoDate(g.grn_date),
                        invoice_number: g.po_vendor_invoice_number || '',
                        notes: g.notes || '',
                        status: g.status || '',
                        product_code:
                            codeById.get(gl.product_id?.toString()) || '',
                        // gl.accepted_qty (not gl.received_qty) — matches
                        // what the live Receipt & Quality Check page itself
                        // labels "Received" (see GRN_HEADERS_EXPORT comment).
                        received_qty: gl.accepted_qty ?? '',
                        rejected_qty: gl.rejected_qty ?? '',
                        batch_no: gl.batch_no || '',
                        remarks: gl.remarks || '',
                        unit_price: poLine?.unit_price ?? '',
                        discount_pct: poLine?.discount_pct ?? '',
                        gst_pct: poLine?.tax_pct ?? '',
                        taxable,
                        gst_value: gstValue,
                        total,
                        total_inr: inrTotal(total),
                    });
                }

                const dns = await this.debitNoteRepository.findByGrnId(
                    companyId,
                    g._id.toString()
                );
                for (const dn of dns as any[]) {
                    const dnLines =
                        await this.debitNoteLineRepository.findByDebitNoteId(
                            dn._id.toString()
                        );
                    for (const dl of dnLines as any[]) {
                        const total = num(dl.line_total);
                        dnData.push({
                            po_vendor_voucher_no: p.voucher_no || '',
                            grn_voucher_no: g.voucher_no || '',
                            dn_date: isoDate(dn.dn_date),
                            notes: dn.notes || '',
                            product_code:
                                codeById.get(dl.product_id?.toString()) || '',
                            returned_qty: dl.returned_qty ?? '',
                            unit_price: dl.unit_price ?? '',
                            remarks: dl.remarks ?? '',
                            status: dn.status || '',
                            part_no: dl.part_no || '',
                            hsn_code: dl.hsn_code || '',
                            rejected_qty: dl.rejected_qty ?? '',
                            discount_pct: dl.discount_pct ?? '',
                            total,
                            total_inr: inrTotal(total),
                        });
                    }
                }
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
                data: lineData.length ? lineData : [tmpl(LINE_HEADERS_EXPORT)],
            },
            {
                sheetName: 'VendorCharges',
                data: chargeData.length
                    ? chargeData
                    : [tmpl(CHARGE_HEADERS_EXPORT)],
            },
            {
                sheetName: 'GRNs',
                data: grnData.length ? grnData : [tmpl(GRN_HEADERS_EXPORT)],
            },
            {
                sheetName: 'DebitNotes',
                data: dnData.length
                    ? dnData
                    : [tmpl(DEBIT_NOTE_HEADERS_EXPORT)],
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
            // Voided payments don't count — a re-import of a payment that was
            // voided must be recorded again, not skipped as a duplicate.
            const pays = (await this.povPaymentRepository.findNonVoidedByPoVendorId(
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
        this.requestContext.suppressAudit();
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

        if (created) {
            this.auditLogService.recordSummary({
                entity_name: 'PoVendorPaymentEntity',
                entity_label: `Vendor payment import — ${created} payment(s)`,
                summary: { created, skipped, failed: errors.length },
                company_id: companyId,
                user_id: userId,
            });
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
            // Voided payments are left out: this sheet is the re-importable
            // record of what was actually paid.
            const pays = (await this.povPaymentRepository.findNonVoidedByPoVendorId(
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
