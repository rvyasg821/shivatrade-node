import { ApiProperty } from '@nestjs/swagger';

export class PoCoverageLineDto {
    @ApiProperty({ required: true, type: String }) purchase_order_line_id: string;
    @ApiProperty({ required: true, type: String }) product_id: string;
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: false, type: String }) unit?: string;

    /** PO line.qty — the contracted quantity. */
    @ApiProperty({ required: true, type: String }) ordered: string;

    /** Σ ordered_qty across non-cancelled POVs (active reservation). */
    @ApiProperty({ required: true, type: String }) covered: string;

    /** Σ dispatched_qty across non-cancelled POVs. */
    @ApiProperty({ required: true, type: String }) dispatched: string;

    /** Σ received_qty across non-cancelled POVs. */
    @ApiProperty({ required: true, type: String }) received: string;

    /** Σ (dispatched - received) across CLOSED POVs only — booked loss. */
    @ApiProperty({ required: true, type: String }) lost: string;

    /** ordered − covered. New POVs can be opened against this remaining capacity. */
    @ApiProperty({ required: true, type: String }) pending: string;
}

export class PoCoverageTotalsDto {
    @ApiProperty({ required: true, type: String }) ordered: string;
    @ApiProperty({ required: true, type: String }) covered: string;
    @ApiProperty({ required: true, type: String }) dispatched: string;
    @ApiProperty({ required: true, type: String }) received: string;
    @ApiProperty({ required: true, type: String }) lost: string;
    @ApiProperty({ required: true, type: String }) pending: string;
}

export class PoCoverageResponseDto {
    @ApiProperty({ required: true, type: String }) purchase_order_id: string;
    @ApiProperty({ required: false, type: String }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false, type: String }) status?: string;

    /** Convenience flag for "Create POV" button gating on FE. */
    @ApiProperty({ required: true, type: Boolean }) has_pending: boolean;

    @ApiProperty({ required: true, type: [PoCoverageLineDto] })
    lines: PoCoverageLineDto[];

    @ApiProperty({ required: true, type: PoCoverageTotalsDto })
    totals: PoCoverageTotalsDto;
}
