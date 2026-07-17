import { ApiProperty } from '@nestjs/swagger';

/** One month of the Input-Output GST Balance. All INR. */
export class GstBalanceRowDto {
    /** Sort/machine key, 'YYYY-MM'. */
    @ApiProperty({ type: String }) month: string;
    /** Display label, e.g. 'Apr 2026'. */
    @ApiProperty({ type: String }) month_label: string;

    /**
     * Notional IGST on `igst_paid` exports (charged, then refunded); 0 under
     * LUT. There is no output CGST/SGST — no domestic sale exists.
     */
    @ApiProperty({ type: Number }) output_igst_inr: number;

    /** Input GST on inter-state purchases (vendor in another state). */
    @ApiProperty({ type: Number }) input_igst_inr: number;
    /** Half of an intra-state purchase's GST. Always equals `input_sgst_inr`. */
    @ApiProperty({ type: Number }) input_cgst_inr: number;
    @ApiProperty({ type: Number }) input_sgst_inr: number;
    /** GST on POVs whose vendor state could not be resolved (plan §6.3). */
    @ApiProperty({ type: Number }) input_unclassified_inr: number;
    /** igst + cgst + sgst + unclassified. */
    @ApiProperty({ type: Number }) input_total_inr: number;

    /** input_total − output_igst. Positive = refund claimable. */
    @ApiProperty({ type: Number }) net_itc_inr: number;
}

export class GstBalanceTotalsDto {
    @ApiProperty({ type: Number }) output_igst_inr: number;
    @ApiProperty({ type: Number }) input_igst_inr: number;
    @ApiProperty({ type: Number }) input_cgst_inr: number;
    @ApiProperty({ type: Number }) input_sgst_inr: number;
    @ApiProperty({ type: Number }) input_unclassified_inr: number;
    @ApiProperty({ type: Number }) input_total_inr: number;
    @ApiProperty({ type: Number }) net_itc_inr: number;
}

export class GstBalanceResponseDto {
    /** e.g. "01-04-2026 → 17-07-2026" */
    @ApiProperty({ type: String }) period_label: string;
    /** One row per month in the range, ascending — empty months included. */
    @ApiProperty({ type: [GstBalanceRowDto] }) rows: GstBalanceRowDto[];
    @ApiProperty({ type: GstBalanceTotalsDto }) totals: GstBalanceTotalsDto;
    @ApiProperty({ type: String }) currency: 'INR';
    /** POVs that fell into Unclassified — drives the FE warning strip. */
    @ApiProperty({ type: Number }) unclassified_pov_count: number;
}
