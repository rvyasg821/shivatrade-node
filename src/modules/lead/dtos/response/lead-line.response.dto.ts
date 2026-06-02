import { ApiProperty } from '@nestjs/swagger';

export class LeadLineResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: false, type: String }) product_id?: string;
    @ApiProperty({ required: false, type: String }) category_id?: string;
    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) qty?: string;
    @ApiProperty({ required: false, type: String }) unit?: string;
    @ApiProperty({ required: false, type: String }) target_price?: string;
    @ApiProperty({ required: false, type: String }) customer_reference?: string;
    @ApiProperty({ required: false, type: String }) notes?: string;
    @ApiProperty({ required: true, type: Number }) seq: number;
    // Enriched server-side for display (not stored on the line).
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) category_name?: string;
}
