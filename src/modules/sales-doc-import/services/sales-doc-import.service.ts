import { Injectable, Logger } from '@nestjs/common';
import { utils, write } from 'xlsx';
// SheetJS community + basic cell styles (fills/fonts/borders). Used ONLY by the
// coloured costing "Export Report"; the round-trip exports stay on plain `xlsx`.
import * as XLSXStyle from 'xlsx-js-style';

import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

import {
    ENUM_SALES_DOC_TYPE,
    ENUM_SALES_DOC_IMPORT_ROW_STATUS,
} from '../enums/sales-doc-import.enum';
import {
    SalesDocExportLineDto,
    SalesDocResolveExistingKeyDto,
    SalesDocResolveResponseDto,
    SalesDocResolveRowResponse,
    ResolvedLine,
    ResolvedRebateSnapshot,
    ResolvedExpenseSnapshot,
} from '../dtos/sales-doc-import.dto';

// Stable column order. Export-shipping extras and dynamic rebate/expense
// columns are appended at workbook build time.
const BASE_HEADERS = [
    'product_code',
    'vendor_code',
    'qty',
    'unit',
    'unit_price',
    'discount_pct',
    'tax_pct',
    'margin_pct',
];
// customer_reference is placed last (after the export/shipping columns such as
// package_count) — see the header/scalar assembly in buildWorkbook.
// Carried by both Quotation and PFI line items. Quotation captures them
// upfront so they ride into the PFI naturally on convert.
const EXPORT_EXTRA_HEADERS = [
    'hs_code',
    'net_weight_kg',
    'gross_weight_kg',
    'package_count',
];

// Doc types that include the Export/Shipping columns in import/export.
const docHasExportFields = (t: ENUM_SALES_DOC_TYPE): boolean =>
    t === ENUM_SALES_DOC_TYPE.PFI ||
    t === ENUM_SALES_DOC_TYPE.QUOTATION ||
    t === ENUM_SALES_DOC_TYPE.PO ||
    t === ENUM_SALES_DOC_TYPE.LEAD;

const num = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const numOrUndef = (v: any): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const lc = (v: any) => String(v ?? '').trim().toLowerCase();

/**
 * Split a shipment-level freight figure across lines BY QUANTITY.
 * Mirrors FE splitFreightByQty() — keep in sync with
 * shivatrade-react/src/views/_shared/sales-doc/_helpers.js
 *
 * Returns per-line freight amounts (DOCUMENT currency) aligned to `lines`.
 * The penny-rounding residual is folded into the last qty-bearing line so
 * Σ(result) === round2(freightTotal) exactly — customs cross-foots the
 * invoice, so per-line freight must sum to the entered figure.
 */
function splitFreightByQty(
    lines: SalesDocExportLineDto[],
    freightTotal: number | string | undefined,
): number[] {
    const r2 = (n: number) =>
        Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    const arr = (lines || []).map(() => 0);
    const total = num(freightTotal);
    const totalQty = (lines || []).reduce((s, l) => s + num(l?.qty), 0);
    if (total <= 0 || totalQty <= 0) return arr;
    const perUnit = total / totalQty;
    let lastQtyIdx = -1;
    (lines || []).forEach((l, i) => {
        const q = num(l?.qty);
        arr[i] = r2(q * perUnit);
        if (q > 0) lastQtyIdx = i;
    });
    if (lastQtyIdx >= 0) {
        const assigned = arr.reduce((s, v) => s + v, 0);
        arr[lastQtyIdx] = r2(arr[lastQtyIdx] + (r2(total) - r2(assigned)));
    }
    return arr;
}

// Mirrors FE computeLineCosting() so exported "computed" columns line up
// with what the costing card shows. Keep in sync with
// shivatrade-react/src/views/_shared/sales-doc/_helpers.js
function computeLineCosting(l: SalesDocExportLineDto) {
    const qty = num(l.qty);
    const price = num(l.unit_price);
    const disc = num(l.discount_pct);
    const r2 = (n: number) =>
        Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    const gross = r2(qty * price);
    const discountAmt = r2((gross * disc) / 100);
    const taxable = r2(gross - discountAmt);
    // Expenses first — % on taxable, fixed as-is.
    let expensesAmt = 0;
    for (const e of l.product_expenses_snapshot || []) {
        if ((e as any).type === 'percent')
            expensesAmt += (taxable * num((e as any).value)) / 100;
        else expensesAmt += num((e as any).value);
    }
    expensesAmt = r2(expensesAmt);
    const afterExpenses = r2(taxable + expensesAmt);
    // Rebates on the post-expense total (FOB = taxable + expenses).
    let rebatesAmt = 0;
    for (const r of l.product_rebates_snapshot || []) {
        if ((r as any).type === 'fixed') rebatesAmt += num((r as any).pct);
        else rebatesAmt += (afterExpenses * num((r as any).pct)) / 100;
    }
    rebatesAmt = r2(rebatesAmt);
    const afterRebates = r2(afterExpenses - rebatesAmt);
    const margin = r2((afterRebates * num(l.margin_pct)) / 100);
    const netTotal = r2(afterRebates + margin);
    const gst = r2((netTotal * num(l.tax_pct)) / 100);
    return {
        gross,
        discount_amt: discountAmt,
        taxable,
        rebate_total: rebatesAmt,
        expense_total: expensesAmt,
        margin_amt: margin,
        gst_amt: gst,
        line_total: r2(netTotal + gst),
    };
}


@Injectable()
export class SalesDocImportService {
    private readonly logger = new Logger(SalesDocImportService.name);

    constructor(
        private readonly productRepository: ProductRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly priceListRepository: PriceListRepository,
    ) {}

    // ──────────────────────────────────────────────────────────────────
    // 1. Resolve uploaded rows → typed line items + per-row status
    // ──────────────────────────────────────────────────────────────────
    async resolveRows(
        companyId: string,
        docType: ENUM_SALES_DOC_TYPE,
        rawRows: Array<Record<string, any>>,
        existingKeys: SalesDocResolveExistingKeyDto[],
    ): Promise<SalesDocResolveResponseDto> {
        // Leads are a simple requirement list — vendor / discount / margin /
        // rebate / expense / weight columns are ignored even if the sheet has
        // them (matches the reduced Lead import template).
        const isLead = docType === ENUM_SALES_DOC_TYPE.LEAD;
        // Quotation & Sales Order use the new costing-worksheet sheet (aliased
        // headers + per-code expense/rebate value columns). PFI / Lead keep the
        // legacy parsing untouched.
        const isNewLayout =
            docType === ENUM_SALES_DOC_TYPE.QUOTATION ||
            docType === ENUM_SALES_DOC_TYPE.PO;
        const [products, vendors, rebateMasters, expenseMasters] =
            await Promise.all([
                this.productRepository.findByCompanyId(companyId),
                this.vendorRepository.findByCompanyId(companyId),
                this.rebateRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                } as any),
                this.expenseRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                } as any),
            ]);

        const productByCode = new Map<string, any>();
        for (const p of products) productByCode.set(lc(p.code), p);
        const vendorByCode = new Map<string, any>();
        const vendorCurrencyById = new Map<string, string>();
        for (const v of vendors) {
            if (v.vendor_code) vendorByCode.set(lc(v.vendor_code), v);
            vendorCurrencyById.set(
                v._id.toString(),
                (v.currency_code || 'INR').toUpperCase()
            );
        }
        const rebateByCode = new Map<string, any>();
        for (const r of rebateMasters) rebateByCode.set(lc(r.code), r);
        const expenseByCode = new Map<string, any>();
        for (const e of expenseMasters) expenseByCode.set(lc(e.code), e);

        // Per-product rebate/expense maps (rebate_id → product override, etc).
        const productIds = products.map((p) => p._id.toString());
        const [allProdRebates, allProdExpenses] = await Promise.all([
            productIds.length
                ? this.productRebateRepository.findByProductIds(productIds)
                : Promise.resolve([]),
            productIds.length
                ? this.productExpenseRepository.findByProductIds(productIds)
                : Promise.resolve([]),
        ]);
        const prodRebatesByProductId = new Map<string, any[]>();
        for (const pr of allProdRebates) {
            const k = pr.product_id.toString();
            if (!prodRebatesByProductId.has(k))
                prodRebatesByProductId.set(k, []);
            prodRebatesByProductId.get(k)!.push(pr);
        }
        const prodExpensesByProductId = new Map<string, any[]>();
        for (const pe of allProdExpenses) {
            const k = pe.product_id.toString();
            if (!prodExpensesByProductId.has(k))
                prodExpensesByProductId.set(k, []);
            prodExpensesByProductId.get(k)!.push(pe);
        }

        // Existing-keys index for new vs updated classification. Form lines
        // carry IDs, not codes — accept either, resolve to IDs.
        const existingPairs: Array<{
            product_id?: string;
            vendor_id?: string;
        }> = [];
        for (const k of existingKeys || []) {
            const pid =
                k.product_id ||
                (k.product_code
                    ? productByCode.get(lc(k.product_code))?._id?.toString()
                    : undefined);
            const vid =
                k.vendor_id ||
                (k.vendor_code
                    ? vendorByCode.get(lc(k.vendor_code))?._id?.toString()
                    : undefined);
            existingPairs.push({ product_id: pid, vendor_id: vid });
        }
        const existingSet = new Set<string>(
            existingPairs.map((p) => `${p.product_id || ''}|${p.vendor_id || ''}`),
        );
        // Per-product vendor map used to reuse the form's existing vendor
        // when the sheet's vendor_code cell is blank.
        const existingVendorsByProduct = new Map<string, Set<string>>();
        for (const p of existingPairs) {
            if (!p.product_id || !p.vendor_id) continue;
            if (!existingVendorsByProduct.has(p.product_id))
                existingVendorsByProduct.set(p.product_id, new Set());
            existingVendorsByProduct.get(p.product_id)!.add(p.vendor_id);
        }

        // Track first-seen (product_id, vendor_id) within the sheet —
        // subsequent occurrences are flagged "skipped".
        const seenInSheet = new Set<string>();

        const out: SalesDocResolveRowResponse[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const warnings: string[] = [];

            // Header-insensitive cell access with new-layout aliases so a sheet
            // using either the legacy header (product_code) or the new costing
            // header (productcode / rate(inr) / disc(%) / margin(%) / hsncode /
            // partno) resolves the same field. Legacy names are listed first,
            // so PFI / Lead sheets resolve exactly as before.
            const COL_ALIASES: Record<string, string[]> = {
                product_code: ['product_code', 'productcode'],
                vendor_code: ['vendor_code', 'vendorcode'],
                unit_price: ['unit_price', 'rate(inr)', 'rate'],
                discount_pct: ['discount_pct', 'disc(%)', 'disc'],
                margin_pct: ['margin_pct', 'margin(%)', 'margin'],
                hs_code: ['hs_code', 'hsncode', 'hsn_code'],
                part_no: ['part_no', 'partno'],
                // Per-line share of the shipment freight (document currency).
                // Header is bare `freight` in every currency so this resolves;
                // the derived `cnf amt(...)` / `cnf rate(...)` columns have no
                // alias and are therefore ignored on import.
                freight: ['freight'],
            };
            const get = (col: string): string => {
                const cands = COL_ALIASES[col] || [col];
                for (const c of cands) {
                    const key = Object.keys(raw).find(
                        (k) => k.trim().toLowerCase() === c.toLowerCase(),
                    );
                    if (key) return String(raw[key] ?? '').trim();
                }
                return '';
            };

            const productCode = get('product_code');
            if (!productCode) {
                out.push({
                    rowNum,
                    status: ENUM_SALES_DOC_IMPORT_ROW_STATUS.ERROR,
                    errors: ['product_code is required'],
                    warnings,
                    data: {},
                });
                continue;
            }
            const product = productByCode.get(lc(productCode));
            if (!product) {
                out.push({
                    rowNum,
                    status: ENUM_SALES_DOC_IMPORT_ROW_STATUS.ERROR,
                    errors: [
                        `Product code "${productCode}" not found for this company`,
                    ],
                    warnings,
                    data: { product_code: productCode },
                });
                continue;
            }
            const productId = product._id.toString();

            // ── Vendor resolution (must sell this product) ──
            let vendorCode = get('vendor_code');
            let vendorId: string | undefined;
            const activeVendorRows: any[] = [];
            // Pull the product's vendor catalogue from price-list. This gives
            // us "which vendors sell this product" AND a default unit_price/
            // discount when those cells are blank.
            const allPlForProduct = await this.priceListRepository.findAll(
                {
                    company_id: companyId,
                    product_id: productId,
                } as any,
                { order: { effective_date: 'desc' as any } },
            );
            // Keep the latest row per vendor. No date window: effective_date /
            // valid_until are not gating concepts here, so a future- or oddly-
            // dated row can't hide a vendor the sheet names. Rows are ordered
            // effective_date desc, so the first seen per vendor is its latest.
            const seen = new Set<string>();
            for (const r of allPlForProduct) {
                const vk = r.vendor_id.toString();
                if (seen.has(vk)) continue;
                seen.add(vk);
                activeVendorRows.push(r);
            }
            activeVendorRows.sort(
                (a, b) => num(a.unit_price) - num(b.unit_price),
            );

            if (vendorCode) {
                const v = vendorByCode.get(lc(vendorCode));
                if (!v) {
                    errors.push(
                        `Vendor code "${vendorCode}" not found for this company`,
                    );
                } else {
                    const pl = activeVendorRows.find(
                        (r) => r.vendor_id.toString() === v._id.toString(),
                    );
                    if (!pl) {
                        errors.push(
                            `Vendor "${vendorCode}" does not sell product "${productCode}"`,
                        );
                    } else {
                        vendorId = v._id.toString();
                    }
                }
            } else {
                // No vendor_code given. Preference order:
                //   1. If this product is already in the form, reuse that
                //      line's vendor — avoids creating a duplicate line and
                //      lets the import update the existing row in place.
                //   2. Otherwise, fall back to the cheapest active vendor on
                //      the product's price list.
                const existingForProduct =
                    existingVendorsByProduct.get(productId);
                const reusedVendorId =
                    existingForProduct &&
                    activeVendorRows.find((r) =>
                        existingForProduct.has(r.vendor_id.toString()),
                    );
                if (reusedVendorId) {
                    vendorId = reusedVendorId.vendor_id.toString();
                    const v = vendors.find(
                        (x) => x._id.toString() === vendorId,
                    );
                    vendorCode = v?.vendor_code || '';
                    warnings.push(
                        `vendor_code was blank — kept the existing line's vendor "${vendorCode}"`,
                    );
                } else if (activeVendorRows.length === 0) {
                    errors.push(
                        `Product "${productCode}" has no active vendor in its price list — row skipped`,
                    );
                } else {
                    const pl = activeVendorRows[0];
                    vendorId = pl.vendor_id.toString();
                    const v = vendors.find(
                        (x) => x._id.toString() === vendorId,
                    );
                    vendorCode = v?.vendor_code || '';
                    warnings.push(
                        `vendor_code was blank — defaulted to "${vendorCode}" (cheapest active vendor)`,
                    );
                }
            }

            // ── qty / unit / price ──
            const qty = numOrUndef(get('qty'));
            if (!qty || qty <= 0) errors.push('qty must be greater than 0');

            const sheetUnitPrice = numOrUndef(get('unit_price'));
            const sheetDiscountPct = numOrUndef(get('discount_pct'));
            // Defaults from the resolved vendor row when sheet cells are blank.
            const vendorRow = vendorId
                ? activeVendorRows.find(
                      (r) => r.vendor_id.toString() === vendorId,
                  )
                : null;
            const unitPrice =
                sheetUnitPrice ?? num(vendorRow?.unit_price ?? 0);
            const discountPct =
                sheetDiscountPct ?? num(vendorRow?.discount_pct ?? 0);

            const unit = get('unit') || product.unit_of_measure || '';
            const taxPct =
                numOrUndef(get('tax_pct')) ?? num(product.tax_pct);
            const marginPct =
                numOrUndef(get('margin_pct')) ?? num(product.margin_pct);

            // ── Seed snapshots from product master ──
            const prodRebates = prodRebatesByProductId.get(productId) || [];
            const prodExpenses = prodExpensesByProductId.get(productId) || [];
            const rebatesSnapshot: ResolvedRebateSnapshot[] = [];
            for (const pr of prodRebates) {
                const master = rebateMasters.find(
                    (m) => m._id.toString() === pr.rebate_id.toString(),
                );
                if (!master) continue;
                rebatesSnapshot.push({
                    rebate_id: pr.rebate_id.toString(),
                    code: master.code,
                    name: master.name,
                    type: ((pr.type || master.type) as string).toLowerCase() as
                        | 'percent'
                        | 'fixed',
                    pct: num(pr.pct ?? master.pct),
                });
            }
            const expensesSnapshot: ResolvedExpenseSnapshot[] = [];
            for (const pe of prodExpenses) {
                const master = expenseMasters.find(
                    (m) => m._id.toString() === pe.expense_id.toString(),
                );
                if (!master) continue;
                expensesSnapshot.push({
                    expense_id: pe.expense_id.toString(),
                    code: master.code,
                    name: master.name,
                    type: ((pe.type || master.type) as string).toLowerCase() as
                        | 'percent'
                        | 'fixed',
                    value: num(pe.value ?? master.value),
                });
            }

            // ── Rebate / expense codes from the sheet ──
            // Convention (mirrors the product master sample sheet): the sheet
            // has repeated `rebate` and `expense` columns; each cell holds a
            // code. The FE parser collapses these into `rebate_codes` /
            // `expense_codes` arrays before posting.
            //
            // Rule: if the sheet provides codes for that row → those are the
            // entries for the line (filter the product master's defaults to
            // just these codes). If the array is empty → keep the product
            // master defaults as-is. Codes that don't exist on the company's
            // rebate/expense master are warned and ignored.
            const sheetRebateCodes: string[] = Array.isArray(
                (raw as any).rebate_codes,
            )
                ? ((raw as any).rebate_codes as any[])
                      .map((c) => String(c ?? '').trim())
                      .filter(Boolean)
                : [];
            const sheetExpenseCodes: string[] = Array.isArray(
                (raw as any).expense_codes,
            )
                ? ((raw as any).expense_codes as any[])
                      .map((c) => String(c ?? '').trim())
                      .filter(Boolean)
                : [];

            if (sheetRebateCodes.length > 0) {
                const filtered: ResolvedRebateSnapshot[] = [];
                for (const code of sheetRebateCodes) {
                    // 1. Already attached to the product → reuse master+override.
                    const fromProduct = rebatesSnapshot.find(
                        (s) => lc(s.code) === lc(code),
                    );
                    if (fromProduct) {
                        filtered.push(fromProduct);
                        continue;
                    }
                    // 2. Not attached but exists company-wide → seed from master.
                    const master = rebateMasters.find(
                        (m) => lc(m.code) === lc(code),
                    );
                    if (master) {
                        filtered.push({
                            rebate_id: master._id.toString(),
                            code: master.code,
                            name: master.name,
                            type: (master.type as string).toLowerCase() as
                                | 'percent'
                                | 'fixed',
                            pct: num(master.pct),
                        });
                        warnings.push(
                            `Rebate code "${code}" is not attached to product "${productCode}" — using master defaults`,
                        );
                        continue;
                    }
                    warnings.push(
                        `Rebate code "${code}" does not exist for this company — ignored`,
                    );
                }
                rebatesSnapshot.length = 0;
                rebatesSnapshot.push(...filtered);
            }

            if (sheetExpenseCodes.length > 0) {
                const filtered: ResolvedExpenseSnapshot[] = [];
                for (const code of sheetExpenseCodes) {
                    const fromProduct = expensesSnapshot.find(
                        (s) => lc(s.code) === lc(code),
                    );
                    if (fromProduct) {
                        filtered.push(fromProduct);
                        continue;
                    }
                    const master = expenseMasters.find(
                        (m) => lc(m.code) === lc(code),
                    );
                    if (master) {
                        filtered.push({
                            expense_id: master._id.toString(),
                            code: master.code,
                            name: master.name,
                            type: (master.type as string).toLowerCase() as
                                | 'percent'
                                | 'fixed',
                            value: num(master.value),
                        });
                        warnings.push(
                            `Expense code "${code}" is not attached to product "${productCode}" — using master defaults`,
                        );
                        continue;
                    }
                    warnings.push(
                        `Expense code "${code}" does not exist for this company — ignored`,
                    );
                }
                expensesSnapshot.length = 0;
                expensesSnapshot.push(...filtered);
            }

            // ── New layout (quotation / sales order): per-code value columns ──
            // Each expense/rebate master code is its own column (header may have
            // a trailing "(%)"). A non-blank cell applies that code to the line
            // using the TYPED value (per-line override); a blank cell skips it.
            // The presence of any such column means the row fully specifies its
            // expenses / rebates, so master defaults are replaced.
            if (isNewLayout) {
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
                    const next: ResolvedExpenseSnapshot[] = [];
                    for (const { key, master } of expHdrs) {
                        const cell = numOrUndef(raw[key]);
                        if (cell === undefined) continue; // blank → skip
                        const fromProduct = expensesSnapshot.find(
                            (s) => lc(s.code) === lc(master.code),
                        );
                        next.push({
                            expense_id: master._id.toString(),
                            code: master.code,
                            name: master.name,
                            type: ((fromProduct?.type ||
                                master.type) as string).toLowerCase() as
                                | 'percent'
                                | 'fixed',
                            value: cell,
                        });
                    }
                    expensesSnapshot.length = 0;
                    expensesSnapshot.push(...next);
                }
                if (rebHdrs.length > 0) {
                    const next: ResolvedRebateSnapshot[] = [];
                    for (const { key, master } of rebHdrs) {
                        const cell = numOrUndef(raw[key]);
                        if (cell === undefined) continue; // blank → skip
                        const fromProduct = rebatesSnapshot.find(
                            (s) => lc(s.code) === lc(master.code),
                        );
                        next.push({
                            rebate_id: master._id.toString(),
                            code: master.code,
                            name: master.name,
                            type: ((fromProduct?.type ||
                                master.type) as string).toLowerCase() as
                                | 'percent'
                                | 'fixed',
                            pct: cell,
                        });
                    }
                    rebatesSnapshot.length = 0;
                    rebatesSnapshot.push(...next);
                }
            }

            const line: ResolvedLine = {
                product_id: productId,
                product_code: product.code,
                product_name:
                    get('product_name') || product.name,
                description: get('description') || product.description || '',
                customer_reference: get('customer_reference') || '',
                vendor_id: vendorId,
                vendor_code: vendorCode || undefined,
                qty: qty || 0,
                unit,
                unit_price: unitPrice,
                discount_pct: discountPct,
                tax_pct: taxPct,
                margin_pct: marginPct,
                product_rebates_snapshot: rebatesSnapshot,
                product_expenses_snapshot: expensesSnapshot,
            };
            if (docHasExportFields(docType)) {
                line.hs_code = get('hs_code') || product.hsn_code || '';
                if (!isLead) {
                    line.package_count = numOrUndef(get('package_count')) ?? 0;
                    line.net_weight_kg =
                        numOrUndef(get('net_weight_kg')) ??
                        num(product.net_weight_per_unit) * (qty || 0);
                    line.gross_weight_kg =
                        numOrUndef(get('gross_weight_kg')) ??
                        num(product.gross_weight_per_unit) * (qty || 0);
                }
            }

            // partno / hsncode columns (Quotation & Sales Order new layout).
            // Set both hs_code (quotation key) and hsn_code (Sales Order key) so
            // either form picks up the imported value; part_no defaults from the
            // product master when the cell is blank.
            if (isNewLayout) {
                const hsnVal = get('hs_code') || product.hsn_code || '';
                line.hs_code = hsnVal;
                line.hsn_code = hsnVal;
                line.part_no = get('part_no') || product.part_no || '';
                // Freight rides in per-line, but is a header-level figure on
                // the form — the FE sums these back into freight_total and the
                // worksheet re-derives the per-line split by qty. Blank cells
                // stay undefined so an untouched sheet never zeroes freight.
                line.freight = numOrUndef(get('freight'));
            }

            // Lead: simple requirement line. Capture part_no; drop vendor /
            // discount / margin / gst / package / rebate / expense so any values
            // the user left in those (removed) columns are ignored.
            if (isLead) {
                (line as any).part_no = get('part_no') || product.part_no || '';
                line.vendor_id = undefined;
                line.vendor_code = undefined;
                line.discount_pct = 0;
                line.tax_pct = 0;
                line.margin_pct = 0;
                line.product_rebates_snapshot = [];
                line.product_expenses_snapshot = [];
            }

            // ── Classify status ──
            // Match by IDs — form lines carry product_id / vendor_id, not the
            // string codes — so this is the only reliable key.
            let status: ENUM_SALES_DOC_IMPORT_ROW_STATUS;
            if (errors.length > 0) {
                status = ENUM_SALES_DOC_IMPORT_ROW_STATUS.ERROR;
            } else {
                const key = `${line.product_id || ''}|${line.vendor_id || ''}`;
                if (seenInSheet.has(key)) {
                    status = ENUM_SALES_DOC_IMPORT_ROW_STATUS.SKIPPED;
                    warnings.push(
                        'Duplicate of an earlier row in this sheet — first row wins',
                    );
                } else {
                    seenInSheet.add(key);
                    status = existingSet.has(key)
                        ? ENUM_SALES_DOC_IMPORT_ROW_STATUS.UPDATED
                        : ENUM_SALES_DOC_IMPORT_ROW_STATUS.NEW;
                }
            }

            out.push({ rowNum, status, errors, warnings, data: line });
        }

        // ── One-currency-per-document rule ──────────────────────────────
        // Every vendor on a quotation/SO/invoice must share ONE currency. If the
        // sheet resolves vendors of more than one currency, fail the whole
        // import with a clear message on every row.
        const docCurrencies = new Set<string>();
        for (const r of out) {
            const vid = (r as any).data?.vendor_id;
            if (vid)
                docCurrencies.add(
                    vendorCurrencyById.get(vid.toString()) || 'INR'
                );
        }
        if (docCurrencies.size > 1) {
            const list = Array.from(docCurrencies).sort().join(', ');
            for (const r of out) {
                r.status = ENUM_SALES_DOC_IMPORT_ROW_STATUS.ERROR;
                r.errors = [
                    ...(r.errors || []),
                    `All vendors on one document must use the same currency — this sheet mixes ${list}. Keep every vendor in one currency.`,
                ];
            }
        }

        const summary = {
            total: out.length,
            new: out.filter(
                (r) => r.status === ENUM_SALES_DOC_IMPORT_ROW_STATUS.NEW,
            ).length,
            updated: out.filter(
                (r) => r.status === ENUM_SALES_DOC_IMPORT_ROW_STATUS.UPDATED,
            ).length,
            skipped: out.filter(
                (r) => r.status === ENUM_SALES_DOC_IMPORT_ROW_STATUS.SKIPPED,
            ).length,
            errors: out.filter(
                (r) => r.status === ENUM_SALES_DOC_IMPORT_ROW_STATUS.ERROR,
            ).length,
            warnings: out.reduce((n, r) => n + r.warnings.length, 0),
        };

        return { summary, rows: out };
    }

    // Build a couple of example lines from real products in the catalogue
    // so the sample workbook is immediately useful. Picks the first 2 active
    // products with an active price-list vendor, snapshots their rebates /
    // expenses from the product master, and seeds a small qty.
    async buildExampleLines(
        companyId: string,
        docType: ENUM_SALES_DOC_TYPE,
    ): Promise<SalesDocExportLineDto[]> {
        const products = await this.productRepository.findByCompanyId(
            companyId,
        );
        if (!products.length) {
            // Empty catalogue → static placeholder so the header row is still
            // illustrated (users see column types even without products yet).
            return [
                {
                    product_code: 'PRD-001',
                    vendor_code: 'VEN-001',
                    customer_reference: 'BUYER-REF-001',
                    part_no: 'PART-001',
                    description: 'Requirement note (optional)',
                    qty: 100,
                    unit: 'KG',
                    unit_price: 25,
                    discount_pct: 0,
                    tax_pct: 18,
                    margin_pct: 10,
                    product_rebates_snapshot: [],
                    product_expenses_snapshot: [],
                } as any,
            ];
        }

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
        const vendors = await this.vendorRepository.findByCompanyId(companyId);

        const examples: SalesDocExportLineDto[] = [];
        const today = new Date().toISOString().slice(0, 10);

        for (const product of products) {
            if (examples.length >= 2) break;
            const productId = product._id.toString();
            const pls = await this.priceListRepository.findAll(
                { company_id: companyId, product_id: productId } as any,
                { order: { effective_date: 'desc' as any } },
            );
            const activePl = pls.find(
                (r) =>
                    String(r.effective_date) <= today &&
                    (!r.valid_until || String(r.valid_until) >= today),
            );
            if (!activePl) continue;
            const vendor = vendors.find(
                (v) => v._id.toString() === activePl.vendor_id.toString(),
            );
            if (!vendor?.vendor_code) continue;

            // Snapshots from product master (same shape the resolver emits).
            const [prodRebates, prodExpenses] = await Promise.all([
                this.productRebateRepository.findByProductIds([productId]),
                this.productExpenseRepository.findByProductIds([productId]),
            ]);
            const rebatesSnapshot = prodRebates
                .map((pr) => {
                    const m = rebateMasters.find(
                        (x) => x._id.toString() === pr.rebate_id.toString(),
                    );
                    if (!m) return null;
                    return {
                        rebate_id: pr.rebate_id.toString(),
                        code: m.code,
                        name: m.name,
                        type: (
                            (pr.type || m.type) as string
                        ).toLowerCase() as 'percent' | 'fixed',
                        pct: num(pr.pct ?? m.pct),
                    };
                })
                .filter(Boolean) as any[];
            const expensesSnapshot = prodExpenses
                .map((pe) => {
                    const m = expenseMasters.find(
                        (x) => x._id.toString() === pe.expense_id.toString(),
                    );
                    if (!m) return null;
                    return {
                        expense_id: pe.expense_id.toString(),
                        code: m.code,
                        name: m.name,
                        type: (
                            (pe.type || m.type) as string
                        ).toLowerCase() as 'percent' | 'fixed',
                        value: num(pe.value ?? m.value),
                    };
                })
                .filter(Boolean) as any[];

            const line: SalesDocExportLineDto = {
                product_code: product.code,
                vendor_code: vendor.vendor_code,
                product_name: product.name,
                part_no: product.part_no || '',
                description: product.description || '',
                qty: 10,
                unit: product.unit_of_measure || '',
                unit_price: num(activePl.unit_price),
                discount_pct: num(activePl.discount_pct),
                tax_pct: num(product.tax_pct),
                margin_pct: num(product.margin_pct),
                product_rebates_snapshot: rebatesSnapshot,
                product_expenses_snapshot: expensesSnapshot,
            };
            if (docHasExportFields(docType)) {
                line.hs_code = product.hsn_code || '';
                line.net_weight_kg = num(product.net_weight_per_unit) * 10;
                line.gross_weight_kg = num(product.gross_weight_per_unit) * 10;
                line.package_count = 1;
            }
            examples.push(line);
        }

        return examples.length ? examples : [];
    }

    // ──────────────────────────────────────────────────────────────────
    // Costing-worksheet workbook — Quotation & Sales Order (po) ONLY.
    // PFI / Lead never reach here (see buildWorkbook dispatch), so their
    // existing layout/behaviour is untouched.
    //   Sample (includeComputed=false) → input columns only.
    //   Export (includeComputed=true)  → adds price/disc, value, total+exp,
    //     grand total and (foreign only) rate/amt currency columns + Totals.
    // ──────────────────────────────────────────────────────────────────
    private async buildCostingWorkbook(
        companyId: string,
        opts: {
            docType: ENUM_SALES_DOC_TYPE;
            lines: SalesDocExportLineDto[];
            currencyCode?: string;
            exchangeRate?: number | string;
            freightTotal?: number | string;
            includeComputed: boolean;
            includeReadme: boolean;
        },
    ): Promise<Buffer> {
        const exportLines = opts.lines || [];
        const includeComputed = opts.includeComputed;
        const rate = num(opts.exchangeRate) || 1;
        const cur = (opts.currencyCode || '').trim();
        // exchange_rate is stored foreign-per-₹1; foreign docs carry a non-1 rate.
        const isForeign =
            !!cur && cur.toUpperCase() !== 'INR' && rate > 0 && rate !== 1;
        const r2 = (n: number) =>
            Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
        // Shipment freight (DOCUMENT currency) split across lines by qty — the
        // same figures the on-screen worksheet shows in its Freight / CNF
        // Amount / CNF Rate columns. `freight` is a round-trip column (blank in
        // the sample, summed back into freight_total on import); the two CNF
        // columns are derived and ignored by the importer.
        const freightTotal = num(opts.freightTotal);
        const lineFreights = splitFreightByQty(exportLines, freightTotal);
        const docCur = cur || 'INR';

        // Resolve code / name / part_no / hsn from ids when the line omits them.
        const productCodeById = new Map<string, string>();
        const productNameById = new Map<string, string>();
        const partNoById = new Map<string, string>();
        const hsnById = new Map<string, string>();
        const vendorCodeById = new Map<string, string>();
        if (exportLines.some((l) => l.product_id)) {
            const prods = await this.productRepository.findByCompanyId(companyId);
            for (const p of prods as any[]) {
                productCodeById.set(p._id.toString(), p.code || '');
                productNameById.set(p._id.toString(), p.name || '');
                partNoById.set(p._id.toString(), p.part_no || '');
                hsnById.set(p._id.toString(), p.hsn_code || '');
            }
        }
        if (exportLines.some((l) => !l.vendor_code && l.vendor_id)) {
            const vens = await this.vendorRepository.findByCompanyId(companyId);
            for (const v of vens as any[])
                vendorCodeById.set(v._id.toString(), v.vendor_code || '');
        }
        const pCode = (l: SalesDocExportLineDto) =>
            l.product_code ||
            (l.product_id ? productCodeById.get(String(l.product_id)) : '') ||
            '';
        // Display-only product name column. Header is `productname` (no
        // underscore, matching the other costing headers); the importer does
        // not alias it, so editing it never changes which product the row
        // resolves to — the product is always matched by code.
        const pName = (l: SalesDocExportLineDto) =>
            (l as any).product_name ||
            (l.product_id ? productNameById.get(String(l.product_id)) : '') ||
            '';
        const vCode = (l: SalesDocExportLineDto) =>
            l.vendor_code ||
            (l.vendor_id ? vendorCodeById.get(String(l.vendor_id)) : '') ||
            '';
        const pPart = (l: SalesDocExportLineDto) =>
            (l as any).part_no ||
            (l.product_id ? partNoById.get(String(l.product_id)) : '') ||
            '';
        const pHsn = (l: SalesDocExportLineDto) =>
            l.hs_code ||
            (l as any).hsn_code ||
            (l.product_id ? hsnById.get(String(l.product_id)) : '') ||
            '';

        // Active expense / rebate masters → columns, unioned with any code
        // already on a line so a deactivated-but-used code is never dropped.
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
        const expenseColTypes = new Map<string, string>();
        for (const m of expenseMasters as any[])
            if (isActiveMaster(m) && m.code)
                expenseColTypes.set(m.code, lc(m.type) || 'fixed');
        const rebateColTypes = new Map<string, string>();
        for (const m of rebateMasters as any[])
            if (isActiveMaster(m) && m.code)
                rebateColTypes.set(m.code, lc(m.type) || 'percent');
        for (const l of exportLines) {
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

        // ── Header row ──
        const headerRow: string[] = [
            'productcode',
            'productname',
            'vendorcode',
            'partno',
            'hsncode',
            'qty',
            'rate(inr)',
            'disc(%)',
        ];
        if (includeComputed) headerRow.push('price/disc', 'value');
        for (const code of expenseCols)
            headerRow.push(colHeader(code, expenseColTypes.get(code)));
        if (includeComputed) headerRow.push('total+exp');
        for (const code of rebateCols)
            headerRow.push(colHeader(code, rebateColTypes.get(code)));
        headerRow.push('margin(%)');
        if (includeComputed) {
            headerRow.push('grand total');
            if (isForeign) headerRow.push(`rate(${cur})`, `amt(${cur})`);
        }
        // Freight is an input column (kept bare so the importer's
        // get('freight') resolves it in any currency); CNF pair is computed.
        headerRow.push('freight');
        if (includeComputed)
            headerRow.push(`cnf amt(${docCur})`, `cnf rate(${docCur})`);
        // Export / packing columns (Quotation & Sales Order). Exact header
        // names so the importer's get('net_weight_kg') etc. resolve them.
        headerRow.push('net_weight_kg', 'gross_weight_kg', 'package_count');

        // ── Data rows ──
        const dataAoa = exportLines.map((l, i) => {
            const expByCode = new Map<string, number>();
            for (const e of (l.product_expenses_snapshot || []) as any[])
                if (e?.code) expByCode.set(e.code, num(e.value));
            const rebByCode = new Map<string, number>();
            for (const r of (l.product_rebates_snapshot || []) as any[])
                if (r?.code) rebByCode.set(r.code, num(r.pct));

            const row: any[] = [
                pCode(l),
                pName(l),
                vCode(l),
                pPart(l),
                pHsn(l),
                l.qty ?? '',
                l.unit_price ?? '',
                l.discount_pct ?? '',
            ];
            // GST excluded — quotations & SOs carry no tax in these totals.
            const c = computeLineCosting(l);
            if (includeComputed) {
                const priceDisc = r2(
                    num(l.unit_price) * (1 - num(l.discount_pct) / 100),
                );
                row.push(priceDisc, c.taxable);
            }
            for (const code of expenseCols)
                row.push(expByCode.has(code) ? expByCode.get(code) : '');
            if (includeComputed) row.push(r2(c.taxable + c.expense_total));
            for (const code of rebateCols)
                row.push(rebByCode.has(code) ? rebByCode.get(code) : '');
            row.push(l.margin_pct ?? '');
            const grand = r2(
                c.taxable - c.rebate_total + c.expense_total + c.margin_amt,
            );
            // FOB amount in the DOCUMENT currency (INR docs: grand as-is).
            const amtDoc = isForeign ? r2(grand * rate) : grand;
            const qty = num(l.qty);
            if (includeComputed) {
                row.push(grand);
                if (isForeign) row.push(qty ? r2(amtDoc / qty) : 0, amtDoc);
            }
            // Freight share + CNF = FOB + this line's qty-share of freight.
            // Blank (not 0) when the document carries no freight, so an
            // untouched sample round-trips without setting freight_total.
            const lineFreight = lineFreights[i] || 0;
            row.push(freightTotal > 0 ? lineFreight : '');
            if (includeComputed) {
                const cnfAmt = r2(amtDoc + lineFreight);
                row.push(cnfAmt, qty ? r2(cnfAmt / qty) : 0);
            }
            // Export / packing values (aligned with the appended headers).
            row.push(
                l.net_weight_kg ?? '',
                l.gross_weight_kg ?? '',
                l.package_count ?? '',
            );
            return row;
        });

        const workbook = utils.book_new();
        utils.book_append_sheet(
            workbook,
            utils.aoa_to_sheet([headerRow, ...dataAoa]),
            'LineItems',
        );

        // Totals sheet (export only) — GST-excluded, mirrors the costing card.
        if (includeComputed) {
            const t = exportLines.reduce(
                (acc, l) => {
                    const c = computeLineCosting(l);
                    acc.taxable += c.taxable;
                    acc.expense += c.expense_total;
                    acc.rebate += c.rebate_total;
                    acc.margin += c.margin_amt;
                    acc.grand += r2(
                        c.taxable -
                            c.rebate_total +
                            c.expense_total +
                            c.margin_amt,
                    );
                    return acc;
                },
                { taxable: 0, expense: 0, rebate: 0, margin: 0, grand: 0 },
            );
            const rows: any[] = [
                ['Metric', 'Amount (INR)'],
                ['Value (Taxable)', r2(t.taxable)],
                ['Expenses', r2(t.expense)],
                ['Rebates', r2(t.rebate)],
                ['Margin', r2(t.margin)],
                ['Grand Total', r2(t.grand)],
            ];
            if (isForeign) {
                rows[0].push(`Amount (${cur})`);
                rows[1].push(r2(t.taxable * rate));
                rows[2].push(r2(t.expense * rate));
                rows[3].push(r2(t.rebate * rate));
                rows[4].push(r2(t.margin * rate));
                rows[5].push(r2(t.grand * rate));
            }
            // Freight is entered in the DOCUMENT currency; the INR column is
            // the back-converted figure (rate is foreign-per-₹1). CNF Total =
            // FOB grand total + freight, matching the worksheet footer.
            if (freightTotal > 0) {
                const freightInr = isForeign
                    ? r2(freightTotal / rate)
                    : r2(freightTotal);
                const grandDoc = isForeign ? r2(t.grand * rate) : r2(t.grand);
                rows.push(['Freight', freightInr]);
                rows.push(['CNF Total', r2(t.grand + freightInr)]);
                if (isForeign) {
                    rows[6].push(r2(freightTotal));
                    rows[7].push(r2(grandDoc + freightTotal));
                }
            }
            utils.book_append_sheet(
                workbook,
                utils.aoa_to_sheet(rows),
                'Totals',
            );
        }

        // (The _README helper sheet was removed — the sample now ships with just
        // the LineItems sheet. Import still targets "LineItems" by name.)

        return write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    // ──────────────────────────────────────────────────────────────────
    // Costing REPORT workbook — PRESENTATION ONLY, NOT re-importable.
    //
    // The client-facing layout from the on-screen worksheet: two-row grouped
    // header (Logistics FOB Cost Elements / Government Benefits / <CUR>
    // Realization bands over their sub-columns), pretty currency labels,
    // per-line COMPUTED amounts, and a TOTAL row. Deliberately separate from
    // buildCostingWorkbook so the round-trip import is never touched — this
    // sheet is a snapshot to print/share, never re-uploaded.
    // ──────────────────────────────────────────────────────────────────
    async buildCostingReportWorkbook(
        companyId: string,
        opts: {
            docType: ENUM_SALES_DOC_TYPE;
            lines: SalesDocExportLineDto[];
            currencyCode?: string;
            exchangeRate?: number | string;
            freightTotal?: number | string;
        },
    ): Promise<Buffer> {
        const exportLines = opts.lines || [];
        const rate = num(opts.exchangeRate) || 1;
        const cur = (opts.currencyCode || '').trim();
        // exchange_rate is stored foreign-per-₹1; foreign docs carry a non-1 rate.
        const isForeign =
            !!cur && cur.toUpperCase() !== 'INR' && rate > 0 && rate !== 1;
        const docCur = (cur || 'INR').toUpperCase();
        const docSym = getCurrencySymbol(docCur) || docCur;
        const r2 = (n: number) =>
            Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
        // Shipment freight (DOCUMENT currency), split across lines by qty — the
        // Freight / CNF Amount / CNF Rate columns mirror the on-screen worksheet.
        // Shown only when the doc actually carries freight.
        const freightTotal = num(opts.freightTotal);
        const hasFreight = freightTotal > 0;
        const lineFreights = hasFreight
            ? splitFreightByQty(exportLines, freightTotal)
            : [];
        // Money formatters — the report is text/presentation, so amounts carry
        // their currency symbol exactly like the on-screen worksheet.
        const inr = (n: number) =>
            `₹${Number(r2(n)).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`;
        const fx = (n: number, dp: number) =>
            `${docSym}${Number(n).toLocaleString('en-US', {
                minimumFractionDigits: dp,
                maximumFractionDigits: dp,
            })}`;
        // Freight / CNF are in the DOCUMENT currency (₹ for INR docs, else the
        // foreign symbol) — same as the worksheet's Freight / CNF columns.
        const docMoney = (n: number) => (isForeign ? fx(n, 2) : inr(n));

        // Display fields (name / part / hsn / uom) resolved from ids if omitted.
        const nameById = new Map<string, string>();
        const partById = new Map<string, string>();
        const hsnById = new Map<string, string>();
        const uomById = new Map<string, string>();
        if (exportLines.some((l) => l.product_id)) {
            const prods = await this.productRepository.findByCompanyId(companyId);
            for (const p of prods as any[]) {
                nameById.set(p._id.toString(), p.name || '');
                partById.set(p._id.toString(), p.part_no || '');
                hsnById.set(p._id.toString(), p.hsn_code || '');
                uomById.set(p._id.toString(), p.unit_of_measure || '');
            }
        }
        const pName = (l: SalesDocExportLineDto) =>
            (l as any).product_name ||
            (l.product_id ? nameById.get(String(l.product_id)) : '') ||
            '';
        const pPart = (l: SalesDocExportLineDto) =>
            (l as any).part_no ||
            (l.product_id ? partById.get(String(l.product_id)) : '') ||
            '';
        const pHsn = (l: SalesDocExportLineDto) =>
            l.hs_code ||
            (l as any).hsn_code ||
            (l.product_id ? hsnById.get(String(l.product_id)) : '') ||
            '';
        const pUom = (l: SalesDocExportLineDto) =>
            (l as any).unit ||
            (l.product_id ? uomById.get(String(l.product_id)) : '') ||
            '';

        // Dynamic expense / rebate code columns (active masters ∪ codes in use).
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
        const isActive = (m: any): boolean =>
            m?.is_active !== false &&
            String(m?.status ?? '').toUpperCase() !== 'INACTIVE';
        const expenseTypes = new Map<string, string>();
        for (const m of expenseMasters as any[])
            if (isActive(m) && m.code)
                expenseTypes.set(m.code, lc(m.type) || 'fixed');
        const rebateTypes = new Map<string, string>();
        for (const m of rebateMasters as any[])
            if (isActive(m) && m.code)
                rebateTypes.set(m.code, lc(m.type) || 'percent');
        for (const l of exportLines) {
            for (const e of (l.product_expenses_snapshot || []) as any[])
                if (e?.code && !expenseTypes.has(e.code))
                    expenseTypes.set(e.code, lc(e.type) || 'fixed');
            for (const r of (l.product_rebates_snapshot || []) as any[])
                if (r?.code && !rebateTypes.has(r.code))
                    rebateTypes.set(r.code, lc(r.type) || 'percent');
        }
        const expenseCols = Array.from(expenseTypes.keys()).sort();
        const rebateCols = Array.from(rebateTypes.keys()).sort();
        const E = expenseCols.length;
        const R = rebateCols.length;

        // ── Column index plan ──
        const expStart = 10;
        const expEnd = expStart + E - 1;
        const totalFobIdx = expStart + E;
        const rebStart = totalFobIdx + 1;
        const rebEnd = rebStart + R - 1;
        const marginIdx = rebStart + R;
        const grandIdx = marginIdx + 1;
        const rateIdx = grandIdx + 1;
        const amtIdx = grandIdx + 2;
        const realizationEnd = isForeign ? amtIdx : grandIdx;
        // Freight / CNF columns come after the realization group when present.
        const freightIdx = realizationEnd + 1;
        const cnfAmtIdx = realizationEnd + 2;
        const cnfRateIdx = realizationEnd + 3;
        const lastCol = hasFreight ? cnfRateIdx : realizationEnd;
        const width = lastCol + 1;

        // ── Meta banner + two-row grouped header ──
        const bannerR = 0;
        const headerR1 = 2;
        const headerR2 = 3;
        const dataR = 4;

        const h1: any[] = new Array(width).fill('');
        h1[0] = 'No';
        h1[1] = 'Product Name / Specifications';
        h1[2] = 'Part No';
        h1[3] = 'HSN Code';
        h1[4] = 'Qty';
        h1[5] = 'UOM';
        h1[6] = 'Rate';
        h1[7] = 'Disc';
        h1[8] = 'Price after Disc';
        h1[9] = 'Value (INR)';
        if (E > 0) h1[expStart] = 'Logistics FOB Cost Elements';
        h1[totalFobIdx] = 'Total FOB (INR)';
        if (R > 0) h1[rebStart] = 'Government Benefits';
        h1[marginIdx] = 'Margin';
        h1[grandIdx] = 'Grand Total (INR)';
        if (isForeign) h1[rateIdx] = `${docCur} Realization`;
        if (hasFreight) {
            h1[freightIdx] = `Freight (${docCur})`;
            h1[cnfAmtIdx] = `CNF Amount (${docCur})`;
            h1[cnfRateIdx] = `CNF Rate (${docCur})`;
        }

        const h2: any[] = new Array(width).fill('');
        for (let k = 0; k < E; k++) h2[expStart + k] = expenseCols[k];
        for (let k = 0; k < R; k++) h2[rebStart + k] = rebateCols[k];
        if (isForeign) {
            h2[rateIdx] = `Rate ${docCur}`;
            h2[amtIdx] = `Amt ${docCur}`;
        }

        // ── Data rows + running totals ──
        const totals = {
            qty: 0,
            value: 0,
            totalFob: 0,
            margin: 0,
            grand: 0,
            amt: 0,
            freight: 0,
            cnf: 0,
            exp: new Map<string, number>(),
            reb: new Map<string, number>(),
        };
        const dataAoa = exportLines.map((l, i) => {
            const qty = num(l.qty);
            const price = num(l.unit_price);
            const disc = num(l.discount_pct);
            const gross = qty * price;
            const taxable = r2(gross - (gross * disc) / 100);
            const priceDisc = r2(price * (1 - disc / 100));

            const expAmt = new Map<string, number>();
            for (const e of (l.product_expenses_snapshot || []) as any[]) {
                if (!e?.code) continue;
                const a =
                    lc(e.type) === 'percent'
                        ? (taxable * num(e.value)) / 100
                        : num(e.value);
                expAmt.set(e.code, r2((expAmt.get(e.code) || 0) + a));
            }
            let expensesAmt = 0;
            for (const v of expAmt.values()) expensesAmt += v;
            const totalFob = r2(taxable + expensesAmt);

            const rebAmt = new Map<string, number>();
            for (const r of (l.product_rebates_snapshot || []) as any[]) {
                if (!r?.code) continue;
                const a =
                    lc(r.type) === 'fixed'
                        ? num(r.pct)
                        : (totalFob * num(r.pct)) / 100;
                rebAmt.set(r.code, r2((rebAmt.get(r.code) || 0) + a));
            }
            let rebatesAmt = 0;
            for (const v of rebAmt.values()) rebatesAmt += v;
            const afterReb = r2(totalFob - rebatesAmt);
            const marginAmt = r2((afterReb * num(l.margin_pct)) / 100);
            const grand = r2(afterReb + marginAmt);
            const amtDoc = isForeign ? r2(grand * rate) : grand;
            const rateDoc = qty ? r2(amtDoc / qty) : 0;
            // CNF (Cost + Freight) = realization amount + this line's freight
            // share, both in document currency — mirrors the worksheet.
            const lineFreight = hasFreight ? num(lineFreights[i]) : 0;
            const cnfAmt = r2(amtDoc + lineFreight);
            const cnfRate = qty ? r2(cnfAmt / qty) : 0;

            totals.qty += qty;
            totals.value += taxable;
            totals.totalFob += totalFob;
            totals.margin += marginAmt;
            totals.grand += grand;
            totals.amt += amtDoc;
            totals.freight += lineFreight;
            totals.cnf += cnfAmt;
            for (const [c, v] of expAmt)
                totals.exp.set(c, (totals.exp.get(c) || 0) + v);
            for (const [c, v] of rebAmt)
                totals.reb.set(c, (totals.reb.get(c) || 0) + v);

            const row: any[] = new Array(width).fill('');
            row[0] = i + 1;
            row[1] = pName(l);
            row[2] = pPart(l);
            row[3] = pHsn(l);
            row[4] = qty ? qty.toLocaleString('en-IN') : '';
            row[5] = pUom(l);
            row[6] = inr(price);
            row[7] = `${disc}%`;
            row[8] = inr(priceDisc);
            row[9] = inr(taxable);
            for (let k = 0; k < E; k++)
                row[expStart + k] = expAmt.has(expenseCols[k])
                    ? inr(expAmt.get(expenseCols[k])!)
                    : '—';
            row[totalFobIdx] = inr(totalFob);
            for (let k = 0; k < R; k++)
                row[rebStart + k] = rebAmt.has(rebateCols[k])
                    ? inr(rebAmt.get(rebateCols[k])!)
                    : '—';
            row[marginIdx] = inr(marginAmt);
            row[grandIdx] = inr(grand);
            if (isForeign) {
                row[rateIdx] = fx(rateDoc, 4);
                row[amtIdx] = fx(amtDoc, 2);
            }
            if (hasFreight) {
                row[freightIdx] = docMoney(lineFreight);
                row[cnfAmtIdx] = docMoney(cnfAmt);
                row[cnfRateIdx] = isForeign
                    ? fx(cnfRate, 4)
                    : docMoney(cnfRate);
            }
            return row;
        });

        // ── TOTAL row ──
        const totalRow: any[] = new Array(width).fill('');
        totalRow[0] = 'TOTAL AMOUNT:';
        totalRow[4] = totals.qty ? totals.qty.toLocaleString('en-IN') : '';
        totalRow[9] = inr(totals.value);
        for (let k = 0; k < E; k++) {
            const v = totals.exp.get(expenseCols[k]);
            totalRow[expStart + k] = v ? inr(v) : '—';
        }
        totalRow[totalFobIdx] = inr(totals.totalFob);
        for (let k = 0; k < R; k++) {
            const v = totals.reb.get(rebateCols[k]);
            totalRow[rebStart + k] = v ? inr(v) : '—';
        }
        totalRow[marginIdx] = inr(totals.margin);
        totalRow[grandIdx] = inr(totals.grand);
        if (isForeign) totalRow[amtIdx] = fx(totals.amt, 2);
        if (hasFreight) {
            totalRow[freightIdx] = docMoney(totals.freight);
            totalRow[cnfAmtIdx] = docMoney(totals.cnf);
            const cnfRateTot = totals.qty ? r2(totals.cnf / totals.qty) : 0;
            totalRow[cnfRateIdx] = isForeign
                ? fx(cnfRateTot, 4)
                : docMoney(cnfRateTot);
        }

        // ── Assemble sheet ── banner row: exchange rate + shipment freight
        // (the freight figure the worksheet carries; 0 when the doc has none).
        const banner: any[] = new Array(width).fill('');
        banner[0] = `Exchange Rate (INR/${docCur})`;
        banner[4] = isForeign ? r2(1 / rate) : 1;
        banner[6] = `Freight (${docCur})`;
        banner[8] = r2(freightTotal);

        const noteRow: any[] = new Array(width).fill('');
        noteRow[0] =
            'Grand Total (INR) = Total FOB (Value + Expenses) + Margin − Rebates';

        const aoa: any[][] = [banner, [], h1, h2, ...dataAoa, totalRow, [], noteRow];
        const ws = XLSXStyle.utils.aoa_to_sheet(aoa);

        // ── Merges: single-column headers span both header rows; each band
        //    spans its sub-columns on the top row; the banner/total/note labels
        //    span the leading columns. ──
        const merges: any[] = [];
        const singleCols = [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, totalFobIdx, marginIdx, grandIdx,
            ...(hasFreight ? [freightIdx, cnfAmtIdx, cnfRateIdx] : []),
        ];
        for (const c of singleCols)
            merges.push({ s: { r: headerR1, c }, e: { r: headerR2, c } });
        if (E > 0)
            merges.push({
                s: { r: headerR1, c: expStart },
                e: { r: headerR1, c: expEnd },
            });
        if (R > 0)
            merges.push({
                s: { r: headerR1, c: rebStart },
                e: { r: headerR1, c: rebEnd },
            });
        if (isForeign)
            merges.push({
                s: { r: headerR1, c: rateIdx },
                e: { r: headerR1, c: amtIdx },
            });
        const totalRowIdx = dataR + dataAoa.length;
        merges.push({ s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 3 } });
        merges.push({
            s: { r: totalRowIdx + 2, c: 0 },
            e: { r: totalRowIdx + 2, c: Math.min(width - 1, grandIdx) },
        });
        ws['!merges'] = merges;

        // Column widths for readability.
        ws['!cols'] = Array.from({ length: width }, (_, c) => {
            if (c === 1) return { wch: 28 };
            if (c === 0) return { wch: 5 };
            if (c === 3) return { wch: 12 };
            return { wch: 13 };
        });

        // ── Cell styling (xlsx-js-style) — mirrors the on-screen worksheet. ──
        const CLR = {
            orange: 'E2761B',
            orangeDark: 'C25E10',
            gold: '8A7B3B',
            slate: '3B4A63',
            grey: '4A5568',
            totalBar: '16233B',
            white: 'FFFFFF',
            zebra: 'F7F7FB',
            grandBg: 'FDEBD8',
            grandText: 'C25E10',
            grandTextDark: 'F5A623',
            benefit: '2E9E5B',
            realize: '2F6FED',
            margin: '3B6FE0',
            logistics: 'C25E10',
            ink: '20303F',
            line: 'D9D9E3',
            muted: '8A8AA0',
            bannerBg: 'F3F2F7',
        };
        const inRange = (c: number, a: number, b: number) =>
            b >= a && c >= a && c <= b;
        const alignOf = (c: number): 'left' | 'center' | 'right' =>
            c === 0 || c === 3 || c === 5
                ? 'center'
                : c === 1 || c === 2
                  ? 'left'
                  : 'right';
        const headBg = (c: number): string => {
            if (E > 0 && inRange(c, expStart, expEnd)) return CLR.orange;
            if (c === totalFobIdx) return CLR.orangeDark;
            if (R > 0 && inRange(c, rebStart, rebEnd)) return CLR.gold;
            if (c === marginIdx) return CLR.slate;
            if (c === grandIdx) return CLR.orangeDark;
            if (isForeign && inRange(c, rateIdx, amtIdx)) return CLR.grey;
            if (hasFreight && inRange(c, freightIdx, cnfRateIdx)) return CLR.grey;
            return CLR.orange;
        };
        const dataColor = (c: number): string => {
            if (E > 0 && inRange(c, expStart, expEnd)) return CLR.logistics;
            if (R > 0 && inRange(c, rebStart, rebEnd)) return CLR.benefit;
            if (c === marginIdx) return CLR.margin;
            if (c === grandIdx) return CLR.grandText;
            if (isForeign && inRange(c, rateIdx, amtIdx)) return CLR.realize;
            if (hasFreight && inRange(c, freightIdx, cnfRateIdx)) return CLR.realize;
            return CLR.ink;
        };
        const thin = (rgb: string) => ({ style: 'thin', color: { rgb } });
        const boxAll = (rgb: string) => ({
            top: thin(rgb),
            bottom: thin(rgb),
            left: thin(rgb),
            right: thin(rgb),
        });
        const setStyle = (r: number, c: number, s: any) => {
            const ref = XLSXStyle.utils.encode_cell({ r, c });
            if (!ws[ref]) ws[ref] = { t: 's', v: '' };
            ws[ref].s = s;
        };

        // Header (both grouped rows).
        for (const hr of [headerR1, headerR2])
            for (let c = 0; c < width; c++)
                setStyle(hr, c, {
                    fill: { patternType: 'solid', fgColor: { rgb: headBg(c) } },
                    font: { color: { rgb: CLR.white }, bold: true, sz: 11 },
                    alignment: {
                        horizontal: 'center',
                        vertical: 'center',
                        wrapText: true,
                    },
                    border: boxAll(CLR.orangeDark),
                });

        // Data rows (zebra + grand-total emphasis).
        for (let ri = 0; ri < dataAoa.length; ri++)
            for (let c = 0; c < width; c++)
                setStyle(dataR + ri, c, {
                    fill: {
                        patternType: 'solid',
                        fgColor: {
                            rgb:
                                c === grandIdx
                                    ? CLR.grandBg
                                    : ri % 2
                                      ? CLR.zebra
                                      : CLR.white,
                        },
                    },
                    font: {
                        color: { rgb: dataColor(c) },
                        bold: c === grandIdx || c === totalFobIdx,
                        sz: 11,
                    },
                    alignment: { horizontal: alignOf(c), vertical: 'center' },
                    border: boxAll(CLR.line),
                });

        // Dark TOTAL bar.
        for (let c = 0; c < width; c++)
            setStyle(totalRowIdx, c, {
                fill: { patternType: 'solid', fgColor: { rgb: CLR.totalBar } },
                font: {
                    color: {
                        rgb: c === grandIdx ? CLR.grandTextDark : CLR.white,
                    },
                    bold: true,
                    sz: 11,
                },
                alignment: {
                    horizontal: c === 0 ? 'right' : alignOf(c),
                    vertical: 'center',
                },
                border: boxAll(CLR.totalBar),
            });

        // Banner (exchange rate / freight strip).
        for (let c = 0; c < width; c++)
            setStyle(bannerR, c, {
                fill: { patternType: 'solid', fgColor: { rgb: CLR.bannerBg } },
                font: { color: { rgb: CLR.ink }, bold: true, sz: 11 },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: boxAll(CLR.line),
            });

        // Formula note.
        const noteRowIdx = totalRowIdx + 2;
        for (let c = 0; c <= Math.min(width - 1, grandIdx); c++)
            setStyle(noteRowIdx, c, {
                font: { color: { rgb: CLR.muted }, italic: true, sz: 10 },
                alignment: { horizontal: 'left', vertical: 'center' },
            });

        // Row heights for the header/banner bands.
        ws['!rows'] = [];
        ws['!rows'][bannerR] = { hpt: 20 };
        ws['!rows'][headerR1] = { hpt: 22 };
        ws['!rows'][headerR2] = { hpt: 18 };

        const workbook = XLSXStyle.utils.book_new();
        XLSXStyle.utils.book_append_sheet(workbook, ws, 'Costing Report');
        return XLSXStyle.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
        }) as Buffer;
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. Build sample/export workbook
    // ──────────────────────────────────────────────────────────────────
    async buildWorkbook(
        companyId: string,
        opts: {
            docType: ENUM_SALES_DOC_TYPE;
            lines: SalesDocExportLineDto[];
            currencyCode?: string;
            exchangeRate?: number | string; // foreign-per-₹1; drives currency cols
            freightTotal?: number | string; // doc currency; qty-split into freight/CNF cols
            includeComputed: boolean; // export mode adds computed cols + Totals sheet
            includeReadme: boolean; // sample mode adds _README + _ProductsRef
        },
    ): Promise<Buffer> {
        // Quotation & Sales Order (po) use the costing-worksheet layout. PFI and
        // Lead keep their existing layout/behaviour below — scoped change so
        // other docs' import/export are unaffected.
        if (
            opts.docType === ENUM_SALES_DOC_TYPE.QUOTATION ||
            opts.docType === ENUM_SALES_DOC_TYPE.PO
        ) {
            return this.buildCostingWorkbook(companyId, opts);
        }
        const includeExport = docHasExportFields(opts.docType);
        // Leads are a simple requirement list — no vendor / discount / margin /
        // rebate / expense / weight columns. Just the essentials + description.
        const isLead = opts.docType === ENUM_SALES_DOC_TYPE.LEAD;
        const headers = isLead
            ? [
                  'product_code',
                  'product_name',
                  'qty',
                  'unit',
                  'unit_price',
                  'hs_code',
                  'part_no',
                  'customer_reference',
                  'description',
              ]
            : [
                  ...BASE_HEADERS,
                  ...(includeExport ? EXPORT_EXTRA_HEADERS : []),
                  'customer_reference',
              ];

        // Form lines carry product_id / vendor_id (not codes) — resolve the
        // codes from those ids so the Product/Vendor code columns are never
        // blank. (Leads have no vendor, so vendor_code legitimately stays empty.)
        const exportLines = opts.lines || [];
        const productCodeById = new Map<string, string>();
        const productNameById = new Map<string, string>();
        const partNoById = new Map<string, string>();
        const vendorCodeById = new Map<string, string>();
        if (
            exportLines.some((l) => !l.product_code && l.product_id) ||
            (isLead && exportLines.some((l) => l.product_id))
        ) {
            const prods = await this.productRepository.findByCompanyId(companyId);
            for (const p of prods as any[]) {
                productCodeById.set(p._id.toString(), p.code || '');
                productNameById.set(p._id.toString(), p.name || '');
                partNoById.set(p._id.toString(), p.part_no || '');
            }
        }
        if (exportLines.some((l) => !l.vendor_code && l.vendor_id)) {
            const vens = await this.vendorRepository.findByCompanyId(companyId);
            for (const v of vens as any[])
                vendorCodeById.set(v._id.toString(), v.vendor_code || '');
        }
        const resolveProductCode = (l: SalesDocExportLineDto): string =>
            l.product_code ||
            (l.product_id ? productCodeById.get(String(l.product_id)) : '') ||
            '';
        const resolveVendorCode = (l: SalesDocExportLineDto): string =>
            l.vendor_code ||
            (l.vendor_id ? vendorCodeById.get(String(l.vendor_id)) : '') ||
            '';

        // Convention (mirrors the product master sample sheet):
        //   header row has repeated literal "rebate" and "expense" columns.
        //   data cells hold the actual codes (DBK, RODTEP, CHA, …).
        // We size the rebate / expense column groups by the largest snapshot
        // across all lines, with at least one of each so the structure is
        // visible even when no line carries any rebate/expense.
        const rebateCodesPerLine = (opts.lines || []).map((l) =>
            (l.product_rebates_snapshot || [])
                .map((r: any) => r?.code)
                .filter(Boolean),
        );
        const expenseCodesPerLine = (opts.lines || []).map((l) =>
            (l.product_expenses_snapshot || [])
                .map((e: any) => e?.code)
                .filter(Boolean),
        );
        const maxRebates = Math.max(
            1,
            ...rebateCodesPerLine.map((a) => a.length),
        );
        const maxExpenses = Math.max(
            1,
            ...expenseCodesPerLine.map((a) => a.length),
        );

        const computedHeaders = opts.includeComputed
            ? [
                  'gross',
                  'discount_amt',
                  'taxable',
                  'rebate_total',
                  'expense_total',
                  'margin_amt',
                  'gst_amt',
                  'line_total',
              ]
            : [];

        const headerRow: string[] = isLead
            ? [...headers]
            : [
                  ...headers,
                  ...Array(maxRebates).fill('rebate'),
                  ...Array(maxExpenses).fill('expense'),
                  ...computedHeaders,
              ];

        const dataAoa = (opts.lines || []).map((l, i) => {
            if (isLead) {
                const partNo =
                    (l as any).part_no ||
                    (l.product_id ? partNoById.get(String(l.product_id)) : '') ||
                    '';
                const productName =
                    (l as any).product_name ||
                    (l.product_id
                        ? productNameById.get(String(l.product_id))
                        : '') ||
                    '';
                return [
                    resolveProductCode(l),
                    productName,
                    l.qty ?? '',
                    l.unit || '',
                    l.unit_price ?? '',
                    l.hs_code || '',
                    partNo,
                    (l as any).customer_reference || '',
                    (l as any).description || '',
                ];
            }
            const scalars: any[] = [
                resolveProductCode(l),
                resolveVendorCode(l),
                l.qty ?? '',
                l.unit || '',
                l.unit_price ?? '',
                l.discount_pct ?? '',
                l.tax_pct ?? '',
                l.margin_pct ?? '',
            ];
            if (includeExport) {
                scalars.push(
                    l.hs_code || '',
                    l.net_weight_kg ?? '',
                    l.gross_weight_kg ?? '',
                    l.package_count ?? '',
                );
            }
            // customer_reference is the last scalar column — kept in lock-step
            // with the header order above (after package_count).
            scalars.push((l as any).customer_reference || '');
            const rebs = rebateCodesPerLine[i] || [];
            const exps = expenseCodesPerLine[i] || [];
            const rebCells = Array.from(
                { length: maxRebates },
                (_, j) => rebs[j] || '',
            );
            const expCells = Array.from(
                { length: maxExpenses },
                (_, j) => exps[j] || '',
            );

            const computedCells: any[] = [];
            if (opts.includeComputed) {
                const c = computeLineCosting(l);
                computedCells.push(
                    c.gross,
                    c.discount_amt,
                    c.taxable,
                    c.rebate_total,
                    c.expense_total,
                    c.margin_amt,
                    c.gst_amt,
                    c.line_total,
                );
            }
            return [...scalars, ...rebCells, ...expCells, ...computedCells];
        });

        const workbook = utils.book_new();

        // Sheet 1: LineItems — single header row + data
        const linesSheet = utils.aoa_to_sheet([headerRow, ...dataAoa]);
        utils.book_append_sheet(workbook, linesSheet, 'LineItems');

        // Sheet 2: Totals (export-mode only; not for the simple Lead sheet)
        if (opts.includeComputed && !isLead) {
            const totals = (opts.lines || []).reduce(
                (acc, l) => {
                    const c = computeLineCosting(l);
                    acc.gross += c.gross;
                    acc.discount_amt += c.discount_amt;
                    acc.taxable += c.taxable;
                    acc.rebate_total += c.rebate_total;
                    acc.expense_total += c.expense_total;
                    acc.margin_amt += c.margin_amt;
                    acc.gst_amt += c.gst_amt;
                    acc.line_total += c.line_total;
                    return acc;
                },
                {
                    gross: 0,
                    discount_amt: 0,
                    taxable: 0,
                    rebate_total: 0,
                    expense_total: 0,
                    margin_amt: 0,
                    gst_amt: 0,
                    line_total: 0,
                },
            );
            const totalsRows = [
                ['Metric', `Amount (${opts.currencyCode || ''})`],
                ['Gross', totals.gross],
                ['Discount', totals.discount_amt],
                ['Taxable', totals.taxable],
                ['Rebates', totals.rebate_total],
                ['Expenses', totals.expense_total],
                ['Margin', totals.margin_amt],
                ['GST', totals.gst_amt],
                ['Grand Total', totals.line_total],
            ];
            const totalsSheet = utils.aoa_to_sheet(totalsRows);
            utils.book_append_sheet(workbook, totalsSheet, 'Totals');
        }

        // Sheet 3 (sample only): _README + _ProductsRef. Skipped for the
        // simple Lead sheet — just the LineItems columns, no helper sheets.
        if (opts.includeReadme && !isLead) {
            const readme = [
                ['Sales Doc Line-Items — Import Sample'],
                [],
                ['Sheet "LineItems" — one row per line item.'],
                [
                    'Required columns: product_code (must exist) and qty (> 0).',
                ],
                [
                    'vendor_code is optional — if blank, the cheapest active vendor from the product price list is used.',
                ],
                [
                    'unit_price / discount_pct fall back to the resolved vendor row when blank.',
                ],
                [
                    'tax_pct / margin_pct fall back to the product master when blank.',
                ],
                [],
                ['Rebate / expense columns'],
                [
                    'The header row repeats the literal column names "rebate" and "expense".',
                ],
                [
                    'Under each "rebate" column, put a rebate code (e.g. DBK, RODTEP). Under each "expense" column, put an expense code (e.g. PACKING, CHA).',
                ],
                [
                    'Leave a cell blank to skip. If a row has any rebate codes, only those rebates are applied to that line (others from the product master are dropped). Same for expenses. If both groups are empty for a row, all master defaults are kept.',
                ],
                [],
                ['Status meaning on the preview screen'],
                ['New      → product/vendor not in current form lines'],
                ['Updated  → product/vendor already present (will overwrite)'],
                ['Skipped  → duplicate of an earlier row in this sheet'],
                ['Warning  → imported with a fallback (vendor auto-pick, etc.)'],
                ['Error    → cannot import (blocked)'],
            ];
            utils.book_append_sheet(
                workbook,
                utils.aoa_to_sheet(readme),
                '_README',
            );

            // Sheet 4 (sample only): _ProductsRef
            if (opts.lines && opts.lines.length > 0) {
                const refRows: any[] = [
                    [
                        'product_code',
                        'product_name',
                        'available_rebates',
                        'available_expenses',
                    ],
                ];
                const seenCodes = new Set<string>();
                for (const l of opts.lines) {
                    const code = l.product_code || '';
                    if (!code || seenCodes.has(lc(code))) continue;
                    seenCodes.add(lc(code));
                    const rebates = (l.product_rebates_snapshot || [])
                        .map(
                            (r: any) =>
                                `${r.code}(${(r.type || 'percent').toLowerCase()})`,
                        )
                        .join(', ');
                    const expenses = (l.product_expenses_snapshot || [])
                        .map(
                            (e: any) =>
                                `${e.code}(${(e.type || 'percent').toLowerCase()})`,
                        )
                        .join(', ');
                    refRows.push([
                        code,
                        l.product_name || '',
                        rebates,
                        expenses,
                    ]);
                }
                utils.book_append_sheet(
                    workbook,
                    utils.aoa_to_sheet(refRows),
                    '_ProductsRef',
                );
            }
        }

        return write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
        }) as Buffer;
    }
}
