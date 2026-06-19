import { ApiProperty } from '@nestjs/swagger';

/**
 * One uncovered PO line in the recover-preview response.
 */
export class PoVendorRecoverPreviewLineDto {
    @ApiProperty({ required: true, type: String })
    purchase_order_line_id: string;

    @ApiProperty({ required: false, type: String })
    product_id?: string;

    @ApiProperty({ required: false, type: String })
    product_name?: string;

    @ApiProperty({ required: false, type: String })
    product_code?: string;

    @ApiProperty({ required: false, type: String })
    hsn_code?: string;

    @ApiProperty({ required: false, type: String })
    unit?: string;

    /** Total PO line qty. */
    @ApiProperty({ required: true, type: String })
    ordered_qty: string;

    /** Qty still uncovered (= eligible for a new POV). */
    @ApiProperty({ required: true, type: String })
    pending_qty: string;

    /** True when pending_qty <= 0 — line should be hidden / skipped. */
    @ApiProperty({ required: true, type: Boolean })
    fully_covered: boolean;

    /** Current vendor on the PO line — default suggestion for the dropdown. */
    @ApiProperty({ required: false, type: String })
    current_vendor_id?: string;

    @ApiProperty({ required: false, type: String })
    current_vendor_name?: string;

    /** Price-list candidate vendors for this product, cheapest-first. Lets the
     *  Generate-POV modal show ₹ rates + a "Cheapest" pick. */
    @ApiProperty({ required: false, type: Array })
    candidate_vendors?: Array<{
        vendor_id: string;
        vendor_name: string;
        unit_price: string;
    }>;

    /** Pre-selected vendor: the line's current vendor, else cheapest candidate. */
    @ApiProperty({ required: false, type: String })
    suggested_vendor_id?: string;
}

export class PoVendorRecoverPreviewVendorDto {
    @ApiProperty({ required: true, type: String })
    vendor_id: string;

    @ApiProperty({ required: true, type: String })
    vendor_name: string;
}

export class PoVendorRecoverPreviewResponseDto {
    @ApiProperty({ required: true, type: String })
    purchase_order_id: string;

    @ApiProperty({ required: false, type: String })
    purchase_order_voucher_no?: string;

    @ApiProperty({ required: false, type: String })
    status?: string;

    @ApiProperty({
        required: true,
        type: [PoVendorRecoverPreviewLineDto],
    })
    lines: PoVendorRecoverPreviewLineDto[];

    /** All active vendors in the company — used to populate the per-line
     *  vendor dropdown. Operator can pick any vendor; if different from
     *  current_vendor_id, the PO line gets re-assigned on submit. */
    @ApiProperty({
        required: true,
        type: [PoVendorRecoverPreviewVendorDto],
    })
    active_vendors: PoVendorRecoverPreviewVendorDto[];
}
