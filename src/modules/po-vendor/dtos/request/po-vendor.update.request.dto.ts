import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ENUM_PO_VENDOR_STATUS } from '../../enums/po-vendor.enum';
import { PoVendorExpenseInputDto } from './po-vendor.create.request.dto';

/**
 * Per-line update payload. Editable fields depend on POV status
 * (POV plan §11). The service is the source of truth for the edit lock —
 * the DTO simply accepts everything and the service rejects what
 * cannot change at the current status.
 */
export class PoVendorLineUpdateDto {
    /** Existing POV line id when editing; omit to add a new line (draft only). */
    @IsUUID()
    @IsOptional()
    _id?: string;

    /** Required when adding a line (draft only). */
    @IsUUID()
    @IsOptional()
    purchase_order_line_id?: string;

    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsOptional()
    ordered_qty?: string;
}

export class PoVendorUpdateRequestDto {
    // ── Editable in DRAFT only ──────────────────────────────────────────
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Location id (or legacy company_address id) to re-snapshot from. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineUpdateDto)
    @IsOptional()
    lines?: PoVendorLineUpdateDto[];

    // ── Editable in DRAFT + DISPATCHED ──────────────────────────────────
    @IsDateString()
    @IsOptional()
    expected_arrival_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    transporter_name?: string;

    @IsString()
    @IsOptional()
    @MaxLength(40)
    vehicle_no?: string;

    @IsString()
    @IsOptional()
    @MaxLength(60)
    lr_no?: string;

    @IsDateString()
    @IsOptional()
    lr_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(40)
    eway_bill_no?: string;

    @IsDateString()
    @IsOptional()
    eway_bill_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    // ── Always editable ─────────────────────────────────────────────────
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    /** Replace the vendor-charges list. When provided, fully overrides
     *  the existing snapshot — the service resolves master fields and
     *  recomputes amounts. Editable only while POV is in `draft`. */
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PoVendorExpenseInputDto)
    expenses?: PoVendorExpenseInputDto[];

    // ── Status transitions (service enforces transition map) ────────────
    @IsEnum(ENUM_PO_VENDOR_STATUS)
    @IsOptional()
    status?: ENUM_PO_VENDOR_STATUS;
}
