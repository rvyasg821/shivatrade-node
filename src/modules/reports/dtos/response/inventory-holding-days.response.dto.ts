import { ApiProperty } from '@nestjs/swagger';

/**
 * One product's inventory-holding-days figures.
 *
 * FIFO cohort matching: each sold unit (issued invoice, in range) is matched to
 * the oldest available GRN receipt; the receipt→sale gap in days is averaged,
 * weighted by matched qty. `unmatched_qty` is sold quantity with no receipt on
 * record (e.g. opening stock) — excluded from the average, surfaced separately.
 */
export class InventoryHoldingDaysRowDto {
    @ApiProperty() product_id: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty() product_name: string;
    @ApiProperty({ required: false }) category_name?: string;

    @ApiProperty() qty_sold_matched: number;
    @ApiProperty() avg_holding_days: number;
    @ApiProperty() min_holding_days: number;
    @ApiProperty() max_holding_days: number;
    @ApiProperty({ required: false }) first_sale_date?: string;
    @ApiProperty({ required: false }) last_sale_date?: string;
    @ApiProperty() unmatched_qty: number;
}

export class InventoryHoldingDaysTotalsDto {
    @ApiProperty() product_count: number;
    @ApiProperty() qty_sold_matched: number;
    /** Qty-weighted average across every matched unit. Null when nothing matched. */
    @ApiProperty({ required: false, nullable: true })
    avg_holding_days: number | null;
    @ApiProperty() unmatched_qty: number;
}

export class InventoryHoldingDaysPaginationDto {
    @ApiProperty() total: number;
    @ApiProperty() perPage: number;
    @ApiProperty() orderBy: string;
}

export class InventoryHoldingDaysResponseDto {
    @ApiProperty() period_label: string;
    @ApiProperty({ type: [InventoryHoldingDaysRowDto] })
    rows: InventoryHoldingDaysRowDto[];
    @ApiProperty({ type: InventoryHoldingDaysTotalsDto })
    totals: InventoryHoldingDaysTotalsDto;
    @ApiProperty({ type: InventoryHoldingDaysPaginationDto })
    pagination: InventoryHoldingDaysPaginationDto;
}
