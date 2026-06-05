import { ApiProperty } from '@nestjs/swagger';

export class RfqLineResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) lead_line_id?: string;
    @ApiProperty({ required: false }) product_id?: string;
    @ApiProperty({ required: false }) product_name?: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty({ required: false }) description?: string;
    @ApiProperty({ required: false }) customer_reference?: string;
    @ApiProperty({ required: false }) qty?: string;
    @ApiProperty({ required: false }) unit?: string;
    @ApiProperty({ required: false }) hs_code?: string;
    @ApiProperty() seq: number;
    @ApiProperty({ required: false }) checked?: boolean;
}

export class RfqVendorResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() vendor_id: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) vendor_code?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) sent_at?: Date;
}

export class RfqVendorPriceResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() rfq_line_id: string;
    @ApiProperty() vendor_id: string;
    @ApiProperty({ required: false }) unit_price?: string;
    @ApiProperty({ required: false }) discount_pct?: string;
    @ApiProperty({ required: false }) currency_code?: string;
    @ApiProperty({ required: false }) lead_time_days?: number;
    @ApiProperty({ required: false }) moq?: number;
    @ApiProperty({ required: false }) notes?: string;
    @ApiProperty() is_selected: boolean;
}

export class RfqGetResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() company_id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) lead_id?: string;
    @ApiProperty({ required: false }) lead_voucher_no?: string;
    @ApiProperty({ required: false }) lead_company_name?: string;
    @ApiProperty({ required: false }) lead_contact_name?: string;
    @ApiProperty({ required: false }) lead_contact_email?: string;
    @ApiProperty({ required: false }) lead_contact_phone?: string;
    @ApiProperty({ required: false }) rfq_date?: string;
    @ApiProperty({ required: false }) notes?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) createdAt?: Date;
    // Vendor price-collection progress, for the "Quoting · 1/3 quoted" badge.
    @ApiProperty({ required: false }) vendors_invited?: number;
    @ApiProperty({ required: false }) vendors_quoted?: number;
    @ApiProperty({ type: [RfqLineResponseDto] }) lines: RfqLineResponseDto[];
    @ApiProperty({ type: [RfqVendorResponseDto] })
    vendors: RfqVendorResponseDto[];
    @ApiProperty({ type: [RfqVendorPriceResponseDto] })
    prices: RfqVendorPriceResponseDto[];
}

export class RfqListResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) lead_id?: string;
    @ApiProperty({ required: false }) lead_voucher_no?: string;
    @ApiProperty({ required: false }) rfq_date?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) line_count?: number;
    @ApiProperty({ required: false }) vendor_count?: number;
    @ApiProperty({ required: false }) createdAt?: Date;
}

// Stats response for /admin/rfq/stats — drives the KPI tile strip on the
// RFQ listing page. Same envelope shape as LeadStatsResponseDto so the
// shared VoucherStatsTiles component consumes it unchanged.
export class RfqStatsResponseDto {
    total: number;
    // Per-status counts. Keys are ENUM_RFQ_STATUS values present in the
    // filtered set — missing keys = 0.
    by_status: Record<string, number>;
}
