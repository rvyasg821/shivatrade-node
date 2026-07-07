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

    // Weighted-average received unit price (₹/unit) across this product's POV
    // lines — same cost basis as the Stock Value card.
    @ApiProperty()
    avg_rate: string;

    // Stock-summary figures over the Received From/To period (movement date):
    //   opening = balance before From, inward = IN during, outward = OUT during,
    //   closing = balance up to To (= on_hand when no To). Closing = Opening +
    //   Inward − Outward.
    @ApiProperty()
    opening_qty: string;

    @ApiProperty()
    inward_qty: string;

    @ApiProperty()
    outward_qty: string;

    @ApiProperty()
    closing_qty: string;

    // Most recent receipt date across this product's POVs.
    @ApiProperty({ nullable: true })
    arrival_date: string | null;
}
