import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { ProductService } from './product.service';
import { ProductRepository } from '../repository/repositories/product.repository';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import {
    ENUM_PRODUCT_STATUS,
    ENUM_PRODUCT_UOM,
} from '../enums/product.enum';

// Scalar column order mirrors the Product Add form, section by section:
//   Basic → Pricing → Logistics → Descriptions.
// `code`, `name` and `category_name` are the only required inputs.
// After these come repeated `rebates` columns then repeated `expenses`
// columns — one master CODE per cell (e.g. DBK). Add as many of each
// column as a product needs.
const BASE_HEADERS = [
    // ── Basic ──
    'name',
    'code',
    'category_name',
    'unit_of_measure',
    'status',
    // ── Pricing ──
    'hsn_code',
    'tax_pct',
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
    rebates: string[];
    expenses: string[];
}

const SAMPLE_ROWS: SampleRow[] = [
    {
        name: 'Steel Rod 12mm',
        code: 'PRD-001',
        category_name: 'Raw Material',
        unit_of_measure: 'KG',
        status: 'active',
        hsn_code: '72142090',
        tax_pct: '18',
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
        rebates: ['DBK', 'RODTEP'],
        expenses: ['PACKING', 'CHA'],
    },
    {
        name: 'Packaging Box Large',
        code: 'PRD-002',
        category_name: 'Packaging',
        unit_of_measure: 'Box',
        status: 'inactive',
        hsn_code: '48191010',
        tax_pct: '12',
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
        rebates: [],
        expenses: [],
    },
];

/**
 * Build a sheet header row: the scalar columns followed by `count`
 * repeated `rebates` columns and `count` repeated `expenses` columns.
 */
function buildHeaderRow(maxRebates: number, maxExpenses: number): string[] {
    return [
        ...BASE_HEADERS,
        ...Array(maxRebates).fill('rebates'),
        ...Array(maxExpenses).fill('expenses'),
    ];
}

// Canonical UOM lookup — accepts any casing, stores the canonical enum value.
const UOM_BY_LOWER: Record<string, string> = Object.values(
    ENUM_PRODUCT_UOM
).reduce((acc, v) => {
    acc[String(v).toLowerCase()] = v;
    return acc;
}, {} as Record<string, string>);

export interface ProductImportRow {
    rowNum: number;
    data: {
        code: string;
        name: string;
        category_name: string;
        category_id?: string;
        currency_code: string;
        currency_id?: string;
        status: ENUM_PRODUCT_STATUS;
        is_active: boolean;
        description?: string;
        specifications?: string;
        packaging_details?: string;
        quality_parameters?: string;
        hsn_code?: string;
        tax_pct?: number;
        unit_of_measure?: string;
        selling_price?: number;
        margin_pct?: number;
        part_no?: string;
        pack_size?: number;
        net_weight_per_unit?: number;
        gross_weight_per_unit?: number;
        country_of_origin?: string;
        rebates: { rebate_id: string; pct?: number }[];
        expenses: { expense_id: string; value?: number }[];
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
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly expenseRepository: ExpenseRepository,
    ) {}

    /** Sample Excel — every column, with two filled example rows. */
    generateSampleExcel(): Buffer {
        const maxRebates = Math.max(
            1,
            ...SAMPLE_ROWS.map((r) => r.rebates.length),
        );
        const maxExpenses = Math.max(
            1,
            ...SAMPLE_ROWS.map((r) => r.expenses.length),
        );
        const aoa: any[][] = [buildHeaderRow(maxRebates, maxExpenses)];
        for (const r of SAMPLE_ROWS) {
            aoa.push([
                ...BASE_HEADERS.map((h) => r[h] ?? ''),
                ...Array.from(
                    { length: maxRebates },
                    (_, j) => r.rebates[j] || '',
                ),
                ...Array.from(
                    { length: maxExpenses },
                    (_, j) => r.expenses[j] || '',
                ),
            ]);
        }
        return this.fileService.writeExcelFromArray(aoa);
    }

    /** Export all of a company's products as an Excel buffer. */
    async exportProducts(companyId: string): Promise<Buffer> {
        const products = await this.productRepository.findByCompanyId(
            companyId,
            { order: { code: 'asc' as any } },
        );

        const [categories, currencies, hydrated] = await Promise.all([
            this.categoryRepository.findByCompanyId(companyId),
            this.currencyRepository.findByCompanyId(companyId),
            // Reuse the service's hydration for rebate/expense codes.
            this.productService.mapListWithRelations(products),
        ]);
        const catNameById = new Map<string, string>(
            categories.map((c) => [c._id.toString(), c.name]),
        );
        const curCodeById = new Map<string, string>(
            currencies.map((c) => [c._id.toString(), c.code]),
        );

        // `mapListWithRelations` preserves input order — zip by index.
        const rebateCodesPerRow = products.map((_, i) =>
            ((hydrated[i] as any)?.rebates || []).map((r: any) => r.code),
        );
        const expenseCodesPerRow = products.map((_, i) =>
            ((hydrated[i] as any)?.expenses || []).map((e: any) => e.code),
        );
        // Always keep at least one rebates + one expenses column so the
        // structure is visible even when no product has any links.
        const maxRebates = Math.max(
            1,
            ...rebateCodesPerRow.map((a) => a.length),
        );
        const maxExpenses = Math.max(
            1,
            ...expenseCodesPerRow.map((a) => a.length),
        );

        const aoa: any[][] = [buildHeaderRow(maxRebates, maxExpenses)];
        products.forEach((p, i) => {
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
                ...Array.from(
                    { length: maxRebates },
                    (_, j) => rebateCodesPerRow[i][j] || '',
                ),
                ...Array.from(
                    { length: maxExpenses },
                    (_, j) => expenseCodesPerRow[i][j] || '',
                ),
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
        const requiredCols = ['code', 'name', 'category_name'];
        const missing = requiredCols.filter((c) => !headerKeys.includes(c));
        if (missing.length > 0) {
            throw new BadRequestException(
                `Missing required column(s): ${missing.join(
                    ', ',
                )}. Expected columns: ${BASE_HEADERS.join(
                    ', ',
                )}, then one or more "rebates" and "expenses" columns.`,
            );
        }

        // Relationship lookups — case-insensitive name/code → id.
        const [
            categories,
            currencies,
            rebates,
            expenses,
            existingProducts,
        ] = await Promise.all([
            this.categoryRepository.findByCompanyId(companyId),
            this.currencyRepository.findByCompanyId(companyId),
            this.rebateRepository.findByCompanyId(companyId),
            this.expenseRepository.findByCompanyId(companyId),
            this.productRepository.findByCompanyId(companyId),
        ]);
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
        const rebateIdByCode = new Map<string, string>(
            rebates.map((r) => [
                r.code.trim().toLowerCase(),
                r._id.toString(),
            ]),
        );
        const expenseIdByCode = new Map<string, string>(
            expenses.map((e) => [
                e.code.trim().toLowerCase(),
                e._id.toString(),
            ]),
        );
        const existingProductByCode = new Map<string, any>(
            existingProducts.map((p) => [
                p.code.trim().toLowerCase(),
                p,
            ]),
        );
        // Company "home" currency — used when a row leaves currency_code blank.
        const defaultCurrency = currencies.find((c) => c.is_default);

        const seenCodes = new Set<string>();
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

            // Repeated columns: xlsx de-dupes duplicate headers as
            // `rebates`, `rebates_1`, `rebates_2`… — collect every non-empty
            // cell whose header is `<col>` or `<col>` + a numeric suffix.
            const getMulti = (col: string): string[] => {
                const re = new RegExp(`^${col}(_?\\d+)?$`, 'i');
                const out: string[] = [];
                for (const k of Object.keys(raw)) {
                    if (re.test(k.trim())) {
                        const v = String(raw[k] ?? '').trim();
                        if (v) out.push(v);
                    }
                }
                return out;
            };

            const code = get('code');
            const name = get('name');
            const categoryName = get('category_name');
            const currencyCodeRaw = get('currency_code');
            const statusRaw = get('status').toLowerCase();

            // ── Required fields ──
            if (!code) errors.push('Code / SKU is required');
            else if (code.length > 50)
                errors.push('Code / SKU must not exceed 50 characters');

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

            // ── Unit of measure ──
            let unitOfMeasure: string | undefined;
            const uomRaw = get('unit_of_measure');
            if (uomRaw) {
                unitOfMeasure = UOM_BY_LOWER[uomRaw.toLowerCase()];
                if (!unitOfMeasure) {
                    errors.push(
                        `Unit of measure must be one of: ${Object.values(
                            ENUM_PRODUCT_UOM,
                        ).join(', ')}`,
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

            const taxPct = num('tax_pct', 'Tax %', {
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

            // ── Rebates / Expenses (one master CODE per repeated column) ──
            // Each non-empty `rebates` / `expenses` cell holds a single master
            // code (e.g. DBK). An unknown or duplicate code is skipped with a
            // non-blocking warning — only that link is dropped, the row still
            // imports. An empty set clears the product's links on update.
            const resolveLinks = (
                codes: string[],
                kind: 'rebate' | 'expense',
                idByCode: Map<string, string>,
            ): string[] => {
                const label = kind === 'rebate' ? 'Rebate' : 'Expense';
                const out: string[] = [];
                const seen = new Set<string>();
                for (const rawCode of codes) {
                    const codePart = rawCode.trim();
                    if (!codePart) continue;
                    const id = idByCode.get(codePart.toLowerCase());
                    if (!id) {
                        warnings.push(
                            `${label} code "${codePart}" does not exist for this company — skipped`,
                        );
                        continue;
                    }
                    if (seen.has(id)) {
                        warnings.push(
                            `Duplicate ${kind} "${codePart}" — skipped`,
                        );
                        continue;
                    }
                    seen.add(id);
                    out.push(id);
                }
                return out;
            };

            const rebateIds = resolveLinks(
                getMulti('rebates'),
                'rebate',
                rebateIdByCode,
            );
            const expenseIds = resolveLinks(
                getMulti('expenses'),
                'expense',
                expenseIdByCode,
            );

            // ── Duplicate code within the file ──
            const codeKey = code.toLowerCase();
            if (code && seenCodes.has(codeKey)) {
                errors.push('Duplicate code / SKU in file');
            }
            if (code) seenCodes.add(codeKey);

            // ── New vs update (matched on code, case-insensitive) ──
            let rowStatus: 'valid_new' | 'valid_update' | 'error' =
                'valid_new';
            let existingId: string | undefined;
            if (code && existingProductByCode.has(codeKey)) {
                existingId = existingProductByCode
                    .get(codeKey)
                    ._id.toString();
                rowStatus = 'valid_update';
            }
            if (errors.length > 0) rowStatus = 'error';

            rows.push({
                rowNum,
                data: {
                    code,
                    name,
                    category_name: categoryName,
                    category_id: categoryId,
                    currency_code: currencyCode,
                    currency_id: currencyId,
                    status,
                    is_active: status === ENUM_PRODUCT_STATUS.ACTIVE,
                    description: get('description') || undefined,
                    specifications: get('specifications') || undefined,
                    packaging_details: get('packaging_details') || undefined,
                    quality_parameters:
                        get('quality_parameters') || undefined,
                    hsn_code: hsnCode || undefined,
                    tax_pct: taxPct,
                    unit_of_measure: unitOfMeasure,
                    selling_price: sellingPrice,
                    margin_pct: marginPct,
                    part_no: partNo || undefined,
                    pack_size: packSize,
                    net_weight_per_unit: netWeight,
                    gross_weight_per_unit: grossWeight,
                    country_of_origin: countryOfOrigin || undefined,
                    rebates: rebateIds.map((id) => ({ rebate_id: id })),
                    expenses: expenseIds.map((id) => ({
                        expense_id: id,
                    })),
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

        for (const row of rows) {
            if (row.status === 'error') continue;

            try {
                const d = row.data;
                // `rebates` / `expenses` are always sent — they fully replace
                // the product's existing links (an empty cell clears them).
                const payload: any = {
                    code: d.code,
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
                    rebates: d.rebates,
                    expenses: d.expenses,
                };

                if (row.status === 'valid_update' && row.existingId) {
                    const existing = await this.productService.findOneById(
                        row.existingId,
                    );
                    await this.productService.update(existing, payload);
                    updated++;
                } else {
                    await this.productService.create(
                        companyId,
                        payload,
                        userId,
                    );
                    created++;
                }
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
