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

/**
 * One invoice line behind an HSN row — the GSTR-1 "Voucher Register" view the
 * client asked for, matching Tally's drill-down column for column.
 *
 * Grain is the invoice LINE, not the invoice: one invoice can contribute two
 * lines to the same HSN row (two products sharing an HSN), and collapsing them
 * would stop the drawer from footing to the summary row it opened from.
 */
export class HsnSummaryVoucherDto {
    @ApiProperty({ type: String }) invoice_id: string;
    /** Tally's "Vch No." */
    @ApiProperty({ required: false, type: String, nullable: true })
    invoice_no: string | null;
    /** dd-mm-yyyy, matching every other report in the app. */
    @ApiProperty({ type: String }) invoice_date: string;
    /** Tally's "Particulars" — the customer. */
    @ApiProperty({ required: false, type: String, nullable: true })
    customer_name: string | null;
    /** Tally's "Vch Type" — always Sales here; only invoices feed GSTR-1. */
    @ApiProperty({ type: String }) voucher_type: string;
    @ApiProperty({ type: String }) status: string;
    @ApiProperty({ type: String }) gst_route: string;
    @ApiProperty({ required: false, type: String, nullable: true })
    product_name: string | null;
    @ApiProperty({ required: false, type: String, nullable: true })
    uqc_code: string | null;
    @ApiProperty({ type: Number }) qty: number;
    @ApiProperty({ type: Number }) taxable_value_inr: number;
    @ApiProperty({ type: Number }) igst_inr: number;
    @ApiProperty({ type: Number }) cgst_inr: number;
    @ApiProperty({ type: Number }) sgst_inr: number;
    @ApiProperty({ type: Number }) cess_inr: number;
    /** Taxable + tax — Tally's "Total Amount". */
    @ApiProperty({ type: Number }) total_value_inr: number;
    /**
     * The WHOLE invoice's grand total, not this line's share — Tally shows it
     * for cross-checking against the printed document, so it repeats on every
     * line of the same invoice and must never be summed.
     */
    @ApiProperty({ type: Number }) invoice_total_inr: number;
}

export class HsnSummaryBreakdownResponseDto {
    /** The summary row this drawer was opened from. */
    @ApiProperty({ required: false, type: String, nullable: true })
    hsn_code: string | null;
    @ApiProperty({ required: false, type: String, nullable: true })
    uqc_code: string | null;
    @ApiProperty({ type: Number }) rate: number;
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: [HsnSummaryVoucherDto] })
    vouchers: HsnSummaryVoucherDto[];
    /** Foots to the summary row — that is the point of the drawer. */
    @ApiProperty({ type: HsnSummaryTotalsDto }) totals: HsnSummaryTotalsDto;
    @ApiProperty({ type: String }) currency: 'INR';
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
