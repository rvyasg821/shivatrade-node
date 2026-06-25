import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Single line assignment in a recover-from-PO batch.
 * vendor_id can differ from po_line.vendor_id — in that case the PO line's
 * vendor_id is updated to match (line is re-assigned).
 */
export class PoVendorRecoverAssignmentDto {
    @ApiProperty({ required: true, type: String })
    @IsString()
    @IsNotEmpty()
    purchase_order_line_id: string;

    @ApiProperty({ required: true, type: String })
    @IsString()
    @IsNotEmpty()
    vendor_id: string;
}

/**
 * Per-vendor expense pick (charge) attached to the spawned POV. Mirrors the
 * shape used by the quotation → SO generate flow.
 */
export class PoVendorRecoverExpensePickDto {
    @ApiProperty({ required: true, type: String })
    @IsUUID()
    @IsNotEmpty()
    expense_id: string;

    @ApiProperty({ required: false, enum: ['percent', 'fixed'] })
    @IsIn(['percent', 'fixed'])
    @IsOptional()
    type?: 'percent' | 'fixed';

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'value must be a numeric string' })
    @IsOptional()
    value?: string;
}

/**
 * Optional advance paid to a vendor, recorded against that vendor's spawned
 * POV at creation. Mirrors the Payments tab fields.
 */
export class PoVendorRecoverAdvanceDto {
    @ApiProperty({ required: false, type: String })
    @IsDateString()
    @IsOptional()
    payment_date?: string;

    @ApiProperty({ required: false, type: String })
    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsOptional()
    amount?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    invoice_number?: string;

    @ApiProperty({ required: false, type: String })
    @IsString()
    @IsOptional()
    notes?: string;
}

/**
 * Batch recover request — used by `POST /admin/po-vendor/recover/:poId`.
 * Groups assignments by vendor_id and spawns one POV per vendor in a
 * single logical operation.
 */
export class PoVendorRecoverRequestDto {
    @ApiProperty({ required: true, type: [PoVendorRecoverAssignmentDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PoVendorRecoverAssignmentDto)
    assignments: PoVendorRecoverAssignmentDto[];

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    delivery_address_id?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    delivery_address?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    internal_notes?: string;

    /** Optional per-vendor expense list applied to each spawned POV.
     *  Key = vendor_id (UUID), value = array of expense picks. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_expenses?: Record<string, PoVendorRecoverExpensePickDto[]>;

    /** Optional per-vendor advance paid, recorded on each spawned POV.
     *  Key = vendor_id (UUID). */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_advances?: Record<string, PoVendorRecoverAdvanceDto>;

    /** Per-vendor deliver-to location — ShivaTrade's receiving location (a
     *  Locations-master id) where that vendor's goods land. Becomes the
     *  spawned POV's `delivery_address_id`, which the GRN propagates to the
     *  stock ledger (`grn_in.location_id`) so on-hand is location-scoped.
     *  Key = vendor_id (UUID), value = location id. The UI fills it per
     *  vendor (auto-selected to the default location); the service falls
     *  back to the company default so a POV is never created location-less. */
    @ApiProperty({ required: false, type: Object })
    @IsObject()
    @IsOptional()
    vendor_delivery_locations?: Record<string, string>;
}
