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

    // Grand total across ALL currencies, in INR — each row already used its
    // own receipt-time exchange rate, so this sum is legitimate (unlike
    // summing native by_currency values, which is never valid).
    @ApiProperty()
    stock_value_inr: string;

    // Distinct products (SKUs) currently in stock, across all currencies.
    @ApiProperty()
    product_count: number;

    // Distinct vendors supplying the current stock.
    @ApiProperty()
    vendor_count: number;
}
