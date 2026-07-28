import { ApiProperty } from '@nestjs/swagger';

/**
 * One product's stock-turnover figures over the period.
 *
 * All money is INR. `unit_cost` is the product's weighted-average vendor cost
 * from its GRN receipts (Σ accepted_qty × POV unit_price ÷ Σ accepted_qty).
 * Inventory value and COGS are both valued at that cost so the ratio is fair.
 *
 *   turnover_ratio = cogs_inr ÷ avg_inventory_value_inr   (null when no stock)
 *   dio_days       = period_days ÷ turnover_ratio          (days stock sits)
 */
export class StockTurnoverRowDto {
    @ApiProperty() product_id: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty() product_name: string;
    @ApiProperty({ required: false }) category_name?: string;

    @ApiProperty() opening_qty: number;
    @ApiProperty() closing_qty: number;
    @ApiProperty() avg_qty: number;

    @ApiProperty() unit_cost: number;
    @ApiProperty() avg_inventory_value_inr: number;

    @ApiProperty() qty_sold: number;
    @ApiProperty() cogs_inr: number;

    /** null when average inventory value is 0 (turnover undefined). */
    @ApiProperty({ required: false, nullable: true })
    turnover_ratio: number | null;

    /** null when the ratio is 0 / undefined. */
    @ApiProperty({ required: false, nullable: true })
    dio_days: number | null;
}

export class StockTurnoverTotalsDto {
    @ApiProperty() product_count: number;
    @ApiProperty() qty_sold: number;
    @ApiProperty() avg_inventory_value_inr: number;
    @ApiProperty() cogs_inr: number;
    @ApiProperty({ required: false, nullable: true })
    turnover_ratio: number | null;
    @ApiProperty({ required: false, nullable: true })
    dio_days: number | null;
}

export class StockTurnoverPaginationDto {
    @ApiProperty() total: number;
    @ApiProperty() perPage: number;
    @ApiProperty() orderBy: string;
}

export class StockTurnoverResponseDto {
    @ApiProperty() period_label: string;
    @ApiProperty() period_days: number;
    @ApiProperty({ type: [StockTurnoverRowDto] })
    rows: StockTurnoverRowDto[];
    @ApiProperty({ type: StockTurnoverTotalsDto })
    totals: StockTurnoverTotalsDto;
    @ApiProperty() currency: string;
    @ApiProperty({ type: StockTurnoverPaginationDto })
    pagination: StockTurnoverPaginationDto;
}
