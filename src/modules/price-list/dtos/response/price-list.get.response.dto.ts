import { ApiProperty } from '@nestjs/swagger';

export class PriceListGetResponseDto {
    @ApiProperty({ type: String }) _id: string;
    @ApiProperty({ type: String }) company_id: string;
    @ApiProperty({ type: String, required: false }) created_by?: string;

    @ApiProperty({ type: String }) vendor_id: string;
    @ApiProperty({ type: String, required: false }) vendor_name?: string;
    @ApiProperty({ type: String, required: false }) vendor_code?: string;

    @ApiProperty({ type: String }) product_id: string;
    @ApiProperty({ type: String, required: false }) product_code?: string;
    @ApiProperty({ type: String, required: false }) product_name?: string;

    @ApiProperty({ type: String }) currency_id: string;
    @ApiProperty({ type: String, required: false }) currency_code?: string;
    @ApiProperty({ type: String, required: false }) currency_symbol?: string;

    @ApiProperty({ type: String }) unit_price: string;
    @ApiProperty({ type: Number, required: false }) moq?: number;
    @ApiProperty({ type: String, required: false }) discount_pct?: string;
    @ApiProperty({ type: String, required: false }) margin_pct?: string;
    @ApiProperty({ type: Number, required: false }) lead_time_days?: number;
    @ApiProperty({ type: String }) effective_date: string;
    /** Explicit quote expiry — null if no explicit expiry was set. */
    @ApiProperty({ type: String, required: false }) valid_until?: string;
    /** Effective end date — explicit valid_until if set, else next row's
     *  effective_date - 1 day for the same (vendor, product), else null
     *  (still active). Computed at hydration time, not stored. */
    @ApiProperty({ type: String, required: false }) effective_until?: string;
    @ApiProperty({ type: String, required: false }) notes?: string;

    // ── Source / traceability ──
    @ApiProperty({ type: String, required: false }) source_type?: string;
    @ApiProperty({ type: String, required: false }) source_rfq_id?: string;
    @ApiProperty({ type: String, required: false }) source_rfq_line_id?: string;
    @ApiProperty({ type: String, required: false }) source_rfq_voucher_no?: string;

    @ApiProperty({ type: Date }) createdAt: Date;
    @ApiProperty({ type: Date }) updatedAt: Date;
}
