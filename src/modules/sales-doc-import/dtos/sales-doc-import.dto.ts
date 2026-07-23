import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    ENUM_SALES_DOC_TYPE,
    ENUM_SALES_DOC_IMPORT_ROW_STATUS,
} from '../enums/sales-doc-import.enum';

// ──────────────────────────────────────────────────────────────────────────
// Resolve  POST /admin/sales-doc/import/resolve
// ──────────────────────────────────────────────────────────────────────────

export class SalesDocResolveExistingKeyDto {
    // Either product_id (preferred, since form lines carry IDs not codes) or
    // product_code may be supplied; the resolver classifies new vs updated
    // against whichever the line actually has.
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    product_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    product_code?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vendor_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vendor_code?: string;
}

export class SalesDocResolveRequestDto {
    @ApiProperty({ enum: ENUM_SALES_DOC_TYPE })
    @IsEnum(ENUM_SALES_DOC_TYPE)
    docType: ENUM_SALES_DOC_TYPE;

    // Parsed sheet rows — keys are arbitrary (whatever the header row had,
    // including dynamic Rebate:<CODE> / Expense:<CODE> columns), so we just
    // accept a free-form object array and normalize server-side.
    @ApiProperty({ type: [Object] })
    @IsArray()
    rows: Array<Record<string, any>>;

    // (product_code, vendor_code) pairs already present in the form's lines.
    // Used to classify rows as `new` vs `updated`.
    @ApiProperty({ type: [SalesDocResolveExistingKeyDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SalesDocResolveExistingKeyDto)
    existingKeys: SalesDocResolveExistingKeyDto[];
}

// Snapshot rows mirror the FE shape consumed by SalesDocLineItems —
// computeLineCosting() reads `pct` on rebates, `value` on expenses.
export interface ResolvedRebateSnapshot {
    rebate_id: string;
    code: string;
    name: string;
    type: 'percent' | 'fixed';
    pct: number;
}
export interface ResolvedExpenseSnapshot {
    expense_id: string;
    code: string;
    name: string;
    type: 'percent' | 'fixed';
    value: number;
}

// Final line shape returned to the FE — matches initLineItem keys so the
// FE can drop straight into useFieldArray.replace/append.
export interface ResolvedLine {
    product_id?: string;
    product_code: string;
    product_name?: string;
    description?: string;
    customer_reference?: string;
    vendor_id?: string;
    vendor_code?: string;
    qty: number;
    unit?: string;
    unit_price: number;
    discount_pct: number;
    tax_pct: number;
    margin_pct: number;
    // Product-master sourced; carried for display + import round-trip.
    part_no?: string;
    // hs_code (quotation/PFI key) + hsn_code (Sales Order key) — both set so
    // either form picks up the imported value.
    hs_code?: string;
    hsn_code?: string;
    net_weight_kg?: number;
    gross_weight_kg?: number;
    package_count?: number;
    // Per-line share of the shipment freight (document currency), read from the
    // sheet's `freight` column. The worksheet keeps freight at header level, so
    // the FE sums these back into the document's freight_total; the per-line
    // split is then re-derived by qty (Σ must equal the entered total).
    freight?: number;
    // Snapshots — seeded from product master, overridden by sheet columns.
    product_rebates_snapshot: ResolvedRebateSnapshot[];
    product_expenses_snapshot: ResolvedExpenseSnapshot[];
}

export class SalesDocResolveRowResponse {
    rowNum: number;
    status: ENUM_SALES_DOC_IMPORT_ROW_STATUS;
    warnings: string[];
    errors: string[];
    data: Partial<ResolvedLine>;
}

export class SalesDocResolveSummaryResponse {
    total: number;
    new: number;
    updated: number;
    skipped: number;
    errors: number;
    warnings: number;
}

export class SalesDocResolveResponseDto {
    summary: SalesDocResolveSummaryResponse;
    rows: SalesDocResolveRowResponse[];
}

// ──────────────────────────────────────────────────────────────────────────
// Sample  GET /admin/sales-doc/import/sample
// ──────────────────────────────────────────────────────────────────────────

export enum ENUM_SALES_DOC_SAMPLE_MODE {
    BLANK = 'blank',
    WITH_ROWS = 'with-rows',
}

// ──────────────────────────────────────────────────────────────────────────
// Export  POST /admin/sales-doc/import/export
// ──────────────────────────────────────────────────────────────────────────

// Reused for both the export endpoint and the sample "with-rows" mode.
// The FE serializes its current useFieldArray rows + form context here.
export class SalesDocExportLineDto {
    @IsOptional() @IsString() product_id?: string;
    @IsOptional() @IsString() product_code?: string;
    @IsOptional() @IsString() product_name?: string;
    @IsOptional() @IsString() part_no?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() customer_reference?: string;
    @IsOptional() @IsString() vendor_id?: string;
    @IsOptional() @IsString() vendor_code?: string;
    @IsOptional() qty?: number | string;
    @IsOptional() @IsString() unit?: string;
    @IsOptional() unit_price?: number | string;
    @IsOptional() discount_pct?: number | string;
    @IsOptional() tax_pct?: number | string;
    @IsOptional() margin_pct?: number | string;
    @IsOptional() @IsString() hs_code?: string;
    @IsOptional() net_weight_kg?: number | string;
    @IsOptional() gross_weight_kg?: number | string;
    @IsOptional() package_count?: number | string;
    @IsOptional() @IsArray() product_rebates_snapshot?: any[];
    @IsOptional() @IsArray() product_expenses_snapshot?: any[];
}

export class SalesDocExportRequestDto {
    @ApiProperty({ enum: ENUM_SALES_DOC_TYPE })
    @IsEnum(ENUM_SALES_DOC_TYPE)
    docType: ENUM_SALES_DOC_TYPE;

    @ApiProperty({ type: [SalesDocExportLineDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SalesDocExportLineDto)
    lines: SalesDocExportLineDto[];

    // Document currency & exchange — used for currency-formatted columns.
    @ApiPropertyOptional() @IsOptional() @IsString() currencyCode?: string;
    @ApiPropertyOptional() @IsOptional() exchangeRate?: number | string;

    // Shipment freight for a CNF quote/order, in the DOCUMENT currency. Header
    // level on the form — split across lines BY QTY for the freight / CNF
    // columns, exactly as the on-screen costing worksheet does.
    @ApiPropertyOptional() @IsOptional() freightTotal?: number | string;

    // Optional meta used in the filename + Totals sheet header.
    @ApiPropertyOptional() @IsOptional() @IsString() docNumber?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;

    // When `mode === sample-with-rows`, the workbook omits computed columns
    // and adds the _README and _ProductsRef sheets so the file is meant for
    // editing + re-importing rather than as a data snapshot.
    @ApiPropertyOptional() @IsOptional() @IsString() mode?: string;

    // `true` → build the presentation "costing report" workbook (grouped
    // header bands, pretty currency labels, computed amounts, TOTAL row). This
    // file is NOT re-importable — it is the client-facing report layout, kept
    // entirely separate from the round-trip data export above.
    @ApiPropertyOptional() @IsOptional() @IsBoolean() formatted?: boolean;
}
