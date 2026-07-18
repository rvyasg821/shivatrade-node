import { ApiProperty } from '@nestjs/swagger';

export class AdjustmentNoteResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) voucher_no: string;
    @ApiProperty({ type: String }) party_type: string;
    @ApiProperty({ type: String }) party_id: string;
    @ApiProperty({ required: false, type: String }) party_name?: string;
    @ApiProperty({ type: String }) direction: string;
    @ApiProperty({ type: String }) note_date: string;
    /** Base value (excl. GST). */
    @ApiProperty({ type: String }) amount: string;
    /** GST % — present only on a vendor + debit note. */
    @ApiProperty({ required: false, type: String }) gst_rate?: string;
    /** GST value = round2(amount × gst_rate / 100) — vendor + debit only. */
    @ApiProperty({ required: false, type: String }) gst_amount?: string;
    /** amount + gst_amount — the figure that posts to the ledger. */
    @ApiProperty({ type: String }) total_amount: string;
    @ApiProperty({ type: String }) currency_code: string;
    @ApiProperty({ type: String }) reason: string;
    @ApiProperty({ required: false, type: Date }) voided_at?: Date;
    @ApiProperty({ required: false, type: String }) voided_reason?: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;
    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
}

export class AdjustmentNoteListResponseDto {
    @ApiProperty({ type: [AdjustmentNoteResponseDto] })
    data: AdjustmentNoteResponseDto[];

    @ApiProperty({ type: Number }) total: number;
}
