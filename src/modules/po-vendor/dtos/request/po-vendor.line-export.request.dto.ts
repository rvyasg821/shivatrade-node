import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

/** One line from the standalone POV create form's `lines` state — the form
 *  only holds `product_id` (not the code), so the export resolves the code
 *  server-side by id; everything else is exported as-is. */
export class PoVendorLineExportRowDto {
    @IsString()
    @IsOptional()
    product_id?: string;

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
    discount?: string;

    @IsString()
    @IsOptional()
    tax_pct?: string;
}

export class PoVendorLineExportRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineExportRowDto)
    lines: PoVendorLineExportRowDto[];
}
