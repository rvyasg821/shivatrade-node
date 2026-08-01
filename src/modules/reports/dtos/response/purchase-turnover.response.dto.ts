import { ApiProperty } from '@nestjs/swagger';

/**
 * One bucket of the Purchase Turnover report — a month or a vendor, WITHIN a
 * single currency section. All figures are NATIVE (the POV's own currency) —
 * never summed across currencies. A Vendor PO is priced in the vendor's own
 * currency (D-6: inventory/purchases are per-currency native, the POV→INR rate
 * was retired), so USD, EUR and INR purchases live in separate sections.
 */
export class PurchaseTurnoverRowDto {
    /** '2026-07' in month mode; the vendor uuid in vendor mode. */
    @ApiProperty({ type: String }) key: string;
    /** 'Jul 2026' | 'Aarti Chemson Private Limited'. */
    @ApiProperty({ type: String }) label: string;
    @ApiProperty({ type: Number }) pov_count: number;

    /** Goods + vendor charges, pre-GST (= order_value − gst), native. */
    @ApiProperty({ type: Number }) taxable: number;
    /** Input GST on the purchase (goods + per-charge GST), native. Non-zero
     *  only for INR (domestic) POVs — GST never applies to a foreign POV. */
    @ApiProperty({ type: Number }) gst: number;
    /** What the vendor billed — lines + charges + GST, native. */
    @ApiProperty({ type: Number }) order_value: number;
    /** Σ non-voided vendor payments, GROSS (before TDS), native. */
    @ApiProperty({ type: Number }) paid: number;
    /** order_value − paid. Negative = the vendor was overpaid (legitimate). */
    @ApiProperty({ type: Number }) outstanding: number;
}

export class PurchaseTurnoverGroupTotalsDto {
    @ApiProperty({ type: Number }) pov_count: number;
    @ApiProperty({ type: Number }) taxable: number;
    @ApiProperty({ type: Number }) gst: number;
    @ApiProperty({ type: Number }) order_value: number;
    @ApiProperty({ type: Number }) paid: number;
    @ApiProperty({ type: Number }) outstanding: number;
}

/** One currency section — a table + its own subtotal. The report is a stack of these. */
export class PurchaseCurrencyGroupDto {
    /** 'USD' | 'EUR' | 'INR'. */
    @ApiProperty({ type: String }) currency: string;
    /** '$' | '€' | '₹' — from the POV's currency; may be null. */
    @ApiProperty({ type: String, nullable: true }) currency_symbol: string | null;
    /** Month mode fills every month in the range; vendor mode never invents rows. */
    @ApiProperty({ type: [PurchaseTurnoverRowDto] }) rows: PurchaseTurnoverRowDto[];
    /** Across this currency's whole filtered set. */
    @ApiProperty({ type: PurchaseTurnoverGroupTotalsDto })
    totals: PurchaseTurnoverGroupTotalsDto;
}

export class PurchaseTurnoverResponseDto {
    /** e.g. "01-04-2026 → 17-07-2026" */
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: String }) group_by: 'month' | 'vendor';
    /** One section per currency (native, never summed across). INR first, then alpha. */
    @ApiProperty({ type: [PurchaseCurrencyGroupDto] })
    groups: PurchaseCurrencyGroupDto[];
    /** Every currency present in range — populates the frontend dropdown. */
    @ApiProperty({ type: [String] }) available_currencies: string[];
    /**
     * The one cross-currency figure that IS safe — a count, not money. There is
     * deliberately NO root-level money total (can't sum currencies).
     */
    @ApiProperty({ type: Number }) overall_pov_count: number;
}
