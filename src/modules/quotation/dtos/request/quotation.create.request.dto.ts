import { Type, Transform } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ENUM_QUOTATION_STATUS } from '../../enums/quotation.enum';

export class QuotationLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    customer_reference?: string;

    @IsNumberString({}, { message: 'qty must be a numeric string' })
    @IsNotEmpty()
    qty: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    unit?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsNotEmpty()
    unit_price: string;

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
        type: string;
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

    // ── Export / Shipping (mirrors PFI). Optional on quote — moves into
    //   the PFI line later. ──

    @IsString()
    @IsOptional()
    @MaxLength(15)
    hs_code?: string;

    @IsNumberString(
        {},
        { message: 'net_weight_kg must be a numeric string' }
    )
    @IsOptional()
    net_weight_kg?: string;

    @IsNumberString(
        {},
        { message: 'gross_weight_kg must be a numeric string' }
    )
    @IsOptional()
    gross_weight_kg?: string;

    @IsOptional()
    package_count?: number;
}

export class QuotationCreateRequestDto {
    @IsUUID()
    @IsOptional()
    lead_id?: string;

    /** Required UNLESS lead_id is provided - service will auto-resolve a
     *  customer from the lead in that case. */
    @IsUUID()
    @IsOptional()
    customer_id?: string;

    @IsUUID()
    @IsOptional()
    customer_address_id?: string;

    @IsDateString()
    @IsNotEmpty()
    quotation_date: string;

    @IsDateString()
    @IsOptional()
    valid_until?: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^[A-Z]{3}$/, { message: 'currency_code must be 3 uppercase letters (e.g. INR)' })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value
    )
    currency_code: string;

    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    delivery_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    delivery_location?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes_to_client?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsNumberString({}, { message: 'margin_pct must be a numeric string' })
    @IsOptional()
    margin_pct?: string;

    /** When true, recompute zeros out per-product rebates/expenses - apply
     *  rebates and expenses ONLY at quotation level for this quote. */
    @IsOptional()
    skip_product_costing?: boolean;

    @IsEnum(ENUM_QUOTATION_STATUS)
    @IsOptional()
    status?: ENUM_QUOTATION_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuotationLineCreateDto)
    @IsOptional()
    lines?: QuotationLineCreateDto[];
}
