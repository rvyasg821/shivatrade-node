import { ApiProperty } from '@nestjs/swagger';

export class GrnLineResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) po_vendor_line_id?: string;
    @ApiProperty({ required: false }) product_id?: string;
    @ApiProperty({ required: false }) product_name?: string;
    @ApiProperty({ required: false }) product_code?: string;
    @ApiProperty({ required: false }) description?: string;
    @ApiProperty({ required: false }) hsn_code?: string;
    @ApiProperty({ required: false }) part_no?: string;
    @ApiProperty({ required: false }) unit?: string;
    @ApiProperty({ required: false }) ordered_qty?: string;
    @ApiProperty({ required: false }) dispatched_qty?: string;
    @ApiProperty({ required: false }) received_qty?: string;
    @ApiProperty({ required: false }) accepted_qty?: string;
    @ApiProperty({ required: false }) rejected_qty?: string;
    @ApiProperty({ required: false }) batch_no?: string;
    @ApiProperty({ required: false }) remarks?: string;
    @ApiProperty() seq: number;
}

export class GrnGetResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() company_id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_id?: string;
    @ApiProperty({ required: false }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false }) purchase_order_id?: string;
    @ApiProperty({ required: false }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false }) customer_po_number?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) vendor_code?: string;
    @ApiProperty({ required: false }) grn_date?: string;
    @ApiProperty({ required: false }) notes?: string;
    @ApiProperty({ required: false }) internal_notes?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) createdAt?: Date;
    @ApiProperty({ type: [GrnLineResponseDto] }) lines: GrnLineResponseDto[];
}

export class GrnListResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) grn_date?: string;
    @ApiProperty() status: string;
    @ApiProperty({ required: false }) line_count?: number;
    // Σ good (accepted) qty across this GRN's lines — shown as "Received".
    @ApiProperty({ required: false }) received_qty?: string;
    // Σ rejected qty across this GRN's lines + the active Debit Note (if any),
    // driving the "Create / View Debit Note" action on the POV GRNs tab.
    @ApiProperty({ required: false }) rejected_qty?: string;
    @ApiProperty({ required: false }) has_debit_note?: boolean;
    @ApiProperty({ required: false }) debit_note_id?: string;
    @ApiProperty({ required: false }) createdAt?: Date;
}

export class GrnStatsResponseDto {
    total: number;
    by_status: Record<string, number>;
}

/** A closed POV that can be receipted into a GRN (no GRN raised yet). */
export class GrnSourcePovResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false }) actual_arrival_date?: string;
    @ApiProperty({ required: false }) line_count?: number;
}
