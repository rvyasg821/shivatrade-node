import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * POV line — covers a single PO line by an `ordered_qty` quantity.
 * Backend validates `ordered_qty ≤ pending_qty` per PO line (POV plan §8).
 */
export class PoVendorLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    purchase_order_line_id: string;

    @IsNumberString({}, { message: 'ordered_qty must be a numeric string' })
    @IsNotEmpty()
    ordered_qty: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    seq?: number;
}

/**
 * Body for `POST /admin/po-vendor/from-po/:poId` (POV plan §10).
 * As of 2026-05-21 the PO no longer carries a header-level vendor;
 * vendor lives on the PO line. The client now passes `vendor_id`
 * explicitly so the POV knows which vendor it's procuring from.
 * Vendor address auto-resolves to the vendor's default if not provided.
 */
export class PoVendorCreateRequestDto {
    /** Vendor for this POV. Required — POs are multi-vendor at line level. */
    @IsUUID()
    @IsNotEmpty()
    vendor_id: string;

    /** Optional vendor address; defaults to the vendor's default bill-from. */
    @IsUUID()
    @IsOptional()
    vendor_address_id?: string;

    /** Free-text snapshot override. Wins over `delivery_address_id`
     *  and the inherited PO snapshot when filled. */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    delivery_address?: string;

    /** Pick a company_addresses._id; server snapshots text. Wins over
     *  inherited PO snapshot when filled and `delivery_address` text
     *  is not. */
    @IsUUID()
    @IsOptional()
    delivery_address_id?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorLineCreateDto)
    lines: PoVendorLineCreateDto[];
}
