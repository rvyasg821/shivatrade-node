import { ApiProperty } from '@nestjs/swagger';

export class LeadLineResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) product_id: string;
    @ApiProperty({ required: false, type: String }) vendor_id?: string;
    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) customer_reference?: string;
    @ApiProperty({ required: false, type: String }) qty?: string;
    @ApiProperty({ required: false, type: String }) unit?: string;
    @ApiProperty({ required: false, type: String }) unit_price?: string;
    @ApiProperty({ required: false, type: String }) source_currency_code?: string;
    @ApiProperty({ required: false, type: String }) cost_exchange_rate?: string;
    @ApiProperty({ required: false, type: String }) discount_pct?: string;
    @ApiProperty({ required: false, type: String }) tax_pct?: string;
    @ApiProperty({ required: false, type: String }) cgst?: string;
    @ApiProperty({ required: false, type: String }) sgst?: string;
    @ApiProperty({ required: false, type: String }) igst?: string;
    @ApiProperty({ required: false, type: String }) taxable?: string;
    @ApiProperty({ required: false, type: String }) line_total?: string;
    @ApiProperty({ required: false, type: Object })
    product_rebates_snapshot?: any[];
    @ApiProperty({ required: false, type: Object })
    product_expenses_snapshot?: any[];
    @ApiProperty({ required: false, type: String }) product_rebates_amount?: string;
    @ApiProperty({ required: false, type: String }) product_expenses_amount?: string;
    @ApiProperty({ required: false, type: String }) margin_pct?: string;
    @ApiProperty({ required: false, type: String }) margin_amount?: string;
    @ApiProperty({ required: false, type: String }) hs_code?: string;
    @ApiProperty({ required: false, type: String }) net_weight_kg?: string;
    @ApiProperty({ required: false, type: String }) gross_weight_kg?: string;
    @ApiProperty({ required: false, type: Number }) package_count?: number;
    @ApiProperty({ required: true, type: Number }) seq: number;
    // Enriched for display.
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) part_no?: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: false, type: String }) product_selling_price?: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_code?: string;
}
