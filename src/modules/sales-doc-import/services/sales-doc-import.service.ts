import { Injectable, Logger } from '@nestjs/common';
import { utils, write } from 'xlsx';

import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';

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
    let rebatesAmt = 0;
    for (const r of l.product_rebates_snapshot || []) {
        if ((r as any).type === 'fixed') rebatesAmt += num((r as any).pct);
        else rebatesAmt += (taxable * num((r as any).pct)) / 100;
    }
    rebatesAmt = r2(rebatesAmt);
    const afterRebates = r2(taxable - rebatesAmt);
    let expensesAmt = 0;
    for (const e of l.product_expenses_snapshot || []) {
        if ((e as any).type === 'percent')
            expensesAmt += (afterRebates * num((e as any).value)) / 100;
        else expensesAmt += num((e as any).value);
    }
    expensesAmt = r2(expensesAmt);
    const afterExpenses = r2(afterRebates + expensesAmt);
    const margin = r2((afterExpenses * num(l.margin_pct)) / 100);
    const netTotal = r2(afterExpenses + margin);
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
        for (const v of vendors)
            if (v.vendor_code) vendorByCode.set(lc(v.vendor_code), v);
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

            // Header-insensitive cell access.
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
            // Pull the product's current vendor catalogue from price-list.
            // This gives us "which vendors sell this product" AND a default
            // unit_price/discount when those cells are blank.
            const today = new Date().toISOString().slice(0, 10);
            const allPlForProduct = await this.priceListRepository.findAll(
                {
                    company_id: companyId,
                    product_id: productId,
                } as any,
                { order: { effective_date: 'desc' as any } },
            );
            // Keep most-recent row per vendor; filter expired.
            const seen = new Set<string>();
            for (const r of allPlForProduct) {
                if (r.valid_until && String(r.valid_until) < today) continue;
                if (String(r.effective_date) > today) continue;
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
                line.net_weight_kg =
                    numOrUndef(get('net_weight_kg')) ??
                    num(product.net_weight_per_unit) * (qty || 0);
                line.gross_weight_kg =
                    numOrUndef(get('gross_weight_kg')) ??
                    num(product.gross_weight_per_unit) * (qty || 0);
                line.package_count = numOrUndef(get('package_count')) ?? 0;
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
                    qty: 100,
                    unit: 'KG',
                    unit_price: 25,
                    discount_pct: 0,
                    tax_pct: 18,
                    margin_pct: 10,
                    product_rebates_snapshot: [],
                    product_expenses_snapshot: [],
                },
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
    // 2. Build sample/export workbook
    // ──────────────────────────────────────────────────────────────────
    async buildWorkbook(
        companyId: string,
        opts: {
            docType: ENUM_SALES_DOC_TYPE;
            lines: SalesDocExportLineDto[];
            currencyCode?: string;
            includeComputed: boolean; // export mode adds computed cols + Totals sheet
            includeReadme: boolean; // sample mode adds _README + _ProductsRef
        },
    ): Promise<Buffer> {
        const includeExport = docHasExportFields(opts.docType);
        const headers = [
            ...BASE_HEADERS,
            ...(includeExport ? EXPORT_EXTRA_HEADERS : []),
            'customer_reference',
        ];

        // Form lines carry product_id / vendor_id (not codes) — resolve the
        // codes from those ids so the Product/Vendor code columns are never
        // blank. (Leads have no vendor, so vendor_code legitimately stays empty.)
        const exportLines = opts.lines || [];
        const productCodeById = new Map<string, string>();
        const vendorCodeById = new Map<string, string>();
        if (exportLines.some((l) => !l.product_code && l.product_id)) {
            const prods = await this.productRepository.findByCompanyId(companyId);
            for (const p of prods as any[])
                productCodeById.set(p._id.toString(), p.code || '');
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

        const headerRow: string[] = [
            ...headers,
            ...Array(maxRebates).fill('rebate'),
            ...Array(maxExpenses).fill('expense'),
            ...computedHeaders,
        ];

        const dataAoa = (opts.lines || []).map((l, i) => {
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

        // Sheet 2: Totals (export-mode only)
        if (opts.includeComputed) {
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

        // Sheet 3 (sample only): _README
        if (opts.includeReadme) {
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
