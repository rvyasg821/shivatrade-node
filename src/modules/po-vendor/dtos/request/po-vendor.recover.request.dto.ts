import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
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
}
