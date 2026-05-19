import { ApiProperty } from '@nestjs/swagger';
import { ENUM_PO_VENDOR_STATUS } from '../../enums/po-vendor.enum';

export class PoVendorLineResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) purchase_order_line_id: string;
    @ApiProperty({ required: true, type: String }) product_id: string;
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: false, type: String }) unit?: string;
    @ApiProperty({ required: true, type: String }) tax_pct: string;
    @ApiProperty({ required: true, type: String }) unit_price: string;
    @ApiProperty({ required: true, type: String }) ordered_qty: string;
    @ApiProperty({ required: true, type: String }) dispatched_qty: string;
    @ApiProperty({ required: true, type: String }) received_qty: string;
    /** Derived: ordered_qty − dispatched_qty (recoverable). */
    @ApiProperty({ required: true, type: String }) undispatched_qty: string;
    /** Derived: dispatched_qty − received_qty (loss). */
    @ApiProperty({ required: true, type: String }) short_qty: string;
    @ApiProperty({ required: true, type: String }) line_total: string;
    @ApiProperty({ required: true, type: Number }) seq: number;
}

export class PoVendorGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) voucher_no: string;

    @ApiProperty({ required: true, type: String }) purchase_order_id: string;
    @ApiProperty({ required: false, type: String }) purchase_order_voucher_no?: string;

    @ApiProperty({ required: false, type: String }) parent_po_vendor_id?: string;
    @ApiProperty({ required: false, type: String }) parent_po_vendor_voucher_no?: string;

    @ApiProperty({ required: true, type: String }) vendor_id: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_email?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_phone?: string;
    @ApiProperty({ required: false, type: String }) vendor_address_id?: string;

    @ApiProperty({ required: false, type: String }) dispatch_date?: string;
    @ApiProperty({ required: false, type: String }) expected_arrival_date?: string;
    @ApiProperty({ required: false, type: String }) actual_arrival_date?: string;

    @ApiProperty({ required: false, type: String }) transporter_name?: string;
    @ApiProperty({ required: false, type: String }) vehicle_no?: string;
    @ApiProperty({ required: false, type: String }) lr_no?: string;
    @ApiProperty({ required: false, type: String }) lr_date?: string;
    @ApiProperty({ required: false, type: String }) eway_bill_no?: string;
    @ApiProperty({ required: false, type: String }) eway_bill_date?: string;

    @ApiProperty({ required: true, type: String }) delivery_address: string;
    @ApiProperty({ required: false, type: String }) notes?: string;
    @ApiProperty({ required: false, type: String }) internal_notes?: string;

    @ApiProperty({ enum: ENUM_PO_VENDOR_STATUS, required: true })
    status: ENUM_PO_VENDOR_STATUS;

    @ApiProperty({ required: false, type: String }) created_by?: string;
    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
    @ApiProperty({ required: false, type: Date }) updatedAt?: Date;

    @ApiProperty({ required: true, type: [PoVendorLineResponseDto] })
    lines: PoVendorLineResponseDto[];
}
