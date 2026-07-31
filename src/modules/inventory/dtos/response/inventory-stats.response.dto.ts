import { ApiProperty } from '@nestjs/swagger';

/**
 * One currency's slice of the current stock valuation. Multi-currency stock
 * can NEVER be summed into a single number — the KPI is a per-currency list
 * (USD stock, EUR stock, INR stock…), each valued natively.
 */
export class InventoryCurrencyValueDto {
    @ApiProperty()
    currency_code: string;

    // FIFO on-hand valuation in THIS currency (native): Σ surviving layer
    // (qty × native unit price). Returned as a raw string — the FE formats it.
    @ApiProperty()
    stock_value: string;

    // Distinct products holding stock in this currency.
    @ApiProperty()
    product_count: number;
}

/**
 * KPI aggregates for the inventory listing header cards. Computed over the
 * same filtered set as the list (location / category / vendor / date / search).
 * Stock value is per-currency (never summed) — see the plan's "can't sum
 * currencies" rule.
 */
export class InventoryStatsResponseDto {
    // Per-currency stock valuation. One entry per purchase currency present in
    // the filtered set. The FE renders these stacked (USD … / EUR … / INR …).
    @ApiProperty({ type: [InventoryCurrencyValueDto] })
    by_currency: InventoryCurrencyValueDto[];

    // Distinct products (SKUs) currently in stock, across all currencies.
    @ApiProperty()
    product_count: number;

    // Distinct vendors supplying the current stock.
    @ApiProperty()
    vendor_count: number;
}
