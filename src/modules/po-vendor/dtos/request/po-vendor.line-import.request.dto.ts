import { Type } from 'class-transformer';
import {
    IsArray,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/**
 * One raw row parsed client-side from an uploaded line-items sheet (mirrors
 * the Costing Worksheet import pattern: the FE parses the .xlsx with plain
 * `xlsx`, then POSTs plain rows here for server-side product resolution —
 * nothing is persisted, this only returns rows ready to merge into the
 * standalone POV create form's `lines` state).
 */
export class PoVendorLineImportRowDto {
    @IsString()
    @IsOptional()
    product_code?: string;

    @IsString()
    @IsOptional()
    part_no?: string;

    @IsString()
    @IsOptional()
    hsn_code?: string;

    @IsString()
    @IsOptional()
    unit?: string;

    @IsString()
    @IsOptional()
    qty?: string;

    @IsString()
    @IsOptional()
    unit_price?: string;

    @IsString()
    @IsOptional()
    discount_pct?: string;

    @IsString()
    @IsOptional()
    tax_pct?: string;
}

export class PoVendorLineImportResolveRequestDto {
    /** The vendor already selected on the form — used as a fallback price
     *  source when a row's Rate is left blank. */
    @IsString()
    @IsOptional()
    vendor_id?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineImportRowDto)
    rows: PoVendorLineImportRowDto[];
}
