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
 * Vendor, vendor_address, and product/HSN/unit/price snapshots are all
 * taken from the source PO server-side — no client input for those.
 */
export class PoVendorCreateRequestDto {
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
