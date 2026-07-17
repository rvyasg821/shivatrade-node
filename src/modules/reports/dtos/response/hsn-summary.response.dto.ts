import { ApiProperty } from '@nestjs/swagger';

/**
 * One GSTR-1 Table 12 line — a group of invoice lines sharing
 * HSN + notional IGST rate + UQC.
 */
export class HsnSummaryRowDto {
    @ApiProperty({ required: false, type: String, nullable: true })
    hsn_code: string | null;

    /** Representative label only — a group can span products (plan §14.5). */
    @ApiProperty({ required: false, type: String, nullable: true })
    description: string | null;

    @ApiProperty({ required: false, type: String, nullable: true })
    uqc_code: string | null;

    /** Notional IGST rate (`igst_rate_pct`), NOT `tax_pct` (0 on exports). */
    @ApiProperty({ type: Number }) rate: number;
    @ApiProperty({ type: Number }) total_qty: number;
    /** Taxable + IGST + CGST + SGST + Cess. */
    @ApiProperty({ type: Number }) total_value_inr: number;
    @ApiProperty({ type: Number }) taxable_value_inr: number;
    /** Notional: charged-and-refunded on `igst_paid`, 0 under LUT (plan §3.1). */
    @ApiProperty({ type: Number }) igst_inr: number;
    @ApiProperty({ type: Number }) cgst_inr: number; // always 0 today
    @ApiProperty({ type: Number }) sgst_inr: number; // always 0 today
    @ApiProperty({ type: Number }) cess_inr: number; // always 0 today
}

export class HsnSummaryTotalsDto {
    @ApiProperty({ type: Number }) total_qty: number;
    @ApiProperty({ type: Number }) total_value_inr: number;
    @ApiProperty({ type: Number }) taxable_value_inr: number;
    @ApiProperty({ type: Number }) igst_inr: number;
    @ApiProperty({ type: Number }) cgst_inr: number;
    @ApiProperty({ type: Number }) sgst_inr: number;
    @ApiProperty({ type: Number }) cess_inr: number;
}

export class HsnSummaryPaginationDto {
    @ApiProperty({ type: Number }) total: number;
    @ApiProperty({ type: Number }) perPage: number;
    @ApiProperty({ type: String }) orderBy: string;
}

export class HsnSummaryResponseDto {
    /** e.g. "01-04-2026 → 15-07-2026" */
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: [HsnSummaryRowDto] }) rows: HsnSummaryRowDto[];
    /** Across the WHOLE filtered set, not just the page. */
    @ApiProperty({ type: HsnSummaryTotalsDto }) totals: HsnSummaryTotalsDto;
    @ApiProperty({ type: String }) currency: 'INR';
    /** Issued lines missing HSN or UQC — the FE surfaces a note (plan §14.3). */
    @ApiProperty({ type: Number }) missing_hsn_or_uqc_rows: number;
    @ApiProperty({ type: HsnSummaryPaginationDto })
    pagination: HsnSummaryPaginationDto;
}
