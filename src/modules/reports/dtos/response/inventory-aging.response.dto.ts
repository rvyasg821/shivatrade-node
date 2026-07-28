import { ApiProperty } from '@nestjs/swagger';

/**
 * One product's inventory-aging figures, as of a snapshot date.
 *
 * The current on-hand qty is FIFO-attributed to its GRN receipt cohorts; any
 * unit whose receipt is older than `aging_days` counts as AGED (slow-moving).
 * Value = qty × the product's weighted-average vendor cost (INR). `undated_qty`
 * is opening / non-GRN stock with no receipt date — treated as oldest (always
 * aged), folded into aged_qty and surfaced separately.
 */
export class InventoryAgingRowDto {
    @ApiProperty() product_id: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty() product_name: string;
    @ApiProperty({ required: false }) category_name?: string;

    @ApiProperty() closing_qty: number;
    @ApiProperty() closing_value_inr: number;
    @ApiProperty() unit_cost: number;

    @ApiProperty() aged_qty: number;
    @ApiProperty() aged_value_inr: number;
    @ApiProperty() aged_pct: number;
    @ApiProperty() undated_qty: number;

    /** Age (days) of the oldest dated on-hand cohort. Null when only undated
     *  stock remains (no receipt date to age from). */
    @ApiProperty({ required: false, nullable: true })
    oldest_days: number | null;
}

export class InventoryAgingTotalsDto {
    @ApiProperty() product_count: number;
    @ApiProperty() closing_qty: number;
    @ApiProperty() closing_value_inr: number;
    @ApiProperty() aged_qty: number;
    @ApiProperty() aged_value_inr: number;
    @ApiProperty() aged_pct: number;
    @ApiProperty() undated_qty: number;
}

export class InventoryAgingPaginationDto {
    @ApiProperty() total: number;
    @ApiProperty() perPage: number;
    @ApiProperty() orderBy: string;
}

export class InventoryAgingResponseDto {
    @ApiProperty() as_of_label: string;
    @ApiProperty() aging_days: number;
    @ApiProperty({ type: [InventoryAgingRowDto] })
    rows: InventoryAgingRowDto[];
    @ApiProperty({ type: InventoryAgingTotalsDto })
    totals: InventoryAgingTotalsDto;
    @ApiProperty() currency: string;
    @ApiProperty({ type: InventoryAgingPaginationDto })
    pagination: InventoryAgingPaginationDto;
}
