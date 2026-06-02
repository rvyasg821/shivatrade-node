import {
    IsArray,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

/**
 * Requirement line on a Lead — mirrors the quotation line so the shared
 * SalesDocLineItems component works verbatim. qty / unit_price are lenient
 * (a lead is indicative; price is finalised at Quotation).
 */
export class LeadLineRequestDto {
    @IsUUID() @IsNotEmpty() product_id: string;

    @IsUUID() @IsOptional() vendor_id?: string;

    @IsString() @IsOptional() @MaxLength(2000) description?: string;

    @IsString() @IsOptional() @MaxLength(120) customer_reference?: string;

    @IsNumberString({}, { message: 'qty must be a numeric string' })
    @IsOptional()
    qty?: string;

    @IsString() @IsOptional() @MaxLength(30) unit?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;

    @IsNumberString({}, { message: 'margin_pct must be a numeric string' })
    @IsOptional()
    margin_pct?: string;

    @IsArray()
    @IsOptional()
    product_rebates_snapshot?: Array<{
        rebate_id?: string | null;
        code?: string;
        name?: string;
        type?: string;
        pct: string;
    }>;

    @IsArray()
    @IsOptional()
    product_expenses_snapshot?: Array<{
        expense_id?: string | null;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    @IsString() @IsOptional() @MaxLength(15) hs_code?: string;

    @IsNumberString({}, { message: 'net_weight_kg must be a numeric string' })
    @IsOptional()
    net_weight_kg?: string;

    @IsNumberString({}, { message: 'gross_weight_kg must be a numeric string' })
    @IsOptional()
    gross_weight_kg?: string;

    @IsOptional() package_count?: number;

    @IsOptional() seq?: number;
}
