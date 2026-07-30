import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { PriceListService } from './price-list.service';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorCategoryRepository } from '@modules/vendor/repository/repositories/vendor-category.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { AuditLogService } from '@modules/tracking/services/audit-log.service';

const SHEET_NAME = 'Price List';

// Column order mirrors the Price List Add form.
// `vendor_code`, `product_code` and `unit_price` are the required inputs.
// Cost-only sheet. valid_until / discount_pct / moq intentionally omitted —
// the price list holds the net vendor cost; versioning is by effective_date (a
// newer row auto-expires the previous). The DB columns stay for back-compat.
const EXCEL_HEADERS = [
    'vendor_code',
    'product_code',
    // Display-only — shows which product each code is. Import resolves the row
    // by product_code and ignores this column.
    'product_name',
    // No currency column — a price row always uses the VENDOR's currency.
    'unit_price',
    'lead_time_days',
    'effective_date',
    'notes',
];

const SAMPLE_ROWS = [
    {
        vendor_code: 'VEN-001',
        product_code: 'PRD-001',
        product_name: 'Sample Product 1',
        unit_price: '1250.00',
        lead_time_days: '15',
        effective_date: '14/05/26',
        notes: 'Standard rate; FOB Mumbai',
    },
    {
        vendor_code: 'VEN-002',
        product_code: 'PRD-002',
        product_name: 'Sample Product 2',
        unit_price: '480',
        lead_time_days: '30',
        effective_date: '',
        notes: '',
    },
];

// ── Date helpers ───────────────────────────────────────────────────────────
/** Excel serial date → ISO `YYYY-MM-DD` (Excel epoch is 1899-12-30). */
function excelSerialToISO(serial: number): string | null {
    if (!Number.isFinite(serial)) return null;
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/** Build a valid ISO date or null if the y/m/d combo is out of range. */
function buildISO(y: number, mo: number, da: number): string | null {
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const d = new Date(Date.UTC(y, mo - 1, da));
    if (
        d.getUTCFullYear() !== y ||
        d.getUTCMonth() !== mo - 1 ||
        d.getUTCDate() !== da
    ) {
        return null;
    }
    return d.toISOString().slice(0, 10);
}

/**
 * Parse a date cell into ISO `YYYY-MM-DD`. Accepts Excel serial numbers,
 * `DD/MM/YY`, `DD/MM/YYYY` (also `-` / `.` separators) and `YYYY-MM-DD`.
 * Returns `{ iso }` on success, `{ error: true }` on a present-but-bad value,
 * `{}` when the cell is empty.
 */
function parseDateCell(value: any): { iso?: string; error?: boolean } {
    if (value === undefined || value === null || value === '') return {};
    if (typeof value === 'number') {
        const iso = excelSerialToISO(value);
        return iso ? { iso } : { error: true };
    }
    const s = String(value).trim();
    if (!s) return {};

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        const iso = buildISO(+m[1], +m[2], +m[3]);
        return iso ? { iso } : { error: true };
    }
    // DD/MM/YY or DD/MM/YYYY (also "-" or "." separators)
    m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
    if (m) {
        let year = +m[3];
        if (year < 100) year += 2000; // 26 → 2026
        const iso = buildISO(year, +m[2], +m[1]);
        return iso ? { iso } : { error: true };
    }
    return { error: true };
}

/** ISO `YYYY-MM-DD` → `DD/MM/YY` for export / sample readability. */
function formatDDMMYY(iso?: string | null): string {
    if (!iso) return '';
    const m = String(iso)
        .slice(0, 10)
        .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso);
    return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

export interface PriceListImportRow {
    rowNum: number;
    data: {
        vendor_code: string;
        vendor_id?: string;
        product_code: string;
        product_name?: string;
        product_id?: string;
        currency_code: string;
        currency_id?: string;
        unit_price?: string;
        lead_time_days?: number;
        effective_date?: string;
        notes?: string;
    };
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
    // Non-blocking notices — e.g. an unknown currency that fell back to the
    // company's default. The row still imports.
    warnings: string[];
}

@Injectable()
export class PriceListImportExportService {
    private readonly logger = new Logger(PriceListImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly priceListService: PriceListService,
        private readonly priceListRepository: PriceListRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorCategoryRepository: VendorCategoryRepository,
        private readonly productRepository: ProductRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly auditLogService: AuditLogService,
    ) {}

    /**
     * Sample Excel — every column, with two filled example rows. When called
     * from a vendor-scoped page (vendor detail's Price List tab), `vendorId`
     * is set so the `vendor_code` column is dropped — the page already knows
     * the vendor.
     */
    generateSampleExcel(vendorId?: string): Buffer {
        const rows = vendorId
            ? SAMPLE_ROWS.map(({ vendor_code: _v, ...rest }) => rest)
            : SAMPLE_ROWS;
        return this.fileService.writeExcel([
            { data: rows, sheetName: SHEET_NAME },
        ]);
    }

    /**
     * Export price-list rows as an Excel buffer. When `vendorId` is set the
     * export is scoped to that vendor and the `vendor_code` column is dropped
     * (the page already knows the vendor).
     */
    async exportPriceLists(
        companyId: string,
        vendorId?: string,
    ): Promise<Buffer> {
        const filter: any = { company_id: companyId };
        if (vendorId) filter.vendor_id = vendorId;
        const priceLists = await this.priceListRepository.findAll(filter, {
            order: { effective_date: 'desc' as any },
        });

        const [vendors, products, currencies] = await Promise.all([
            this.vendorRepository.findByCompanyId(companyId),
            this.productRepository.findByCompanyId(companyId),
            this.currencyRepository.findByCompanyId(companyId),
        ]);
        const vendorCodeById = new Map<string, string>(
            vendors.map((v) => [v._id.toString(), v.vendor_code || '']),
        );
        const productCodeById = new Map<string, string>(
            products.map((p) => [p._id.toString(), p.code || '']),
        );
        const productNameById = new Map<string, string>(
            products.map((p) => [p._id.toString(), p.name || '']),
        );
        const currencyCodeById = new Map<string, string>(
            currencies.map((c) => [c._id.toString(), c.code || '']),
        );

        const rows = priceLists.map((r) => {
            const base: any = {
                product_code: r.product_id
                    ? productCodeById.get(r.product_id.toString()) || ''
                    : '',
                product_name: r.product_id
                    ? productNameById.get(r.product_id.toString()) || ''
                    : '',
                unit_price: r.unit_price ?? '',
                lead_time_days: r.lead_time_days ?? '',
                effective_date: formatDDMMYY(r.effective_date),
                notes: r.notes || '',
            };
            if (!vendorId) {
                base.vendor_code = r.vendor_id
                    ? vendorCodeById.get(r.vendor_id.toString()) || ''
                    : '';
                // Re-order so vendor_code stays first (matches EXCEL_HEADERS).
                const { vendor_code, ...rest } = base;
                return { vendor_code, ...rest };
            }
            return base;
        });

        if (rows.length === 0) {
            const headers = vendorId
                ? EXCEL_HEADERS.filter((h) => h !== 'vendor_code')
                : EXCEL_HEADERS;
            return this.fileService.writeExcelFromArray([headers]);
        }
        return this.fileService.writeExcel([
            { data: rows, sheetName: SHEET_NAME },
        ]);
    }

    /**
     * Parse + validate an uploaded file. Row-level problems are collected into
     * each row's `errors`; only file-level problems throw a BadRequestException.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string,
        scopedVendorId?: string,
    ): Promise<{ summary: any; rows: PriceListImportRow[] }> {
        let sheets;
        try {
            sheets = this.fileService.readExcel(fileBuffer);
        } catch {
            throw new BadRequestException(
                'Unable to read the file. Please upload a valid Excel or CSV file.',
            );
        }

        const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
        if (!rawRows.length) {
            throw new BadRequestException('The file contains no data rows.');
        }

        const headerKeys = Object.keys(rawRows[0]).map((k) =>
            k.trim().toLowerCase(),
        );
        // vendor_code is required only on the global import — vendor-scoped
        // imports (vendor detail page) already know the vendor from context.
        const requiredCols = scopedVendorId
            ? ['product_code', 'unit_price']
            : ['vendor_code', 'product_code', 'unit_price'];
        const missing = requiredCols.filter((c) => !headerKeys.includes(c));
        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', ',
                )}. Expected columns: ${EXCEL_HEADERS.join(', ')}.`,
            );
        }

        // Relationship lookups — case-insensitive code → id.
        const [vendors, products, currencies, vendorCategories] =
            await Promise.all([
                this.vendorRepository.findByCompanyId(companyId),
                this.productRepository.findByCompanyId(companyId),
                this.currencyRepository.findByCompanyId(companyId),
                this.vendorCategoryRepository.findAll({
                    company_id: companyId,
                }),
            ]);
        const vendorIdByCode = new Map<string, string>();
        for (const v of vendors) {
            if (v.vendor_code) {
                vendorIdByCode.set(
                    v.vendor_code.trim().toLowerCase(),
                    v._id.toString(),
                );
            }
        }
        const productIdByCode = new Map<string, string>(
            products.map((p) => [
                p.code.trim().toLowerCase(),
                p._id.toString(),
            ]),
        );
        const productNameById = new Map<string, string>(
            products.map((p) => [p._id.toString(), p.name || '']),
        );
        // productId → its category_id, and vendorId → set of its category_ids.
        // Used to enforce that a product belongs to the vendor (same scoping
        // the Add form applies to its vendor-filtered product dropdown).
        const productCategoryById = new Map<string, string>(
            products.map((p) => [
                p._id.toString(),
                p.category_id ? p.category_id.toString() : '',
            ]),
        );
        const vendorCategorySet = new Map<string, Set<string>>();
        for (const vc of vendorCategories) {
            const vid = vc.vendor_id.toString();
            if (!vendorCategorySet.has(vid)) {
                vendorCategorySet.set(vid, new Set());
            }
            vendorCategorySet.get(vid)!.add(vc.category_id.toString());
        }
        const currencyIdByCode = new Map<string, string>(
            currencies.map((c) => [
                c.code.trim().toLowerCase(),
                c._id.toString(),
            ]),
        );
        // Company "home" currency — used when currency_code is blank/unknown.
        const defaultCurrency = currencies.find((c) => c.is_default);

        // Existing price-list rows → so the preview can mark each line as
        // New vs Update (an import upserts the row for the same vendor +
        // product + effective_date). Scoped to the vendor when known.
        const existingFilter: any = { company_id: companyId };
        if (scopedVendorId) existingFilter.vendor_id = scopedVendorId;
        const existingRows = await this.priceListRepository.findAll(
            existingFilter as any,
        );
        const dayKey = (vid: any, pid: any, eff: any) =>
            `${vid}|${pid}|${String(eff).slice(0, 10)}`;
        const existingByKey = new Map<string, string>();
        for (const e of existingRows as any[]) {
            existingByKey.set(
                dayKey(e.vendor_id, e.product_id, e.effective_date),
                e._id.toString(),
            );
        }

        const today = new Date().toISOString().slice(0, 10);
        const rows: PriceListImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const warnings: string[] = [];

            // Strips outer whitespace (including non-breaking spaces) and
            // collapses internal runs of whitespace to a single space — Excel
            // cells often arrive with pasted padding or   from Word that
            // .trim() alone misses.
            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col,
                );
                if (!key) return '';
                return String(raw[key] ?? '')
                    .replace(/ /g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            const getRaw = (col: string): any => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col,
                );
                return key ? raw[key] : undefined;
            };

            const productCode = get('product_code');

            // ── Vendor — required relationship; either taken from page
            // context (vendor detail import) or resolved from the row's
            // vendor_code (global import). ──
            let vendorId: string | undefined;
            let vendorCode = '';
            if (scopedVendorId) {
                vendorId = scopedVendorId;
                // Surface the code in preview/error messages.
                const vendorMatch = vendors.find(
                    (v) => v._id.toString() === scopedVendorId,
                );
                vendorCode = vendorMatch?.vendor_code || '';
                // Guard: a vendor-scoped sheet must not carry another vendor's
                // rows. If the sheet's vendor_code is present and differs from
                // the selected vendor, flag the row as an error (skipped).
                const sheetVendorCode = (get('vendor_code') || '').trim();
                if (
                    sheetVendorCode &&
                    vendorCode &&
                    sheetVendorCode.toLowerCase() !== vendorCode.toLowerCase()
                ) {
                    errors.push(
                        `Vendor code "${sheetVendorCode}" does not match the selected vendor "${vendorCode}" — row skipped`,
                    );
                }
            } else {
                vendorCode = get('vendor_code');
                if (!vendorCode) {
                    errors.push('Vendor code is required');
                } else {
                    vendorId = vendorIdByCode.get(vendorCode.toLowerCase());
                    if (!vendorId) {
                        errors.push(
                            `Vendor code "${vendorCode}" does not exist for this company — row skipped`,
                        );
                    }
                }
            }

            // ── Product (required relationship — skip whole row if unknown) ──
            let productId: string | undefined;
            if (!productCode) {
                errors.push('Product code is required');
            } else {
                productId = productIdByCode.get(productCode.toLowerCase());
                if (!productId) {
                    errors.push(
                        `Product code "${productCode}" does not exist for this company — row skipped`,
                    );
                }
            }

            // Category membership is no longer enforced — both the global
            // and vendor-scoped imports accept any (vendor, product) pair
            // that exists for this company.

            // Currency ALWAYS follows the vendor — resolved server-side on save.
            // Here we only surface the vendor's currency for the preview.
            const currencyCode = vendorId
                ? vendors.find((v) => v._id.toString() === vendorId)
                      ?.currency_code || 'INR'
                : '';

            // ── Unit price (required — skip whole row if missing/invalid) ──
            let unitPrice: string | undefined;
            const unitPriceRaw = get('unit_price');
            if (!unitPriceRaw) {
                errors.push('Unit price is required');
            } else {
                const n = Number(unitPriceRaw);
                if (!Number.isFinite(n) || n < 0) {
                    errors.push(
                        'Unit price must be a number greater than or equal to 0',
                    );
                } else {
                    unitPrice = String(n);
                }
            }

            // ── Optional numeric fields ──
            const num = (
                col: string,
                label: string,
                opts: {
                    min?: number;
                    max?: number;
                    integer?: boolean;
                },
            ): number | undefined => {
                const rawVal = get(col);
                if (!rawVal) return undefined;
                const n = Number(rawVal);
                if (!Number.isFinite(n)) {
                    errors.push(`${label} must be a number`);
                    return undefined;
                }
                if (opts.integer && !Number.isInteger(n)) {
                    errors.push(`${label} must be a whole number`);
                    return undefined;
                }
                if (opts.min !== undefined && n < opts.min) {
                    errors.push(`${label} must be at least ${opts.min}`);
                    return undefined;
                }
                if (opts.max !== undefined && n > opts.max) {
                    errors.push(`${label} must not exceed ${opts.max}`);
                    return undefined;
                }
                return n;
            };

            const leadTimeDays = num('lead_time_days', 'Lead time (days)', {
                min: 0,
                integer: true,
            });

            // ── Effective date ──
            // Blank defaults to today. Versioning is by effective_date — a
            // newer row auto-expires the prior one, so there's no valid_until.
            let effectiveDate = today;
            const effParsed = parseDateCell(getRaw('effective_date'));
            if (effParsed.error) {
                errors.push(
                    'Effective date is invalid (use DD/MM/YY or YYYY-MM-DD)',
                );
            } else if (effParsed.iso) {
                effectiveDate = effParsed.iso;
            }

            // ── Notes ──
            const notes = get('notes');
            if (notes.length > 2000) {
                errors.push('Notes must not exceed 2000 characters');
            }

            // Decide the action: error (has problems) → otherwise update when a
            // price-list row already exists for the same vendor + product +
            // effective_date (the importer upserts it), else a new row.
            let rowStatus: 'valid_new' | 'valid_update' | 'error' =
                'valid_new';
            let existingId: string | undefined;
            if (errors.length > 0) {
                rowStatus = 'error';
            } else if (vendorId && productId) {
                const ex = existingByKey.get(
                    dayKey(vendorId, productId, effectiveDate),
                );
                if (ex) {
                    rowStatus = 'valid_update';
                    existingId = ex;
                }
            }

            rows.push({
                rowNum,
                data: {
                    vendor_code: vendorCode,
                    vendor_id: vendorId,
                    product_code: productCode,
                    product_name: productId
                        ? productNameById.get(productId) || ''
                        : '',
                    product_id: productId,
                    // Display only — the real currency is the vendor's, set on save.
                    currency_code: currencyCode,
                    unit_price: unitPrice,
                    lead_time_days: leadTimeDays,
                    effective_date: effectiveDate,
                    notes: notes || undefined,
                },
                status: rowStatus,
                existingId,
                errors,
                warnings,
            });
        }

        const summary = {
            total: rows.length,
            valid_new: rows.filter((r) => r.status === 'valid_new').length,
            valid_update: rows.filter((r) => r.status === 'valid_update')
                .length,
            errors: rows.filter((r) => r.status === 'error').length,
            warnings: rows.reduce((n, r) => n + r.warnings.length, 0),
        };

        return { summary, rows };
    }

    /** Persist the validated rows. One bad row never aborts the batch. */
    async importPriceLists(
        rows: PriceListImportRow[],
        companyId: string,
        userId: string,
    ): Promise<{
        created: number;
        updated: number;
        errors: { row: number; message: string }[];
    }> {
        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        for (const row of rows) {
            if (row.status === 'error') continue;

            try {
                const d = row.data;
                const payload: any = {
                    vendor_id: d.vendor_id,
                    product_id: d.product_id,
                    // currency omitted — price-list.service derives it from vendor.
                    unit_price: d.unit_price,
                    lead_time_days: d.lead_time_days,
                    effective_date: d.effective_date,
                    notes: d.notes,
                };

                await this.priceListService.create(
                    companyId,
                    payload,
                    userId,
                );
                created++;
            } catch (err: any) {
                this.logger.error(
                    `Import row ${row.rowNum} failed: ${err?.message}`,
                );
                errors.push({
                    row: row.rowNum,
                    message: err?.message || 'Import failed',
                });
            }
        }

        // ONE audit row for the whole import, not one per price. `PriceListEntity`
        // is deliberately off the audit allowlist — a 500-row import would
        // otherwise write 500 history entries and bury every other change.
        // Fire-and-forget: an audit failure must never fail the import.
        if (created || updated) {
            this.auditLogService.recordSummary({
                entity_name: 'PriceListEntity',
                entity_label: `Price list import — ${created + updated} price(s)`,
                summary: { created, updated, failed: errors.length },
                company_id: companyId,
                user_id: userId,
            });
        }

        return { created, updated, errors };
    }
}
