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
    /** Agreed unit price (vendor currency) from the source POV line. */
    @ApiProperty({ required: false }) unit_price?: string;
    /** GST rate (%) from the source POV line — read-only, drives the GST column. */
    @ApiProperty({ required: false }) tax_pct?: string;
    /** Vendor discount (%) from the source POV line — applied before GST. */
    @ApiProperty({ required: false }) discount_pct?: string;
    @ApiProperty({ required: false }) ordered_qty?: string;
    @ApiProperty({ required: false }) dispatched_qty?: string;
    /** Accounted (received good + rejected) on OTHER GRNs of the same POV. */
    @ApiProperty({ required: false }) other_received_qty?: string;
    @ApiProperty({ required: false }) received_qty?: string;
    @ApiProperty({ required: false }) accepted_qty?: string;
    @ApiProperty({ required: false }) rejected_qty?: string;
    /** Derived: dispatched − received − rejected (still to be received). */
    @ApiProperty({ required: false }) pending_qty?: string;
    @ApiProperty({ required: false }) batch_no?: string;
    @ApiProperty({ required: false }) remarks?: string;
    @ApiProperty() seq: number;
    /** Set when received_qty is outside the configured GRN qty tolerance vs
     *  the source PO line's ordered qty. Blocks confirm until overridden. */
    @ApiProperty({ required: false }) tolerance_hold?: boolean;
    @ApiProperty({ required: false }) tolerance_hold_reason?: string;
    @ApiProperty({ required: false }) tolerance_override_by?: string;
    @ApiProperty({ required: false }) tolerance_override_at?: Date;
}

export class GrnGetResponseDto {
    @ApiProperty() _id: string;
    @ApiProperty() company_id: string;
    @ApiProperty({ required: false }) voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_id?: string;
    @ApiProperty({ required: false }) po_vendor_voucher_no?: string;
    @ApiProperty({ required: false }) po_vendor_invoice_number?: string;
    @ApiProperty({ required: false }) purchase_order_id?: string;
    @ApiProperty({ required: false }) purchase_order_voucher_no?: string;
    @ApiProperty({ required: false }) customer_po_number?: string;
    @ApiProperty({ required: false }) vendor_id?: string;
    @ApiProperty({ required: false }) vendor_name?: string;
    @ApiProperty({ required: false }) vendor_code?: string;
    @ApiProperty({ required: false }) grn_date?: string;
    /** Vendor currency of the source POV — the line price column is in it. */
    @ApiProperty({ required: false }) currency_code?: string;
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
    // Single POV unit price when all this GRN's lines share one, else null
    // (mixed). Vendor currency.
    @ApiProperty({ required: false }) unit_price?: string | null;
    // Taxable value = Σ(accepted_qty × unit price × (1−disc%)), vendor currency.
    @ApiProperty({ required: false }) total_value?: string;
    // GST value = Σ(taxable × GST%), vendor currency (0 on a foreign POV).
    @ApiProperty({ required: false }) gst_value?: string;
    // GST-inclusive value = total_value + gst_value — what posts to the ledger.
    @ApiProperty({ required: false }) total_with_gst?: string;
    // Vendor currency of the source POV (for the price/total columns).
    @ApiProperty({ required: false }) currency_code?: string;
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
