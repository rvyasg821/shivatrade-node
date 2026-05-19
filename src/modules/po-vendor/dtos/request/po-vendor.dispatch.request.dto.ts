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
 * One row per POV line — `dispatched_qty` capped at `ordered_qty`.
 * Backend enforces the cap; client validates client-side too.
 */
export class PoVendorDispatchLineDto {
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @IsNumberString({}, { message: 'dispatched_qty must be a numeric string' })
    @IsNotEmpty()
    dispatched_qty: string;
}

/**
 * Body for `POST /admin/po-vendor/:id/dispatch` (POV plan §10, §15.2).
 * Transitions POV draft → dispatched and freezes qty fields.
 */
export class PoVendorDispatchRequestDto {
    @IsDateString()
    @IsNotEmpty()
    dispatch_date: string;

    @IsDateString()
    @IsOptional()
    expected_arrival_date?: string;

    // ── Transport / tracking ────────────────────────────────────────────
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

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line is required.' })
    @ValidateNested({ each: true })
    @Type(() => PoVendorDispatchLineDto)
    lines: PoVendorDispatchLineDto[];
}
