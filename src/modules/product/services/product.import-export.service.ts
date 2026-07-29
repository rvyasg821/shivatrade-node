import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { UomService } from '@modules/uom/services/uom.service';
import { FileService } from '@common/file/services/file.service';
import { ProductService } from './product.service';
import { ProductRepository } from '../repository/repositories/product.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import {
    ENUM_PRODUCT_STATUS,
} from '../enums/product.enum';

// Scalar column order mirrors the Product Add form, section by section:
//   Basic → Pricing → Logistics → Descriptions.
// Product `code` is auto-generated (PRD-0001) — it is NOT an import column;
// any `code` column in an uploaded file is ignored. `name` and `category_name`
// are the only required inputs. Rebates / expenses are not imported.
const BASE_HEADERS = [
    // ── Basic ──
    'name',
    'category_name',
    'unit_of_measure',
    'status',
    // ── Pricing ──
    'hsn_code',
    'gst',
    'selling_price',
    'margin_pct',
    'currency_code',
    // ── Logistics ──
    'part_no',
    'pack_size',
    'country_of_origin',
    'net_weight_per_unit',
    'gross_weight_per_unit',
    // ── Descriptions ──
    'description',
    'specifications',
    'packaging_details',
    'quality_parameters',
];

interface SampleRow {
    [key: string]: any;
}

const SAMPLE_ROWS: SampleRow[] = [
    {
        name: 'Steel Rod 12mm',
        category_name: 'Raw Material',
        unit_of_measure: 'KG',
        status: 'active',
        hsn_code: '72142090',
        gst: '18',
        selling_price: '65.50',
        margin_pct: '12',
        currency_code: 'INR',
        part_no: 'SR-12-FE500',
        pack_size: '10',
        country_of_origin: 'India',
        net_weight_per_unit: '10.500',
        gross_weight_per_unit: '10.800',
        description: 'High tensile steel rod',
        specifications: 'Grade: Fe500; Length: 12m',
        packaging_details: 'Bundled, 10 rods per bundle',
        quality_parameters: 'IS 1786:2008 compliant',
    },
    {
        name: 'Packaging Box Large',
        category_name: 'Packaging',
        unit_of_measure: 'Box',
        status: 'inactive',
        hsn_code: '48191010',
        gst: '12',
        selling_price: '',
        margin_pct: '',
        currency_code: '',
        part_no: 'BOX-LG',
        pack_size: '25',
        country_of_origin: 'India',
        net_weight_per_unit: '0.450',
        gross_weight_per_unit: '0.500',
        description: 'Corrugated shipping box',
        specifications: 'Size: 60x40x40 cm',
        packaging_details: 'Flat-packed',
        quality_parameters: '5-ply corrugation',
    },
];

/** Build the sheet header row — just the scalar columns. */
function buildHeaderRow(): string[] {
    return [...BASE_HEADERS];
}

// The canonical UOM lookup used to be built here from ENUM_PRODUCT_UOM. It is
// now built per-request from the UOM master, because the client can add units
// and a module-level constant could never see them. Still case-insensitive:
// import files have always been allowed to say "kg" and get "KG" stored.

export interface ProductImportRow {
    rowNum: number;
    data: {
        name: string;
        category_name: string;
        category_id?: string;
        currency_code: string;
        currency_id?: string;
        status: ENUM_PRODUCT_STATUS;
        is_active: boolean;
        // Clearable fields: on an update row, a blank cell whose column is
        // present in the file is sent as `null` to clear the stored value.
        description?: string | null;
        specifications?: string | null;
        packaging_details?: string | null;
        quality_parameters?: string | null;
        hsn_code?: string | null;
        tax_pct?: number | null;
        unit_of_measure?: string;
        selling_price?: number | null;
        margin_pct?: number | null;
        part_no?: string | null;
        pack_size?: number | null;
        net_weight_per_unit?: number | null;
        gross_weight_per_unit?: number | null;
        country_of_origin?: string;
    };
    status: 'valid_new' | 'valid_update' | 'error';
    existingId?: string;
    errors: string[];
    // Non-blocking notices — e.g. an unknown rebate/expense code that was
    // skipped. The row still imports.
    warnings: string[];
}

@Injectable()
export class ProductImportExportService {
    private readonly logger = new Logger(ProductImportExportService.name);

    constructor(
        private readonly fileService: FileService,
        private readonly productService: ProductService,
        private readonly uomService: UomService,
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly companySettingsService: CompanySettingsService,
    ) {}

    /**
     * Sample Excel — the scalar columns with two filled example rows, plus a
     * second "Reference" sheet listing every valid Unit of Measure and the
     * company's existing Categories so users can copy exact values into the
     * import sheet.
     */
    async generateSampleExcel(companyId: string): Promise<Buffer> {
        const aoa: any[][] = [buildHeaderRow()];
        for (const r of SAMPLE_ROWS) {
            aoa.push(BASE_HEADERS.map((h) => r[h] ?? ''));
        }

        // Reference sheet: UOMs from the master (was a fixed enum) beside the
        // company's categories, so the template always offers what the client
        // has actually configured.
        const uomValues = await this.uomService.activeCodes();
        const categories = await this.categoryRepository.findByCompanyId(
            companyId,
        );
        const categoryNames = categories
            .map((c) => c.name)
            .filter(Boolean)
            .sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase()),
            );

        const refRows: any[][] = [['unit_of_measure', 'category_name']];
        const maxLen = Math.max(uomValues.length, categoryNames.length);
        for (let i = 0; i < maxLen; i++) {
            refRows.push([uomValues[i] ?? '', categoryNames[i] ?? '']);
        }

        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: 'Products', rows: aoa },
            { sheetName: 'Reference', rows: refRows },
        ]);
    }

    /** Export all of a company's products as an Excel buffer. */
    async exportProducts(companyId: string): Promise<Buffer> {
        const products = await this.productRepository.findByCompanyId(
            companyId,
            { order: { code: 'asc' as any } },
        );

        const [categories, currencies] = await Promise.all([
            this.categoryRepository.findByCompanyId(companyId),
            this.currencyRepository.findByCompanyId(companyId),
        ]);
        const catNameById = new Map<string, string>(
            categories.map((c) => [c._id.toString(), c.name]),
        );
        const curCodeById = new Map<string, string>(
            currencies.map((c) => [c._id.toString(), c.code]),
        );

        // Export includes the (auto-generated) product code after name — handy
        // for reference. It's NOT in the sample/import template; the importer
        // ignores it on re-upload (codes are always auto-generated).
        const exportHeaders = [
            BASE_HEADERS[0],
            'code',
            ...BASE_HEADERS.slice(1),
        ];
        const aoa: any[][] = [exportHeaders];
        products.forEach((p) => {
            aoa.push([
                p.name || '',
                p.code || '',
                p.category_id
                    ? catNameById.get(p.category_id.toString()) || ''
                    : '',
                p.unit_of_measure || '',
                p.is_active
                    ? ENUM_PRODUCT_STATUS.ACTIVE
                    : ENUM_PRODUCT_STATUS.INACTIVE,
                p.hsn_code || '',
                p.tax_pct ?? '',
                p.selling_price ?? '',
                p.margin_pct ?? '',
                p.currency_id
                    ? curCodeById.get(p.currency_id.toString()) || ''
                    : '',
                p.part_no || '',
                p.pack_size ?? '',
                p.country_of_origin || '',
                p.net_weight_per_unit ?? '',
                p.gross_weight_per_unit ?? '',
                p.description || '',
                p.specifications || '',
                p.packaging_details || '',
                p.quality_parameters || '',
            ]);
        });

        return this.fileService.writeExcelFromArray(aoa);
    }

    /**
     * Parse + validate an uploaded file. Row-level problems are collected into
     * each row's `errors`; only file-level problems throw a BadRequestException.
     */
    async parseAndValidate(
        fileBuffer: Buffer,
        companyId: string,
    ): Promise<{ summary: any; rows: ProductImportRow[] }> {
        let sheets;
        try {
            // `defval: null` keeps every header column on each row even when a
            // cell is blank — otherwise an emptied cell's key is dropped and we
            // can't tell "column present but cleared" from "column omitted".
            sheets = this.fileService.readExcel(fileBuffer, { defval: null });
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
        const requiredCols = ['name', 'category_name', 'unit_of_measure'];
        const missing = requiredCols.filter((c) => !headerKeys.includes(c));
        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', ',
                )}. Expected columns: ${BASE_HEADERS.join(', ')}.`,
            );
        }

        // Relationship lookups — case-insensitive name/code → id.
        const [categories, currencies, existingProducts, uomCodes] =
            await Promise.all([
                this.categoryRepository.findByCompanyId(companyId),
                this.currencyRepository.findByCompanyId(companyId),
                this.productRepository.findByCompanyId(companyId),
                this.uomService.activeCodes(),
            ]);

        // One lookup for the whole file, not one query per row.
        const uomByLower = new Map<string, string>(
            uomCodes.map((c) => [c.toLowerCase(), c]),
        );
        const categoryIdByName = new Map<string, string>(
            categories.map((c) => [
                c.name.trim().toLowerCase(),
                c._id.toString(),
            ]),
        );
        const currencyIdByCode = new Map<string, string>(
            currencies.map((c) => [
                c.code.trim().toLowerCase(),
                c._id.toString(),
            ]),
        );
        // Code is auto-generated, so an existing product is matched by NAME
        // (case-insensitive) to decide new-vs-update on re-import.
        const existingProductByName = new Map<string, any>(
            existingProducts.map((p) => [p.name.trim().toLowerCase(), p]),
        );
        // Company "home" currency — used when a row leaves currency_code blank.
        const defaultCurrency = currencies.find((c) => c.is_default);

        const seenNames = new Set<string>();
        const rows: ProductImportRow[] = [];

        for (let i = 0; i < rawRows.length; i++) {
            const raw = rawRows[i];
            const rowNum = i + 2; // 1-indexed + header row
            const errors: string[] = [];
            const warnings: string[] = [];

            const get = (col: string): string => {
                const key = Object.keys(raw).find(
                    (k) => k.trim().toLowerCase() === col,
                );
                return key ? String(raw[key] ?? '').trim() : '';
            };

            const name = get('name');
            const categoryName = get('category_name');
            const currencyCodeRaw = get('currency_code');
            const statusRaw = get('status').toLowerCase();

            // ── Required fields (code is auto-generated, never imported) ──
            if (!name) errors.push('Name is required');
            else if (name.length < 2)
                errors.push('Name must be at least 2 characters');
            else if (name.length > 200)
                errors.push('Name must not exceed 200 characters');

            // ── Category (required relationship) ──
            let categoryId: string | undefined;
            if (!categoryName) {
                errors.push('Category is required');
            } else {
                categoryId = categoryIdByName.get(
                    categoryName.toLowerCase(),
                );
                if (!categoryId) {
                    errors.push(
                        `Category "${categoryName}" not found for this company`,
                    );
                }
            }

            // ── Status (defaults to active) ──
            let status = ENUM_PRODUCT_STATUS.ACTIVE;
            if (statusRaw) {
                if (statusRaw === 'active' || statusRaw === 'inactive') {
                    status = statusRaw as ENUM_PRODUCT_STATUS;
                } else {
                    errors.push("Status must be 'active' or 'inactive'");
                }
            }

            // ── Optional string fields with length caps ──
            const hsnCode = get('hsn_code');
            if (hsnCode && hsnCode.length > 50)
                errors.push('HSN code must not exceed 50 characters');
            const partNo = get('part_no');
            if (partNo && partNo.length > 100)
                errors.push('Part no must not exceed 100 characters');
            // Country of origin defaults to India when the column is left blank.
            const countryOfOrigin = get('country_of_origin') || 'India';
            if (countryOfOrigin.length > 100)
                errors.push('Country of origin must not exceed 100 characters');

            // ── Unit of measure (required) ──
            let unitOfMeasure: string | undefined;
            const uomRaw = get('unit_of_measure');
            if (!uomRaw) {
                errors.push('Unit of measure is required');
            } else {
                unitOfMeasure = uomByLower.get(uomRaw.toLowerCase());
                if (!unitOfMeasure) {
                    errors.push(
                        `Unit of measure must be one of: ${uomCodes.join(', ')}`,
                    );
                }
            }

            // ── Numeric fields ──
            const num = (
                col: string,
                label: string,
                opts: {
                    min?: number;
                    max?: number;
                    maxDecimals?: number;
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
                if (opts.maxDecimals !== undefined) {
                    const decimals = (rawVal.split('.')[1] || '').length;
                    if (decimals > opts.maxDecimals) {
                        errors.push(
                            `${label} must have at most ${opts.maxDecimals} decimal place(s)`,
                        );
                        return undefined;
                    }
                }
                return n;
            };

            const taxPct = num('gst', 'GST %', {
                min: 0,
                max: 100,
                maxDecimals: 2,
            });
            const sellingPrice = num('selling_price', 'Selling price', {
                min: 0,
                maxDecimals: 2,
            });
            const marginPct = num('margin_pct', 'Margin %', {
                min: 0,
                max: 100,
                maxDecimals: 2,
            });
            const packSize = num('pack_size', 'Pack size', {
                min: 1,
                integer: true,
            });
            const netWeight = num('net_weight_per_unit', 'Net weight', {
                min: 0,
                maxDecimals: 3,
            });
            const grossWeight = num(
                'gross_weight_per_unit',
                'Gross weight',
                { min: 0, maxDecimals: 3 },
            );

            if (
                netWeight !== undefined &&
                grossWeight !== undefined &&
                grossWeight < netWeight
            ) {
                errors.push(
                    'Gross weight must be greater than or equal to net weight',
                );
            }

            // ── Currency (required relationship when a price is set) ──
            // Blank cell → fall back to the company's default ("home") currency.
            let currencyId: string | undefined;
            let currencyCode = currencyCodeRaw;
            if (currencyCodeRaw) {
                currencyId = currencyIdByCode.get(
                    currencyCodeRaw.toLowerCase(),
                );
                if (!currencyId) {
                    errors.push(
                        `Currency "${currencyCodeRaw}" not found for this company`,
                    );
                }
            } else if (defaultCurrency) {
                currencyId = defaultCurrency._id.toString();
                currencyCode = defaultCurrency.code;
            }
            if (
                sellingPrice !== undefined &&
                sellingPrice > 0 &&
                !currencyId
            ) {
                errors.push(
                    currencyCodeRaw
                        ? 'Currency code is required when a selling price is set'
                        : 'A selling price is set but no currency code was provided and your company has no default currency',
                );
            }

            // ── Duplicate name within the file ──
            const nameKey = name.toLowerCase();
            if (name && seenNames.has(nameKey)) {
                errors.push('Duplicate product name in file');
            }
            if (name) seenNames.add(nameKey);

            // ── New vs update (matched on name, case-insensitive — code is
            //     auto-generated, so name is the import identity) ──
            let rowStatus: 'valid_new' | 'valid_update' | 'error' =
                'valid_new';
            let existingId: string | undefined;
            if (name && existingProductByName.has(nameKey)) {
                existingId = existingProductByName
                    .get(nameKey)
                    ._id.toString();
                rowStatus = 'valid_update';
            }
            if (errors.length > 0) rowStatus = 'error';

            // Clearing semantics (mirrors the product edit form): on an update
            // row, a blank cell whose column IS present in the file clears the
            // stored value (null). On a new row — or when the column is absent
            // from the file — a blank stays undefined so it's left untouched /
            // takes the backend default.
            const willUpdate = !!existingId;
            const clearable = (col: string, value: any): any => {
                const hasValue =
                    value !== undefined && value !== null && value !== '';
                if (hasValue) return value;
                return willUpdate && headerKeys.includes(col)
                    ? null
                    : undefined;
            };

            rows.push({
                rowNum,
                data: {
                    name,
                    category_name: categoryName,
                    category_id: categoryId,
                    currency_code: currencyCode,
                    currency_id: currencyId,
                    status,
                    is_active: status === ENUM_PRODUCT_STATUS.ACTIVE,
                    description: clearable('description', get('description')),
                    specifications: clearable(
                        'specifications',
                        get('specifications'),
                    ),
                    packaging_details: clearable(
                        'packaging_details',
                        get('packaging_details'),
                    ),
                    quality_parameters: clearable(
                        'quality_parameters',
                        get('quality_parameters'),
                    ),
                    hsn_code: clearable('hsn_code', hsnCode),
                    tax_pct: clearable('gst', taxPct),
                    unit_of_measure: unitOfMeasure,
                    selling_price: clearable('selling_price', sellingPrice),
                    margin_pct: clearable('margin_pct', marginPct),
                    part_no: clearable('part_no', partNo),
                    pack_size: clearable('pack_size', packSize),
                    net_weight_per_unit: clearable(
                        'net_weight_per_unit',
                        netWeight,
                    ),
                    gross_weight_per_unit: clearable(
                        'gross_weight_per_unit',
                        grossWeight,
                    ),
                    country_of_origin: countryOfOrigin || undefined,
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

    /**
     * Persist the validated rows in BATCHES. One bad row never aborts the batch.
     *
     * Rewritten for bulk performance. The old path called
     * productService.create/update once per row, and each create() re-queried
     * categories, currencies, UOM and name/code existence AND scanned the whole
     * product table to compute the next code — O(n²) work that timed out on a
     * ~6600-row upload. Rows arrive already fully validated by parseAndValidate
     * (category / currency / UOM resolved, new-vs-update decided), so here we:
     *   1. load existing products ONCE (for update targets + code seeding),
     *   2. generate ALL new codes in a single settings read/write,
     *   3. bulk-insert new rows in chunks (createMany),
     *   4. chunk-save updates (undefined = untouched, null = cleared — the same
     *      semantics productService.update relies on).
     * Rebates / expenses are never imported, so no link work is needed.
     */
    async importProducts(
        rows: ProductImportRow[],
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

        const CHUNK = 500;
        const chunk = <T>(arr: T[]): T[][] => {
            const out: T[][] = [];
            for (let i = 0; i < arr.length; i += CHUNK)
                out.push(arr.slice(i, i + CHUNK));
            return out;
        };

        // Validated row → flat scalar payload (shared by insert + update).
        const toPayload = (d: ProductImportRow['data']): any => ({
            name: d.name,
            category_id: d.category_id,
            status: d.status,
            is_active: d.is_active,
            description: d.description,
            specifications: d.specifications,
            packaging_details: d.packaging_details,
            quality_parameters: d.quality_parameters,
            hsn_code: d.hsn_code,
            tax_pct: d.tax_pct,
            unit_of_measure: d.unit_of_measure,
            selling_price: d.selling_price,
            margin_pct: d.margin_pct,
            currency_id: d.currency_id,
            part_no: d.part_no,
            pack_size: d.pack_size,
            net_weight_per_unit: d.net_weight_per_unit,
            gross_weight_per_unit: d.gross_weight_per_unit,
            country_of_origin: d.country_of_origin,
        });

        const importable = rows.filter((r) => r.status !== 'error');
        const newRows = importable.filter((r) => !r.existingId);
        const updateRows = importable.filter((r) => !!r.existingId);

        // Existing products, loaded ONCE — update targets + next-code seed.
        const existing = await this.productRepository.findByCompanyId(companyId);
        const existingById = new Map<string, any>(
            existing.map((p) => [p._id.toString(), p]),
        );
        const existingCodes = existing
            .map((p) => p.code)
            .filter(Boolean) as string[];

        // ── New rows: one code batch, then bulk insert in chunks. ──
        if (newRows.length) {
            const codes = await this.companySettingsService.generateProductCodes(
                companyId,
                existingCodes,
                newRows.length,
            );
            const inserts = newRows.map((row, i) => ({
                row,
                data: {
                    ...toPayload(row.data),
                    name: (row.data.name || '').trim(),
                    code: codes[i],
                    company_id: companyId,
                    created_by: userId,
                },
            }));
            for (const group of chunk(inserts)) {
                try {
                    await this.productRepository.createMany(
                        group.map((g) => g.data),
                    );
                    created += group.length;
                } catch (bulkErr: any) {
                    // A constraint hiccup shouldn't drop the whole chunk — retry
                    // the group row-by-row so only the offending row(s) fail.
                    for (const g of group) {
                        try {
                            await this.productRepository.create(g.data);
                            created++;
                        } catch (err: any) {
                            this.logger.error(
                                `Import row ${g.row.rowNum} failed: ${err?.message}`,
                            );
                            errors.push({
                                row: g.row.rowNum,
                                message: err?.message || 'Import failed',
                            });
                        }
                    }
                }
            }
        }

        // ── Update rows: assign scalars onto the loaded entity, chunk-save. ──
        for (const group of chunk(updateRows)) {
            await Promise.all(
                group.map(async (row) => {
                    const entity = existingById.get(row.existingId as string);
                    if (!entity) {
                        errors.push({
                            row: row.rowNum,
                            message: 'Product no longer exists',
                        });
                        return;
                    }
                    try {
                        Object.assign(entity, toPayload(row.data), {
                            name: (row.data.name || '').trim(),
                        });
                        await this.productRepository.save(entity);
                        updated++;
                    } catch (err: any) {
                        this.logger.error(
                            `Import row ${row.rowNum} failed: ${err?.message}`,
                        );
                        errors.push({
                            row: row.rowNum,
                            message: err?.message || 'Import failed',
                        });
                    }
                }),
            );
        }

        return { created, updated, errors };
    }
}
