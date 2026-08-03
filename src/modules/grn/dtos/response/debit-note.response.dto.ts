import { ApiProperty } from '@nestjs/swagger';

export class DebitNoteLineResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) grn_line_id?: string;
    @ApiProperty({ required: false }) po_vendor_line_id?: string;
    @ApiProperty({ required: false }) product_id?: string;
    @ApiProperty({ required: false }) product_name?: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty({ required: false }) description?: string;
    @ApiProperty({ required: false }) hsn_code?: string;
    @ApiProperty({ required: false }) part_no?: string;
    @ApiProperty({ required: false }) unit?: string;
    @ApiProperty({ required: false }) rejected_qty?: string;
    @ApiProperty({ required: false }) returned_qty?: string;
    @ApiProperty({ required: false }) unit_price?: string;
    @ApiProperty({ required: false }) line_total?: string;
    @ApiProperty({ required: false }) remarks?: string;
    @ApiProperty() seq: number;
}

export class DebitNoteGetResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() company_id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) grn_id?: string;
    @ApiProperty({ required: false }) grn_voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_id?: string;
    @ApiProperty({ required: false }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_invoice_number?: string;
    @ApiProperty({ required: false }) purchase_order_id?: string;
    @ApiProperty({ required: false }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) vendor_code?: string;
    @ApiProperty({ required: false }) dn_date?: string;
    @ApiProperty({ required: false }) currency_code?: string;
    @ApiProperty({ required: false }) exchange_rate?: string;
    @ApiProperty({ required: false }) total_amount?: string;
    @ApiProperty({ required: false }) notes?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) createdAt?: Date;
    @ApiProperty({ type: [DebitNoteLineResponseDto] })
    lines: DebitNoteLineResponseDto[];
}

export class DebitNoteListResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) grn_voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_invoice_number?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) dn_date?: string;
    @ApiProperty({ required: false }) currency_code?: string;
    @ApiProperty({ required: false }) exchange_rate?: string;
    @ApiProperty({ required: false }) total_amount?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) line_count?: number;
    // Total returned qty across the DN's lines, and the unit price when all
    // lines share one (else null → mixed). For the POV Debit Notes tab.
    @ApiProperty({ required: false }) total_qty?: string;
    @ApiProperty({ required: false }) unit_price?: string | null;
    @ApiProperty({ required: false }) createdAt?: Date;
}
