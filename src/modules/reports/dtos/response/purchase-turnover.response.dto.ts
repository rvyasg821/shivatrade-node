import { ApiProperty } from '@nestjs/swagger';

/** One bucket of the Purchase Turnover report — a month or a vendor. All INR. */
export class PurchaseTurnoverRowDto {
    /** '2026-07' in month mode; the vendor uuid in vendor mode. */
    @ApiProperty({ type: String }) key: string;
    /** 'Jul 2026' | 'Aarti Chemson Private Limited'. */
    @ApiProperty({ type: String }) label: string;
    @ApiProperty({ type: Number }) pov_count: number;

    /** Goods + vendor charges, pre-GST (= order_value − gst_inr). */
    @ApiProperty({ type: Number }) taxable_inr: number;
    /** Input GST on the purchase (goods GST + per-charge GST). */
    @ApiProperty({ type: Number }) gst_inr: number;
    /** What the vendor billed — lines + charges + GST. Derived, never stored. */
    @ApiProperty({ type: Number }) order_value_inr: number;
    /** Σ non-voided vendor payments, GROSS (before TDS) — see plan §12.4. */
    @ApiProperty({ type: Number }) paid_inr: number;
    /** order_value − paid. Negative = the vendor was overpaid (legitimate). */
    @ApiProperty({ type: Number }) outstanding_inr: number;
}

export class PurchaseTurnoverTotalsDto {
    @ApiProperty({ type: Number }) pov_count: number;
    @ApiProperty({ type: Number }) taxable_inr: number;
    @ApiProperty({ type: Number }) gst_inr: number;
    @ApiProperty({ type: Number }) order_value_inr: number;
    @ApiProperty({ type: Number }) paid_inr: number;
    @ApiProperty({ type: Number }) outstanding_inr: number;
}

export class PurchaseTurnoverPaginationDto {
    @ApiProperty({ type: Number }) total: number;
    @ApiProperty({ type: Number }) perPage: number;
    @ApiProperty({ type: String }) orderBy: string;
}

export class PurchaseTurnoverResponseDto {
    /** e.g. "01-04-2026 → 17-07-2026" */
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: String }) group_by: 'month' | 'vendor';
    /** Month mode fills every month in the range; vendor mode never invents rows. */
    @ApiProperty({ type: [PurchaseTurnoverRowDto] }) rows: PurchaseTurnoverRowDto[];
    /** Across the WHOLE filtered set, not just the page. */
    @ApiProperty({ type: PurchaseTurnoverTotalsDto })
    totals: PurchaseTurnoverTotalsDto;
    @ApiProperty({ type: String }) currency: 'INR';
    @ApiProperty({ type: PurchaseTurnoverPaginationDto })
    pagination: PurchaseTurnoverPaginationDto;
}
