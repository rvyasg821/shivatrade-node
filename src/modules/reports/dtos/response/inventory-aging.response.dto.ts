import { ApiProperty } from '@nestjs/swagger';

/** One age bucket's qty + value (INR at weighted-avg vendor cost). */
export class InventoryAgingBucketDto {
    @ApiProperty() key: string;
    @ApiProperty() label: string;
    @ApiProperty() qty: number;
    @ApiProperty() value: number;
}

/**
 * One product's inventory-aging figures, as of a snapshot date.
 *
 * The current on-hand qty is FIFO-attributed to its GRN receipt cohorts and
 * split into fixed age buckets — 0-30 / 31-60 / 61-90 / 91-120 / >120 days —
 * each with qty + value (qty × weighted-average vendor cost, INR). `undated_qty`
 * is opening / non-GRN stock with no receipt date — folded into the oldest
 * (>120) bucket and surfaced separately.
 */
export class InventoryAgingRowDto {
    @ApiProperty() product_id: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty() product_name: string;
    @ApiProperty({ required: false }) category_name?: string;

    @ApiProperty() closing_qty: number;
    @ApiProperty() closing_value_inr: number;
    @ApiProperty() unit_cost: number;
    @ApiProperty() undated_qty: number;

    @ApiProperty({ type: [InventoryAgingBucketDto] })
    buckets: InventoryAgingBucketDto[];
}

export class InventoryAgingTotalsDto {
    @ApiProperty() product_count: number;
    @ApiProperty() closing_qty: number;
    @ApiProperty() closing_value_inr: number;
    @ApiProperty() undated_qty: number;
    @ApiProperty({ type: [InventoryAgingBucketDto] })
    buckets: InventoryAgingBucketDto[];
}

export class InventoryAgingPaginationDto {
    @ApiProperty() total: number;
    @ApiProperty() perPage: number;
    @ApiProperty() orderBy: string;
}

export class InventoryAgingResponseDto {
    @ApiProperty() as_of_label: string;
    @ApiProperty({ type: [InventoryAgingRowDto] })
    rows: InventoryAgingRowDto[];
    @ApiProperty({ type: InventoryAgingTotalsDto })
    totals: InventoryAgingTotalsDto;
    @ApiProperty() currency: string;
    @ApiProperty({ type: InventoryAgingPaginationDto })
    pagination: InventoryAgingPaginationDto;
}
