import { ApiProperty } from '@nestjs/swagger';

/**
 * One stock-register row = one non-cancelled POV line with QC-accepted qty
 * from confirmed GRNs (> 0), including partial receipts on still-open POVs.
 * All numeric/date values are returned as raw strings from the SQL join —
 * the FE formats for display.
 */
export class InventoryListResponseDto {
    @ApiProperty()
    pov_line_id: string;

    @ApiProperty()
    product_id: string;

    @ApiProperty()
    product_code: string;

    @ApiProperty()
    product_name: string;

    @ApiProperty({ nullable: true })
    category_name: string | null;

    @ApiProperty({ nullable: true })
    uom: string | null;

    @ApiProperty()
    po_id: string;

    @ApiProperty()
    po_voucher_no: string;

    @ApiProperty()
    pov_id: string;

    @ApiProperty()
    pov_voucher_no: string;

    @ApiProperty()
    vendor_name: string;

    // Raw received qty (Σ received across confirmed GRNs) — kept for reference.
    @ApiProperty()
    received_qty: string;

    // On-hand stock = QC-accepted qty from confirmed GRNs (rejected excluded).
    @ApiProperty()
    accepted_qty: string;

    @ApiProperty()
    rejected_qty: string;

    // Live ledger on-hand for this product (single pool: GRN-in − invoice-out).
    // The real "Qty in Stock" — reads 0 once the product is fully sold.
    @ApiProperty()
    on_hand: string;

    @ApiProperty({ nullable: true })
    arrival_date: string | null;
}
