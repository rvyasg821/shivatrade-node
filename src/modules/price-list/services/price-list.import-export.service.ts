import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { PriceListService } from './price-list.service';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorCategoryRepository } from '@modules/vendor/repository/repositories/vendor-category.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';

const SHEET_NAME = 'Price List';

// Column order mirrors the Price List Add form.
// `vendor_code`, `product_code` and `unit_price` are the required inputs.
const EXCEL_HEADERS = [
    'vendor_code',
    'product_code',
    'currency_code',
    'unit_price',
    'moq',
    'discount_pct',
    'lead_time_days',
    'effective_date',
    'valid_until',
    'notes',
];

const SAMPLE_ROWS = [
    {
        vendor_code: 'VEN-001',
        product_code: 'PRD-001',
        currency_code: 'INR',
        unit_price: '1250.00',
        moq: '100',
        discount_pct: '5',
        lead_time_days: '15',
        effective_date: '14/05/26',
        valid_until: '',
        notes: 'Standard rate; FOB Mumbai',
    },
    {
        vendor_code: 'VEN-002',
        product_code: 'PRD-002',
        currency_code: '',
        unit_price: '480',
        moq: '',
        discount_pct: '',
        lead_time_days: '30',
        effective_date: '',
        valid_until: '',
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
        product_id?: string;
        currency_code: string;
        currency_id?: string;
        unit_price?: string;
        moq?: number;
        discount_pct?: string;
        lead_time_days?: number;
        effective_date?: string;
        valid_until?: string;
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
        const currencyCodeById = new Map<string, string>(
            currencies.map((c) => [c._id.toString(), c.code || '']),
        );

        const rows = priceLists.map((r) => {
            const base: any = {
                product_code: r.product_id
                    ? productCodeById.get(r.product_id.toString()) || ''
                    : '',
                currency_code: r.currency_id
                    ? currencyCodeById.get(r.currency_id.toString()) || ''
                    : '',
                unit_price: r.unit_price ?? '',
                moq: r.moq ?? '',
                discount_pct: r.discount_pct ?? '',
                lead_time_days: r.lead_time_days ?? '',
                effective_date: formatDDMMYY(r.effective_date),
                valid_until: formatDDMMYY(r.valid_until),
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

        // Legacy data is preserved: every imported row creates a new
        // price-list entry, even if the same vendor + product (+ effective
        // date) already exists or appears again within the same file.

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
            const currencyCodeRaw = get('currency_code');

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

            // ── Currency — blank or unknown falls back to the default ──
            let currencyId: string | undefined;
            let currencyCode = currencyCodeRaw;
            if (currencyCodeRaw) {
                currencyId = currencyIdByCode.get(
                    currencyCodeRaw.toLowerCase(),
                );
                if (!currencyId && defaultCurrency) {
                    warnings.push(
                        `Currency "${currencyCodeRaw}" not found — used company default "${defaultCurrency.code}"`,
                    );
                    currencyId = defaultCurrency._id.toString();
                    currencyCode = defaultCurrency.code;
                }
            } else if (defaultCurrency) {
                currencyId = defaultCurrency._id.toString();
                currencyCode = defaultCurrency.code;
            }
            if (!currencyId) {
                errors.push(
                    'Currency could not be resolved and your company has no default currency',
                );
            }

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

            const moq = num('moq', 'MOQ', { min: 1, integer: true });
            const discountPct = num('discount_pct', 'Discount %', {
                min: 0,
                max: 100,
            });
            const leadTimeDays = num('lead_time_days', 'Lead time (days)', {
                min: 0,
                integer: true,
            });

            // ── Effective date ──
            // Blank defaults to today — UNLESS a valid_until is given, in
            // which case effective_date must be provided explicitly.
            let effectiveDate = today;
            const effParsed = parseDateCell(getRaw('effective_date'));
            const effProvided = !!effParsed.iso || !!effParsed.error;
            if (effParsed.error) {
                errors.push(
                    'Effective date is invalid (use DD/MM/YY or YYYY-MM-DD)',
                );
            } else if (effParsed.iso) {
                effectiveDate = effParsed.iso;
            }

            // ── Valid until — optional ──
            let validUntil: string | undefined;
            const vuParsed = parseDateCell(getRaw('valid_until'));
            if (vuParsed.error) {
                errors.push(
                    'Valid until is invalid (use DD/MM/YY or YYYY-MM-DD)',
                );
            } else if (vuParsed.iso) {
                validUntil = vuParsed.iso;
            }
            if (validUntil && !effProvided) {
                errors.push(
                    'Effective date is required when valid until is set — row skipped',
                );
            }
            if (validUntil && validUntil < effectiveDate) {
                errors.push(
                    'Valid until must be on or after the effective date',
                );
            }

            // ── Notes ──
            const notes = get('notes');
            if (notes.length > 2000) {
                errors.push('Notes must not exceed 2000 characters');
            }

            // Every valid row imports as a new entry — duplicates against
            // existing data or within the file are allowed by design so
            // legacy price history is preserved.
            let rowStatus: 'valid_new' | 'valid_update' | 'error' =
                'valid_new';
            const existingId: string | undefined = undefined;
            if (errors.length > 0) rowStatus = 'error';

            rows.push({
                rowNum,
                data: {
                    vendor_code: vendorCode,
                    vendor_id: vendorId,
                    product_code: productCode,
                    product_id: productId,
                    currency_code: currencyCode,
                    currency_id: currencyId,
                    unit_price: unitPrice,
                    moq,
                    discount_pct:
                        discountPct !== undefined
                            ? String(discountPct)
                            : undefined,
                    lead_time_days: leadTimeDays,
                    effective_date: effectiveDate,
                    valid_until: validUntil,
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
                    currency_id: d.currency_id,
                    unit_price: d.unit_price,
                    moq: d.moq,
                    discount_pct: d.discount_pct,
                    lead_time_days: d.lead_time_days,
                    effective_date: d.effective_date,
                    valid_until: d.valid_until,
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

        return { created, updated, errors };
    }
}
