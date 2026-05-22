import { Type, Transform } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
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
import { ENUM_PURCHASE_ORDER_STATUS } from '../../enums/purchase-order.enum';

export class PurchaseOrderLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsUUID()
    @IsOptional()
    source_quotation_line_id?: string;

    @IsUUID()
    @IsOptional()
    source_pfi_line_id?: string;

    /** Planned vendor for this line. PO is multi-vendor at line level. */
    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @IsOptional()
    @MaxLength(15)
    hsn_code?: string;

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

    @IsInt()
    @Min(0)
    @IsOptional()
    seq?: number;
}

export class PurchaseOrderCreateRequestDto {
    /** Legacy header-level vendor. Kept optional for back-compat; new POs
     *  leave this null and store vendor per line instead. */
    @IsUUID()
    @IsOptional()
    vendor_id?: string;

    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    @IsUUID()
    @IsOptional()
    customer_id?: string;

    @IsUUID()
    @IsOptional()
    quotation_id?: string;

    @IsUUID()
    @IsOptional()
    pfi_id?: string;

    @IsDateString()
    @IsNotEmpty()
    po_date: string;

    @IsDateString()
    @IsOptional()
    expected_delivery_date?: string;

    /** Free-text snapshot. Optional — if omitted, server resolves from
     *  `delivery_address_id` (preferred) or rejects. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Preferred: pick a company_addresses._id; server snapshots text. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

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
    @MaxLength(2000)
    notes_to_vendor?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsString()
    @IsOptional()
    @Matches(/^[A-Z]{3}$/, {
        message: 'currency_code must be 3 uppercase letters (e.g. INR)',
    })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value
    )
    currency_code?: string;

    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;

    @IsEnum(ENUM_PURCHASE_ORDER_STATUS)
    @IsOptional()
    status?: ENUM_PURCHASE_ORDER_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderLineCreateDto)
    @IsOptional()
    lines?: PurchaseOrderLineCreateDto[];
}
