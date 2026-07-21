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

    /**
     * The taxable SALES value the output IGST was computed on — Σ invoice-line
     * `taxable_amount` on `igst_paid` invoices. Shown so the tax can be checked
     * against its own base instead of appearing from nowhere (client #6).
     */
    @ApiProperty({ type: Number }) output_taxable_inr: number;

    /**
     * The taxable PURCHASE value the input GST was computed on — Vendor PO
     * goods + vendor charges, excluding GST (`order_value − gst_inr`). This is
     * the "purchase amount" the client asked us to surface.
     */
    @ApiProperty({ type: Number }) input_taxable_inr: number;

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
    @ApiProperty({ type: Number }) output_taxable_inr: number;
    @ApiProperty({ type: Number }) input_taxable_inr: number;
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

// ── Drill-down: what a single month's figures are actually made of ──────
// Answers "where did this number come from?" document by document.

export class GstBalancePurchaseSourceDto {
    @ApiProperty({ type: String }) po_vendor_id: string;
    @ApiProperty({ type: String }) voucher_no: string;
    @ApiProperty({ type: String }) vendor_name: string;
    /** Vendor's state — what decides IGST vs CGST/SGST. */
    @ApiProperty({ type: String, nullable: true }) vendor_state: string | null;
    @ApiProperty({ type: String }) status: string;
    /** dispatch_date, falling back to createdAt (a POV has no purchase date). */
    @ApiProperty({ type: String }) date: string;
    /** Goods + charges, excluding GST. */
    @ApiProperty({ type: Number }) taxable_inr: number;
    @ApiProperty({ type: Number }) gst_inr: number;
    /** 'igst' | 'cgst_sgst' | 'unclassified'. */
    @ApiProperty({ type: String }) gst_split: string;
}

export class GstBalanceSalesSourceDto {
    @ApiProperty({ type: String }) invoice_id: string;
    @ApiProperty({ type: String }) voucher_no: string;
    @ApiProperty({ type: String }) customer_name: string;
    @ApiProperty({ type: String }) status: string;
    @ApiProperty({ type: String }) invoice_date: string;
    @ApiProperty({ type: String }) gst_route: string;
    @ApiProperty({ type: Number }) taxable_inr: number;
    @ApiProperty({ type: Number }) igst_inr: number;
}

export class GstBalanceBreakdownResponseDto {
    @ApiProperty({ type: String }) month: string;
    @ApiProperty({ type: String }) month_label: string;
    /** Vendor POs behind this month's Input GST. */
    @ApiProperty({ type: [GstBalancePurchaseSourceDto] })
    purchases: GstBalancePurchaseSourceDto[];
    /** Invoices behind this month's Output GST. */
    @ApiProperty({ type: [GstBalanceSalesSourceDto] })
    sales: GstBalanceSalesSourceDto[];
}
