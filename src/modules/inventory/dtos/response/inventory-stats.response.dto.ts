import { ApiProperty } from '@nestjs/swagger';

/**
 * KPI aggregates for the inventory listing header cards. Computed over the
 * same filtered set as the list (location / category / vendor / date / search).
 */
export class InventoryStatsResponseDto {
    // Σ(received_qty × unit_price), INR. Goods-inward valuation (received &
    // accepted), returned as a raw string — the FE formats for display.
    @ApiProperty()
    stock_value: string;

    // Number of receipt lines (matches the list pagination total).
    @ApiProperty()
    line_count: number;

    // Distinct products (SKUs) currently in stock.
    @ApiProperty()
    product_count: number;

    // Distinct vendors supplying the current stock.
    @ApiProperty()
    vendor_count: number;
}
