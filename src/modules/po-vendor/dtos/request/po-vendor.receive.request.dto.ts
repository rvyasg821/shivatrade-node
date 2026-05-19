import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';

/**
 * One row per POV line — `received_qty` capped at `dispatched_qty`.
 * `short_qty = dispatched − received` is always treated as loss
 * (POV plan §19.6 — informational only, no user choice).
 */
export class PoVendorReceiveLineDto {
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @IsNumberString({}, { message: 'received_qty must be a numeric string' })
    @IsNotEmpty()
    received_qty: string;
}

/**
 * Body for `POST /admin/po-vendor/:id/receive` (POV plan §10, §15.3).
 * Transitions POV dispatched → closed. If `spawn_remainder = true` and
 * any line has `undispatched_qty > 0`, backend creates a child POV in
 * the same flow with `parent_po_vendor_id = current` and per-line
 * `ordered_qty = parent.undispatched_qty`.
 */
export class PoVendorReceiveRequestDto {
    @IsDateString()
    @IsNotEmpty()
    actual_arrival_date: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    /** Explicit user choice — backend never decides on its own (POV plan §10). */
    @IsBoolean()
    @IsNotEmpty()
    spawn_remainder: boolean;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorReceiveLineDto)
    lines: PoVendorReceiveLineDto[];
}
