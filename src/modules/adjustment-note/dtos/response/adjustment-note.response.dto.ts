import { ApiProperty } from '@nestjs/swagger';

export class AdjustmentNoteResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) voucher_no: string;
    @ApiProperty({ type: String }) party_type: string;
    @ApiProperty({ type: String }) party_id: string;
    @ApiProperty({ required: false, type: String }) party_name?: string;
    @ApiProperty({ type: String }) direction: string;
    @ApiProperty({ type: String }) note_date: string;
    @ApiProperty({ type: String }) amount: string;
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
