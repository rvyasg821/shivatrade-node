import { Injectable, Logger } from '@nestjs/common';
import { utils, write } from 'xlsx';

import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { InvoiceService } from './invoice.service';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const lc = (v: any) => String(v ?? '').trim().toLowerCase();
const numOrUndef = (v: any): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

// UQC codes the FE allows on the Invoice line picker. Imported value
// must be one of these (case-insensitive).
const UQC_CODES = new Set(
    [
        'NOS',
        'KGS',
        'MTR',
        'LTR',
        'SET',
        'PCS',
        'BOX',
        'PAC',
        'TON',
        'SQM',
        'CBM',
        'GMS',
        'MLT',
        'DOZ',
    ].map((c) => c.toLowerCase()),
);

export type InvoiceLineImportStatus =
    | 'new'
    | 'updated'
    | 'skipped'
    | 'error';

export interface InvoiceLineResolvedRow {
    rowNum: number;
    status: InvoiceLineImportStatus;
    errors: string[];
    warnings: string[];
    data: any;
}

@Injectable()
export class InvoiceLineImportService {
    private readonly logger = new Logger(InvoiceLineImportService.name);

    constructor(
        private readonly invoiceService: InvoiceService,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoiceLineRepository: InvoiceLineRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
    ) {}

    // ──────────────────────────────────────────────────────────────────
    // 1. Build the xlsx the user will edit and re-upload.
    //    Sheet 1: current draft lines (or, when no draft yet, the addable
    //             SO lines seeded with their full available qty).
    //    Sheet 2 (read-only reference): every addable SO line with the IDs
    //             a user needs to add a brand-new row by hand.
    // ──────────────────────────────────────────────────────────────────
    async exportWorkbook(opts: {
        companyId: string;
        purchaseOrderId: string;
        invoiceId?: string;
        /**
         * In-memory rows from the form. When provided, these override the
         * persisted draft — keeps the workbook in sync with unsaved edits
         * on screen instead of dropping them.
         */
        liveLines?: Array<Record<string, any>>;
    }): Promise<{ buffer: Buffer; filename: string }> {
        const { companyId, purchaseOrderId, invoiceId, liveLines } = opts;
        const addable = await this.invoiceService.getAddablePoLines(
            purchaseOrderId,
            invoiceId,
        );

        // Current draft lines — live form snapshot wins over the
        // persisted draft so unsaved edits show up in the export.
        const draftLines: any[] = Array.isArray(liveLines)
            ? (liveLines as any[])
            : invoiceId
              ? await this.invoiceLineRepository.findByInvoiceId(invoiceId)
              : [];

        // Hydrate product names/codes for the export rows so the file is
        // human-readable even before re-upload.
        const productIds = Array.from(
            new Set(
                draftLines
                    .map((l: any) => l.product_id?.toString())
                    .filter((v: any): v is string => !!v),
            ),
        );
        const products = productIds.length
            ? ((await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)) as any[])
            : [];
        const productById = new Map<string, any>(
            products.map((p) => [p._id.toString(), p]),
        );

        // ── Rebate / expense columns — costing-worksheet layout ──────────
        //
        // ONE COLUMN PER MASTER CODE, and the cell holds that code's VALUE for
        // the line. Blank = the code is not applied. This replaces the old
        // layout, which emitted N repeated `rebate` / `expense` columns holding
        // CODES: that could only ever say "this rebate applies", never "at what
        // rate", so a per-line override was impossible to express in the sheet
        // and every import silently reset the line to the master's default.
        //
        // Mirrors `sales-doc-import.service.buildCostingWorkbook()` exactly, so
        // the Invoice sheet and the Quotation / Sales Order costing worksheet
        // behave identically.
        const [expenseMasters, rebateMasters] = await Promise.all([
            this.expenseRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
            this.rebateRepository.findAll({
                company_id: companyId,
                soft_delete: false,
            } as any),
        ]);
        const isActiveMaster = (m: any): boolean =>
            m?.is_active !== false &&
            String(m?.status ?? '').toUpperCase() !== 'INACTIVE';

        // Active masters become columns, UNIONED with any code already sitting
        // on a line — so a code that has since been deactivated but is still
        // used by this invoice keeps its column instead of being silently lost.
        const expenseColTypes = new Map<string, string>();
        for (const m of expenseMasters as any[])
            if (isActiveMaster(m) && m.code)
                expenseColTypes.set(m.code, lc(m.type) || 'fixed');
        const rebateColTypes = new Map<string, string>();
        for (const m of rebateMasters as any[])
            if (isActiveMaster(m) && m.code)
                rebateColTypes.set(m.code, lc(m.type) || 'percent');
        for (const l of draftLines as any[]) {
            for (const e of (l.product_expenses_snapshot || []) as any[])
                if (e?.code && !expenseColTypes.has(e.code))
                    expenseColTypes.set(e.code, lc(e.type) || 'fixed');
            for (const r of (l.product_rebates_snapshot || []) as any[])
                if (r?.code && !rebateColTypes.has(r.code))
                    rebateColTypes.set(r.code, lc(r.type) || 'percent');
        }
        const expenseCols = Array.from(expenseColTypes.keys()).sort();
        const rebateCols = Array.from(rebateColTypes.keys()).sort();
        // Percent codes get a "(%)" header suffix; flat codes stay bare.
        const colHeader = (code: string, type?: string): string =>
            lc(type) === 'percent' ? `${code}(%)` : code;

        const baseHeaders = [
            'product_code',
            // Display-only — shows which product each code is. The importer
            // resolves the line by product_code (against the bound SO) and
            // never reads this column, so edits here are ignored.
            'product_name',
            // `description` is pre-filled with the product name on a
            // fresh export; any edits the operator makes in Excel land
            // back on the line's `description` field at import time.
            'description',
            'hsn_code',
            'part_no',
            'customer_reference',
            'qty',
            'uqc_code',
            'unit_price',
            'discount_pct',
            'igst_rate_pct',
            // Packing List columns — operator-editable; feed the invoice's
            // per-line packing + the auto-summed cargo totals.
            'packages',
            'net_weight',
            'gross_weight',
        ];
        const computedHeaders = ['line_total'];
        const headerRow: string[] = [
            ...baseHeaders,
            ...expenseCols.map((c) => colHeader(c, expenseColTypes.get(c))),
            ...rebateCols.map((c) => colHeader(c, rebateColTypes.get(c))),
            ...computedHeaders,
        ];

        const sourceLines: any[] =
            draftLines.length > 0
                ? draftLines
                : addable.map((a) => ({
                      _id: undefined,
                      purchase_order_line_id: a.purchase_order_line_id,
                      product_id: a.product_id,
                      product_name: a.product_name,
                      product_code: a.product_code,
                      description: a.description,
                      hsn_code: a.hsn_code,
                      part_no: a.part_no,
                      customer_reference: a.customer_reference,
                      qty: a.available,
                      unit: a.unit,
                      uqc_code: '',
                      unit_price: a.unit_price,
                      discount_pct: 0,
                      igst_rate_pct: 0,
                      packages: a.package_count ?? '',
                      net_weight: a.net_weight_kg ?? '',
                      gross_weight: a.gross_weight_kg ?? '',
                      line_total: 0,
                      product_rebates_snapshot: a.product_rebates_snapshot,
                      product_expenses_snapshot: a.product_expenses_snapshot,
                  }));

        const dataAoa = sourceLines.map((l: any, i: number) => {
            const prod = productById.get(l.product_id?.toString());
            // One cell per master code, holding this line's VALUE for it.
            // Absent → blank, which the importer reads as "not applied".
            const expByCode = new Map<string, number>();
            for (const e of (l.product_expenses_snapshot || []) as any[])
                if (e?.code) expByCode.set(e.code, num(e.value));
            const rebByCode = new Map<string, number>();
            for (const r of (l.product_rebates_snapshot || []) as any[])
                if (r?.code) rebByCode.set(r.code, num(r.pct));
            const expCells = expenseCols.map((code) =>
                expByCode.has(code) ? expByCode.get(code) : '',
            );
            const rebCells = rebateCols.map((code) =>
                rebByCode.has(code) ? rebByCode.get(code) : '',
            );
            // Pre-fill description with the product name when blank so
            // the export ships a sensible default. Operator edits to
            // this column flow back into `description` on import.
            const descriptionCell =
                l.description || l.product_name || prod?.name || '';
            return [
                l.product_code || prod?.code || '',
                l.product_name || prod?.name || '',
                descriptionCell,
                l.hsn_code || '',
                l.part_no || prod?.part_no || '',
                l.customer_reference || '',
                l.qty ?? '',
                l.uqc_code || '',
                l.unit_price ?? '',
                l.discount_pct ?? '',
                l.igst_rate_pct ?? '',
                l.packages ?? '',
                l.net_weight ?? '',
                l.gross_weight ?? '',
                ...expCells,
                ...rebCells,
                l.line_total ?? '',
            ];
        });

        const wb = utils.book_new();
        const ws = utils.aoa_to_sheet([headerRow, ...dataAoa]);
        utils.book_append_sheet(wb, ws, 'lineitems');

        const buffer = write(wb, {
            type: 'buffer',
            bookType: 'xlsx',
        }) as Buffer;

        const invHeader: any = invoiceId
            ? await this.invoiceRepository.findOneById(invoiceId)
            : null;
        const idPart =
            invHeader?.voucher_no?.replace(/[^A-Za-z0-9_-]+/g, '_') ||
            'draft';
        const datePart = new Date().toISOString().slice(0, 10);
        return {
            buffer,
            filename: `invoice-lines-${idPart}-${datePart}.xlsx`,
        };
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. Validate an uploaded sheet against the bound SO.
    //    Each row is anchored by `product_code`. The line is accepted
    //    when the SO carries that product code AND at least one POV has
    //    dispatched / received the matching SO line.
    //    If the current draft already has a line for that same product
    //    code → UPDATE in place; otherwise APPEND.
    //    Returns the same `{ summary, rows[] }` shape used elsewhere.
    // ──────────────────────────────────────────────────────────────────
    async resolveImport(opts: {
        companyId: string;
        purchaseOrderId: string;
        invoiceId?: string;
        rows: Array<Record<string, any>>;
        // The form's current (possibly unsaved) draft lines. When provided
        // these drive the new-vs-updated decision + the qty roll-up so the
        // Review screen matches what the FE merge will actually do. Falls back
        // to the saved invoice's lines when omitted.
        draftLines?: Array<Record<string, any>>;
    }): Promise<{
        summary: {
            total: number;
            new: number;
            updated: number;
            skipped: number;
            errors: number;
            warnings: number;
        };
        rows: InvoiceLineResolvedRow[];
    }> {
        const { companyId, purchaseOrderId, invoiceId } = opts;
        const out: InvoiceLineResolvedRow[] = [];

        // The masters are ALWAYS loaded now. They used to be fetched only when a
        // row carried a `rebate_codes` / `expense_codes` array — the old
        // code-column layout. With the costing-worksheet layout the sheet names
        // each code as a COLUMN HEADER instead, so we cannot know whether the
        // sheet mentions a code until we know what the codes are. Skipping the
        // load left the lookup maps empty, no header ever matched a master, and
        // every typed value ("CHA 2000") was silently dropped.

        // Fan out the independent I/O. PO lines / draft lines / rebate +
        // expense masters all run in parallel — this is the biggest win
        // over the previous sequential flow.
        const [poLines, draftLines, rebateMasters, expenseMasters] =
            await Promise.all([
                this.poLineRepository.findAll({
                    purchase_order_id: purchaseOrderId,
                } as any) as Promise<any[]>,
                // Prefer the form's live draft (what the merge targets); fall
                // back to the saved invoice's lines when the FE didn't send it.
                Array.isArray(opts.draftLines)
                    ? Promise.resolve(opts.draftLines as any[])
                    : invoiceId
                      ? (this.invoiceLineRepository.findByInvoiceId(
                            invoiceId,
                        ) as Promise<any[]>)
                      : Promise.resolve([] as any[]),
                this.rebateRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                    is_active: true,
                } as any) as Promise<any[]>,
                this.expenseRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                    is_active: true,
                } as any) as Promise<any[]>,
            ]);

        // Existing draft lines — used for the update-by-product-code
        // path. Stored case-insensitively to forgive Excel auto-casing.
        const draftByProductCode = new Map<string, any>();
        for (const dl of draftLines) {
            const code = lc((dl as any).product_code);
            if (code) draftByProductCode.set(code, dl);
        }

        // Pull SO lines + dispatched-by-POV roll-up so we know which
        // lines belong to this PO and which have received stock. We do
        // NOT use `getAddablePoLines` here because that helper drops
        // lines whose available qty hits zero — but the operator may
        // legitimately re-invoice a line that is already on this draft
        // (popup behaviour).
        const poLineById = new Map<string, any>(
            poLines.map((l) => [l._id.toString(), l]),
        );
        const poLineIds = poLines.map((l) => l._id.toString());

        // Fan out the second wave of I/O — products + POV lines both
        // need poLineIds but don't need each other.
        const productIds = Array.from(
            new Set(
                poLines
                    .map((l: any) => l.product_id?.toString())
                    .filter((v: any): v is string => !!v),
            ),
        );
        const [products, povLinesAll] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: { $in: productIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            poLineIds.length
                ? (this.povLineRepository.findAll({
                      purchase_order_line_id: { $in: poLineIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const productById = new Map<string, any>(
            products.map((p) => [p._id.toString(), p]),
        );

        // product_code → PO line lookup. PO line entity stores only
        // product_id, so we resolve the code through the product master
        // (case-insensitive to forgive Excel auto-casing).
        const poLineByProductCode = new Map<string, any>();
        for (const pl of poLines) {
            const prod = productById.get(pl.product_id?.toString());
            const code = lc(prod?.code || (pl as any).product_code);
            if (code) poLineByProductCode.set(code, pl);
        }
        const povIds = Array.from(
            new Set(
                povLinesAll
                    .map((pl: any) => pl.po_vendor_id?.toString())
                    .filter((v): v is string => !!v),
            ),
        );
        const povs: any[] = povIds.length
            ? ((await this.povRepository.findAll({
                  _id: { $in: povIds },
                  soft_delete: false,
              } as any)) as any[])
            : [];
        const dispatchedPovIds = new Set(
            povs
                .filter(
                    (p: any) =>
                        p.status === ENUM_PO_VENDOR_STATUS.DISPATCHED ||
                        p.status === ENUM_PO_VENDOR_STATUS.CLOSED,
                )
                .map((p: any) => p._id.toString()),
        );
        const dispatchedByPoLine = new Map<string, number>();
        for (const pl of povLinesAll) {
            if (!dispatchedPovIds.has(pl.po_vendor_id?.toString())) continue;
            const k = pl.purchase_order_line_id?.toString();
            if (!k) continue;
            dispatchedByPoLine.set(
                k,
                (dispatchedByPoLine.get(k) || 0) + num(pl.dispatched_qty),
            );
        }

        // Qty already on this draft (per SO line) — counted toward the
        // "available pool" so the operator can re-import the current
        // qty for a product without false rejection.
        const draftQtyByPoLine = new Map<string, number>();
        for (const dl of draftLines as any[]) {
            const k = dl.purchase_order_line_id?.toString();
            if (!k) continue;
            draftQtyByPoLine.set(
                k,
                (draftQtyByPoLine.get(k) || 0) + num(dl.qty),
            );
        }
        // Qty already invoiced on OTHER invoices (issued / cancelled
        // exclusion comes from the helper). Hits the DB once per SO
        // line; cached so repeated lookups in the per-row loop are
        // cheap. Skipped for brand-new draft invoices (no rows on this
        // draft yet to swap with).
        const invoicedAllByPoLine = new Map<string, number>();
        await Promise.all(
            Array.from(dispatchedByPoLine.keys()).map(async (k) => {
                const total =
                    await this.invoiceRepository.sumQtyByPoLineId(k);
                invoicedAllByPoLine.set(k, total);
            }),
        );

        // sheet-internal qty roll-up keyed by SO line — guards against
        // a user splitting one SO line across multiple rows that
        // individually pass but together blow the cap.
        const sheetQtyByPoLine = new Map<string, number>();

        // Master lookups keyed case-insensitively on `code` (only built
        // when the sheet actually references codes).
        const rebateByCode = new Map<string, any>(
            (rebateMasters as any[]).map((r) => [lc(r.code), r]),
        );
        const expenseByCode = new Map<string, any>(
            (expenseMasters as any[]).map((e) => [lc(e.code), e]),
        );

        for (let i = 0; i < opts.rows.length; i++) {
            const raw = opts.rows[i] || {};
            const rowNum = i + 2; // header is row 1, so first data row is 2
            const errors: string[] = [];
            const warnings: string[] = [];

            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col.toLowerCase(),
                );
                if (!key) return '';
                return String(raw[key] ?? '').trim();
            };

            const productCode = get('product_code');
            if (!productCode) {
                out.push({
                    rowNum,
                    status: 'error',
                    errors: ['Product code is missing in this row.'],
                    warnings,
                    data: {},
                });
                continue;
            }

            // Membership: the product code must exist on the bound SO.
            const poLine = poLineByProductCode.get(lc(productCode));
            if (!poLine) {
                out.push({
                    rowNum,
                    status: 'error',
                    errors: [
                        `Product "${productCode}" is not on the Sales Order linked to this invoice.`,
                    ],
                    warnings,
                    data: { product_code: productCode },
                });
                continue;
            }
            const poLineId = poLine._id.toString();

            // Dispatched-in-POV gate: only lines that have actually been
            // dispatched or received in some POV can be invoiced.
            if (!((dispatchedByPoLine.get(poLineId) || 0) > 0)) {
                errors.push(
                    `Product "${productCode}" has not been dispatched or received yet, so it cannot be invoiced.`,
                );
            }

            const qty = numOrUndef(get('qty'));
            if (qty === undefined || qty <= 0) {
                errors.push('Quantity must be a positive number.');
            }

            // Qty cap: per-SO-line dispatched − (already invoiced on
            // OTHER invoices) − (qty already used by earlier rows in
            // this same sheet for the same SO line). The current draft's
            // own qty is treated as a re-allocation, NOT consumed, so
            // the operator can re-import the same line they already
            // have without false rejection.
            if (qty && qty > 0 && errors.length === 0) {
                const dispatched = dispatchedByPoLine.get(poLineId) || 0;
                const invoicedAll = invoicedAllByPoLine.get(poLineId) || 0;
                const draftSelf = draftQtyByPoLine.get(poLineId) || 0;
                const invoicedOthers = Math.max(
                    0,
                    invoicedAll - draftSelf,
                );
                const usedSoFar = sheetQtyByPoLine.get(poLineId) || 0;
                const cap = dispatched - invoicedOthers - usedSoFar;
                if (qty - cap > 1e-6) {
                    errors.push(
                        `Quantity for "${productCode}" exceeds what's available to invoice (max ${cap > 0 ? cap : 0}).`,
                    );
                } else {
                    sheetQtyByPoLine.set(poLineId, usedSoFar + qty);
                }
            }

            const unitPrice = numOrUndef(get('unit_price'));
            if (unitPrice !== undefined && unitPrice < 0) {
                errors.push('Unit price cannot be negative.');
            }

            const igstRate = numOrUndef(get('igst_rate_pct'));
            if (
                igstRate !== undefined &&
                (igstRate < 0 || igstRate > 28)
            ) {
                errors.push('GST % must be between 0 and 28.');
            }

            const discountPct = numOrUndef(get('discount_pct'));
            if (
                discountPct !== undefined &&
                (discountPct < 0 || discountPct > 100)
            ) {
                errors.push('Discount % must be between 0 and 100.');
            }

            const hsn = get('hsn_code');
            if (!hsn) {
                errors.push('HSN code is required for each line.');
            } else if (hsn.length > 30) {
                errors.push('HSN code is too long.');
            }

            const uqc = get('uqc_code');
            if (uqc && !UQC_CODES.has(lc(uqc))) {
                errors.push(
                    `UQC "${uqc}" is not a recognised GST unit code.`,
                );
            }

            // ── Rebates / expenses: costing-worksheet layout ────────────────
            //
            // Each expense / rebate master code is its own COLUMN; the header may
            // carry a trailing "(%)". A non-blank cell applies that code to the
            // line at the TYPED value — a real per-line override. A blank cell
            // means the code is not applied to that line.
            //
            // The legacy layout (repeated `rebate` / `expense` columns holding
            // CODES, resolved to the master's DEFAULT value) is gone. It could
            // only ever say "this rebate applies", never at what rate, so every
            // import silently reset a hand-tuned line back to the master default.
            //
            // Same rule as `sales-doc-import.service.resolveRows()` — that is the
            // point: the Invoice sheet and the costing worksheet must not diverge.
            const rebatesSnapshot: any[] = [];
            const expensesSnapshot: any[] = [];

            const stripPct = (h: string) =>
                h.trim().replace(/\(%\)\s*$/, '').trim();
            const expHdrs: Array<{ key: string; master: any }> = [];
            const rebHdrs: Array<{ key: string; master: any }> = [];
            for (const key of Object.keys(raw)) {
                const codeKey = lc(stripPct(key));
                if (!codeKey) continue;
                const em = expenseByCode.get(codeKey);
                if (em) {
                    expHdrs.push({ key, master: em });
                    continue;
                }
                const rm = rebateByCode.get(codeKey);
                if (rm) rebHdrs.push({ key, master: rm });
            }
            if (expHdrs.length > 0) {
                const next: any[] = [];
                for (const { key, master } of expHdrs) {
                    const cell = numOrUndef((raw as any)[key]);
                    if (cell === undefined) continue; // blank → not applied
                    // Keep the type the SO line already had for this code; fall
                    // back to the master. Changing percent↔fixed here would
                    // silently reinterpret the operator's number.
                    const fromLine = (
                        poLine?.product_expenses_snapshot || []
                    ).find((s2: any) => lc(s2.code) === lc(master.code));
                    next.push({
                        expense_id: master._id.toString(),
                        code: master.code,
                        name: master.name,
                        type: lc(fromLine?.type || master.type) || 'fixed',
                        value: cell,
                    });
                }
                expensesSnapshot.length = 0;
                expensesSnapshot.push(...next);
            }
            if (rebHdrs.length > 0) {
                const next: any[] = [];
                for (const { key, master } of rebHdrs) {
                    const cell = numOrUndef((raw as any)[key]);
                    if (cell === undefined) continue; // blank → not applied
                    const fromLine = (
                        poLine?.product_rebates_snapshot || []
                    ).find((s2: any) => lc(s2.code) === lc(master.code));
                    next.push({
                        rebate_id: master._id.toString(),
                        code: master.code,
                        name: master.name,
                        type: lc(fromLine?.type || master.type) || 'percent',
                        pct: cell,
                    });
                }
                rebatesSnapshot.length = 0;
                rebatesSnapshot.push(...next);
            }

            // Anchor product comes from the SO line itself — never
            // trusted from the sheet (product_code / product_name there
            // are reference columns only).
            const prod = productById.get(poLine?.product_id?.toString());
            const anchorProductId = poLine?.product_id?.toString();
            const anchorProductCode = poLine?.product_code || prod?.code || '';
            const anchorProductName = poLine?.product_name || prod?.name || '';

            const existingDraft = draftByProductCode.get(lc(productCode));
            const status: InvoiceLineImportStatus = errors.length
                ? 'error'
                : existingDraft
                  ? 'updated'
                  : 'new';

            out.push({
                rowNum,
                status,
                errors,
                warnings,
                data: {
                    invoice_line_id: existingDraft?._id?.toString() || null,
                    purchase_order_line_id: poLineId,
                    product_id: anchorProductId,
                    product_code: anchorProductCode,
                    product_name: anchorProductName,
                    hsn_code: hsn,
                    part_no: get('part_no') || prod?.part_no || null,
                    description: get('description') || null,
                    customer_reference: get('customer_reference') || null,
                    qty: qty ?? 0,
                    unit: get('unit') || poLine?.unit || '',
                    uqc_code: uqc || null,
                    unit_price:
                        unitPrice !== undefined
                            ? unitPrice
                            : num(poLine?.unit_price),
                    discount_pct: discountPct ?? 0,
                    igst_rate_pct: igstRate ?? 0,
                    // Packing List (operator-editable in the sheet).
                    packages: numOrUndef(get('packages')) ?? null,
                    net_weight: numOrUndef(get('net_weight')) ?? null,
                    gross_weight: numOrUndef(get('gross_weight')) ?? null,
                    // The sheet is authoritative whenever it CARRIES the code
                    // columns at all: a blank cell then genuinely means "not
                    // applied", not "unspecified". Only a sheet with no code
                    // columns whatsoever falls back to the SO line's snapshot.
                    product_rebates_snapshot:
                        rebHdrs.length > 0
                            ? rebatesSnapshot
                            : poLine?.product_rebates_snapshot || [],
                    product_expenses_snapshot:
                        expHdrs.length > 0
                            ? expensesSnapshot
                            : poLine?.product_expenses_snapshot || [],
                },
            });
        }

        const summary = {
            total: out.length,
            new: out.filter((r) => r.status === 'new').length,
            updated: out.filter((r) => r.status === 'updated').length,
            skipped: out.filter((r) => r.status === 'skipped').length,
            errors: out.filter((r) => r.status === 'error').length,
            warnings: out.reduce((n, r) => n + r.warnings.length, 0),
        };
        return { summary, rows: out };
    }
}
