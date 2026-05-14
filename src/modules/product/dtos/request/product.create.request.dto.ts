import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsUUID,
    IsBoolean,
    IsNumber,
    IsInt,
    IsArray,
    Min,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ENUM_PRODUCT_STATUS } from '@modules/product/enums/product.enum';

export class ProductRebateLinkDto {
    @IsUUID() rebate_id: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    pct?: number;
}

export class ProductExpenseLinkDto {
    @IsUUID() expense_id: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    value?: number;
}

export class ProductCreateRequestDto {
    @IsString() @IsNotEmpty() @MaxLength(50) code: string;
    @IsString() @IsNotEmpty() @MaxLength(200) name: string;

    @IsUUID() @IsNotEmpty() category_id: string;

    @IsString() @IsOptional() description?: string;
    @IsString() @IsOptional() specifications?: string;
    @IsString() @IsOptional() packaging_details?: string;
    @IsString() @IsOptional() quality_parameters?: string;

    @IsString() @IsOptional() @MaxLength(50) hsn_code?: string;
    @IsString() @IsOptional() @MaxLength(50) unit_of_measure?: string;

    // GST tied to the HSN. Seeds quotation/PFI line tax %.
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    tax_pct?: number;

    // ── Pricing ──
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    selling_price?: number;

    // Default selling margin %, used as the seed value on Quotation lines.
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    margin_pct?: number;

    @IsUUID() @IsOptional() currency_id?: string;

    // ── Identification (extra) ──
    @IsString() @IsOptional() @MaxLength(100) part_no?: string;

    // ── Logistics ──
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    pack_size?: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    net_weight_per_unit?: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    gross_weight_per_unit?: number;

    @IsString() @IsOptional() @MaxLength(100) country_of_origin?: string;

    // ── Links ──
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRebateLinkDto)
    @IsOptional()
    rebates?: ProductRebateLinkDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductExpenseLinkDto)
    @IsOptional()
    expenses?: ProductExpenseLinkDto[];

    @IsEnum(ENUM_PRODUCT_STATUS) @IsOptional() status?: ENUM_PRODUCT_STATUS;
    @IsBoolean() @IsOptional() is_active?: boolean;
}
