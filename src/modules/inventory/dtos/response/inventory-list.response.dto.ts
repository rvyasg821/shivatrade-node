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

    // The purchase currency this stock row is valued in (multi-currency
    // inventory). A product bought in two currencies yields two rows, one per
    // currency. All money fields below (avg_rate, closing_value) are NATIVE to
    // this currency — never converted to ₹.
    @ApiProperty()
    currency_code: string;

    // FIFO on-hand qty for this (product, currency) — the surviving receipt
    // layers of this currency after outward movements. The real "Qty in Stock"
    // for this currency slice; reads 0 once that slice is fully sold.
    @ApiProperty()
    on_hand: string;

    // Weighted-average surviving unit price in THIS currency (native/unit) —
    // closing_value ÷ closing_qty. Not converted to ₹.
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

    /**
     * closing_qty × avg_rate — the period-end valuation used for closing-stock
     * reconciliation. Deliberately NOT the same as the "Stock Value" figure,
     * which is `on_hand × avg_rate` (TODAY). With a To date set the two differ,
     * and it is this one the accountant needs.
     *
     * Not clamped at 0: a negative closing balance is a data problem the
     * reconciliation must surface, not hide.
     */
    @ApiProperty()
    closing_value: string;

    // Most recent receipt date across this product's POVs.
    @ApiProperty({ nullable: true })
    arrival_date: string | null;
}
