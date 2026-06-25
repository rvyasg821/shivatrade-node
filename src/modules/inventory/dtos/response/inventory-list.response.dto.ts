import { ApiProperty } from '@nestjs/swagger';

/**
 * One stock-register row = one PRODUCT that has been received on ≥1
 * non-cancelled POV line (collapsed across all its receipts). Source POV/GRN
 * traceability lives in the per-product movement drawer. All numeric/date
 * values are returned as raw strings from the SQL — the FE formats them.
 */
export class InventoryListResponseDto {
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

    // Live ledger on-hand for this product (single pool: GRN-in − invoice-out).
    // The real "Qty in Stock" — reads 0 once the product is fully sold.
    @ApiProperty()
    on_hand: string;

    // Most recent receipt date across this product's POVs.
    @ApiProperty({ nullable: true })
    arrival_date: string | null;
}
