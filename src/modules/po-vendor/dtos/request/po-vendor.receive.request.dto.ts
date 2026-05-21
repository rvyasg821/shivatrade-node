import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
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
 * Transitions POV dispatched → closed. Follow-up POVs for remaining
 * qty are created manually from the parent PO (industry-standard
 * flat-siblings model — SAP / Tally / Zoho).
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

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorReceiveLineDto)
    lines: PoVendorReceiveLineDto[];
}
