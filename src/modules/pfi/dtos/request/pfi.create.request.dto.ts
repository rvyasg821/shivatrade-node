import { Type, Transform } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ENUM_PFI_STATUS } from '../../enums/pfi.enum';

export class PfiLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    /** Internal-only: stamped by createFromQuotation; never set from FE. */
    @IsUUID()
    @IsOptional()
    source_quotation_line_id?: string;

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

    // ── Export-document line fields (Phase 2) ──
    @IsString()
    @IsOptional()
    @MaxLength(15)
    hs_code?: string;

    @IsNumberString({}, { message: 'net_weight_kg must be a numeric string' })
    @IsOptional()
    net_weight_kg?: string;

    @IsNumberString({}, { message: 'gross_weight_kg must be a numeric string' })
    @IsOptional()
    gross_weight_kg?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    package_count?: number;
}

export class PfiCreateRequestDto {
    @IsUUID()
    @IsOptional()
    quotation_id?: string;

    @IsUUID()
    @IsOptional()
    lead_id?: string;

    @IsUUID()
    @IsNotEmpty()
    customer_id: string;

    @IsUUID()
    @IsOptional()
    customer_address_id?: string;

    @IsDateString()
    @IsNotEmpty()
    pfi_date: string;

    @IsDateString()
    @IsOptional()
    valid_until?: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^[A-Z]{3}$/, {
        message: 'currency_code must be 3 uppercase letters (e.g. INR)',
    })
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

    @IsBoolean()
    @IsOptional()
    skip_product_costing?: boolean;

    @IsEnum(ENUM_PFI_STATUS)
    @IsOptional()
    status?: ENUM_PFI_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PfiLineCreateDto)
    @IsOptional()
    lines?: PfiLineCreateDto[];

    // ── Consignee ──
    @IsString()
    @IsOptional()
    @MaxLength(200)
    consignee_name?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    consignee_address?: string;

    // ── Shipping ──
    // Free-text ports kept for backward write compatibility; new clients
    // should send *_id + *_snapshot below (port_master FK pattern).
    @IsString()
    @IsOptional()
    @MaxLength(150)
    port_of_loading?: string;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    port_of_discharge?: string;

    @IsUUID()
    @IsOptional()
    port_of_loading_id?: string;

    @IsOptional()
    port_of_loading_snapshot?: any;

    @IsUUID()
    @IsOptional()
    port_of_discharge_id?: string;

    @IsOptional()
    port_of_discharge_snapshot?: any;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    final_destination?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    country_of_origin?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    country_of_final_destination?: string;

    @IsIn(['sea', 'air', 'road'])
    @IsOptional()
    mode_of_shipment?: 'sea' | 'air' | 'road';

    @IsString()
    @IsOptional()
    @MaxLength(200)
    container_details?: string;

    @IsDateString()
    @IsOptional()
    est_shipment_date?: string;

    @IsDateString()
    @IsOptional()
    est_delivery_date?: string;

    // ── Packing ──
    @IsString()
    @IsOptional()
    @MaxLength(200)
    packing_marks?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    packing_type?: string;

    // ── Bank + commercial defaults ──
    @IsUUID()
    @IsOptional()
    bank_account_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    payment_terms_text?: string;

    @IsString()
    @IsOptional()
    @MaxLength(4000)
    declaration_text?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    validity_days?: number;
}
