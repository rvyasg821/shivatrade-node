import { ApiProperty } from '@nestjs/swagger';

/**
 * One received-goods register row = one POV line that has been received
 * (pov.status='closed', received_qty > 0). All numeric/date values are
 * returned as raw strings from the SQL join — the FE formats for display.
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

    @ApiProperty()
    received_qty: string;

    @ApiProperty({ nullable: true })
    arrival_date: string | null;
}
