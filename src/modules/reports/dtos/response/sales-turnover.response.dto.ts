import { ApiProperty } from '@nestjs/swagger';

/**
 * One bucket of the Sales Turnover report — a month or a customer, WITHIN a
 * single currency section. All figures are NATIVE (the invoice's own currency)
 * — never summed across currencies (see SALES_TURNOVER_REPORT_PLAN §5, §12.1).
 */
export class SalesTurnoverRowDto {
    /** '2026-07' in month mode; the customer uuid in customer mode. */
    @ApiProperty({ type: String }) key: string;
    /** 'Jul 2026' | 'Acme Corporation'. */
    @ApiProperty({ type: String }) label: string;
    @ApiProperty({ type: Number }) invoice_count: number;
    /** Σ grand_total (native). */
    @ApiProperty({ type: Number }) sales_value: number;
    /** Σ non-voided InvoicePayments (native). */
    @ApiProperty({ type: Number }) received: number;
    /** sales_value − received. Negative = overpaid (legitimate). */
    @ApiProperty({ type: Number }) outstanding: number;
}

export class SalesTurnoverGroupTotalsDto {
    @ApiProperty({ type: Number }) invoice_count: number;
    @ApiProperty({ type: Number }) sales_value: number;
    @ApiProperty({ type: Number }) received: number;
    @ApiProperty({ type: Number }) outstanding: number;
}

/** One currency section — a table + its own subtotal. The report is a stack of these. */
export class CurrencyGroupDto {
    /** 'USD' | 'EUR' | 'INR'. */
    @ApiProperty({ type: String }) currency: string;
    /** '$' | '€' | '₹' — from invoice.currency_symbol; may be null. */
    @ApiProperty({ type: String, nullable: true }) currency_symbol: string | null;
    /** Month mode fills every month in the range; customer mode never invents rows. */
    @ApiProperty({ type: [SalesTurnoverRowDto] }) rows: SalesTurnoverRowDto[];
    /** Across this currency's whole filtered set. */
    @ApiProperty({ type: SalesTurnoverGroupTotalsDto })
    totals: SalesTurnoverGroupTotalsDto;
}

export class SalesTurnoverResponseDto {
    /** e.g. "01-04-2026 → 18-07-2026" */
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: String }) group_by: 'month' | 'customer';
    /** One section per currency (native, never summed across). INR first, then alpha. */
    @ApiProperty({ type: [CurrencyGroupDto] }) groups: CurrencyGroupDto[];
    /** Every currency present in range — populates the frontend dropdown. */
    @ApiProperty({ type: [String] }) available_currencies: string[];
    /**
     * The one cross-currency figure that IS safe — a count, not money. There is
     * deliberately NO root-level money total (§12.1).
     */
    @ApiProperty({ type: Number }) overall_invoice_count: number;
}
