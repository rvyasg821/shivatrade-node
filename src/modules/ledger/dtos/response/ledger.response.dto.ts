import { ApiProperty } from '@nestjs/swagger';

export class LedgerRowDto {
    @ApiProperty({ type: String }) date: string;
    /** invoice | receipt | bill | payment | adjustment */
    @ApiProperty({ type: String }) type: string;
    @ApiProperty({ type: String }) particulars: string;
    @ApiProperty({ required: false, type: String }) voucher_no?: string;
    @ApiProperty({ type: Number }) dr: number;
    @ApiProperty({ type: Number }) cr: number;
    /** Running balance after this row (customer: ΣDR−ΣCR; vendor: ΣCR−ΣDR). */
    @ApiProperty({ type: Number }) balance: number;
    /** Base-currency (INR) equivalent of dr, using this row's own rate. */
    @ApiProperty({ type: Number }) dr_inr: number;
    /** Base-currency (INR) equivalent of cr, using this row's own rate. */
    @ApiProperty({ type: Number }) cr_inr: number;
    /** Running INR balance after this row. */
    @ApiProperty({ type: Number }) balance_inr: number;
}

/**
 * Headline totals shown as cards above the statement. Lifetime figures —
 * deliberately NOT narrowed by the from/to filter, since "what is still owed?"
 * isn't a date-range question. The party ledgers each answer it from their own
 * side; the FE picks the wording.
 */
export class LedgerSummaryDto {
    /** Vendor: Σ order_value of dispatched/closed VPOs. Customer: Σ invoice grand_total. */
    @ApiProperty({ type: Number }) total_billed: number;
    /** Σ non-voided payments (vendor) / receipts (customer). Adjustment notes are NOT netted off. */
    @ApiProperty({ type: Number }) total_paid: number;
    @ApiProperty({ type: Number }) outstanding: number;
    /** INR equivalents of the three figures above, each row using its OWN rate. */
    @ApiProperty({ type: Number }) total_billed_inr: number;
    @ApiProperty({ type: Number }) total_paid_inr: number;
    @ApiProperty({ type: Number }) outstanding_inr: number;
}

export class LedgerResponseDto {
    @ApiProperty({ type: String }) party_type: string;
    @ApiProperty({ type: String }) party_id: string;
    @ApiProperty({ required: false, type: String }) party_name?: string;
    @ApiProperty({ type: String }) currency_code: string;
    @ApiProperty({ type: [LedgerRowDto] }) rows: LedgerRowDto[];
    @ApiProperty({ type: Number }) total_dr: number;
    @ApiProperty({ type: Number }) total_cr: number;
    @ApiProperty({ type: Number }) balance: number;
    @ApiProperty({ type: Number }) total_dr_inr: number;
    @ApiProperty({ type: Number }) total_cr_inr: number;
    @ApiProperty({ type: Number }) balance_inr: number;
    @ApiProperty({ required: false, type: LedgerSummaryDto })
    summary?: LedgerSummaryDto;
}
