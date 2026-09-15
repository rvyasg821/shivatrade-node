import { ApiProperty } from '@nestjs/swagger';
import { LedgerRowDto } from './ledger.response.dto';

/** One party's Opening/Debit/Credit/Closing for the selected period. */
export class LedgerSummaryRowDto {
    @ApiProperty({ type: String }) party_id: string;
    @ApiProperty({ type: String }) party_name: string;
    /** Vendor's own code (e.g. VND-0866) — customers have no equivalent code. */
    @ApiProperty({ required: false, type: String }) party_code?: string;
    @ApiProperty({ type: String }) currency_code: string;
    /** Balance carried forward from everything dated before the period start. */
    @ApiProperty({ type: Number }) opening: number;
    @ApiProperty({ type: Number }) debit: number;
    @ApiProperty({ type: Number }) credit: number;
    /** opening + debit − credit (party's own currency, native). */
    @ApiProperty({ type: Number }) closing: number;
    @ApiProperty({ type: Number }) opening_inr: number;
    @ApiProperty({ type: Number }) debit_inr: number;
    @ApiProperty({ type: Number }) credit_inr: number;
    @ApiProperty({ type: Number }) closing_inr: number;
    /** Transaction rows for the period — only populated for the Excel export's
     *  per-party detail sheets, never on the plain summary-table response. */
    @ApiProperty({ required: false, type: [LedgerRowDto] })
    rows?: LedgerRowDto[];
}

export class LedgerSummaryTotalsDto {
    @ApiProperty({ type: Number }) opening_inr: number;
    @ApiProperty({ type: Number }) debit_inr: number;
    @ApiProperty({ type: Number }) credit_inr: number;
    @ApiProperty({ type: Number }) closing_inr: number;
}

export class LedgerSummaryResponseDto {
    /** e.g. "01-04-2026 → 15-09-2026" */
    @ApiProperty({ type: String }) period_label: string;
    @ApiProperty({ type: [LedgerSummaryRowDto] }) rows: LedgerSummaryRowDto[];
    /** INR-only totals — native amounts are never summed across currencies. */
    @ApiProperty({ type: LedgerSummaryTotalsDto }) totals: LedgerSummaryTotalsDto;
}
