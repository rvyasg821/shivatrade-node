import { ApiProperty } from '@nestjs/swagger';
import {
    ENUM_PO_VENDOR_STATUS,
    ENUM_PO_VENDOR_PAYMENT_STATUS,
} from '../../enums/po-vendor.enum';

export class PoVendorPaymentResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) payment_date: string;
    @ApiProperty({ required: true, type: String }) amount: string;
    @ApiProperty({ required: false, type: String }) currency_code?: string;
    @ApiProperty({ required: false, type: String }) invoice_number?: string;
    @ApiProperty({ required: false, type: String }) notes?: string;
    // ── Paying company bank (#7) ──
    @ApiProperty({ required: false, type: String }) company_bank_account_id?: string;
    @ApiProperty({ required: false, type: Object }) company_bank_snapshot?: any;
    // ── TDS (#7): Gross (amount) → TDS → net_paid ──
    @ApiProperty({ required: false, type: String }) tds_section?: string;
    @ApiProperty({ required: false, type: String }) tds_rate_pct?: string;
    @ApiProperty({ required: false, type: String }) tds_amount?: string;
    @ApiProperty({ required: false, type: String }) net_paid?: string;
    @ApiProperty({ required: false, type: String }) payment_voucher_no?: string;
    @ApiProperty({ required: false, type: Date }) voided_at?: Date;
    @ApiProperty({ required: false, type: String }) voided_reason?: string;
    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
}

export class PoVendorLineResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) purchase_order_line_id: string;
    @ApiProperty({ required: true, type: String }) product_id: string;
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: false, type: String }) part_no?: string;
    @ApiProperty({ required: false, type: String }) unit?: string;
    @ApiProperty({ required: true, type: String }) tax_pct: string;
    @ApiProperty({ required: true, type: String }) unit_price: string;
    @ApiProperty({ required: false, type: String }) discount_pct?: string;
    @ApiProperty({ required: true, type: String }) ordered_qty: string;
    @ApiProperty({ required: true, type: String }) dispatched_qty: string;
    @ApiProperty({ required: true, type: String }) received_qty: string;
    /** Derived: ordered_qty − dispatched_qty (recoverable). */
    @ApiProperty({ required: true, type: String }) undispatched_qty: string;
    /** Derived: dispatched_qty − received_qty (loss). */
    @ApiProperty({ required: true, type: String }) short_qty: string;
    @ApiProperty({ required: true, type: String }) line_total: string;
    @ApiProperty({ required: true, type: Number }) seq: number;
}

export class PoVendorGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) voucher_no: string;

    @ApiProperty({ required: true, type: String }) purchase_order_id: string;
    @ApiProperty({ required: false, type: String }) purchase_order_voucher_no?: string;
    /** Standalone POV soft-links to Sales Orders (traceability). */
    @ApiProperty({ required: false, type: Array }) linked_sales_orders?: Array<{ id: string; voucher_no: string }>;

    /** The POV this one re-orders the balance of, when it is a balance POV. */
    @ApiProperty({ required: false, type: String }) balance_of_po_vendor_id?: string;
    /** Detail-page only: this POV still has un-delivered qty to re-order. */
    @ApiProperty({ required: false, type: Boolean }) has_balance?: boolean;


    @ApiProperty({ required: true, type: String }) vendor_id: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_email?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_phone?: string;
    @ApiProperty({ required: false, type: Object })
    vendor_contact_country_code?: {
        code?: string;
        dial_code?: string;
        dialCode?: string;
        phone?: string;
        formatted?: string;
    };
    @ApiProperty({ required: false, type: String }) vendor_address_id?: string;

    @ApiProperty({ required: false, type: String }) dispatch_date?: string;
    @ApiProperty({ required: false, type: String }) expected_arrival_date?: string;
    @ApiProperty({ required: false, type: String }) actual_arrival_date?: string;

    /** POV-owned terms printed on the vendor PDF (free text). */
    @ApiProperty({ required: false, type: String }) dispatched_through?: string;
    @ApiProperty({ required: false, type: String }) payment_terms?: string;
    @ApiProperty({ required: false, type: String }) delivery_terms?: string;

    @ApiProperty({ required: false, type: String }) transporter_name?: string;
    @ApiProperty({ required: false, type: String }) vehicle_no?: string;
    @ApiProperty({ required: false, type: String }) lr_no?: string;
    @ApiProperty({ required: false, type: String }) lr_date?: string;
    @ApiProperty({ required: false, type: String }) eway_bill_no?: string;
    @ApiProperty({ required: false, type: String }) eway_bill_date?: string;

    @ApiProperty({ required: true, type: String }) delivery_address: string;
    @ApiProperty({ required: false, type: String }) delivery_address_id?: string;
    @ApiProperty({ required: false, type: String }) notes?: string;
    /** Remarks that actually print on the PDF: per-POV `notes` when set,
     *  otherwise the company's default POV remarks. Read-only (display). */
    @ApiProperty({ required: false, type: String }) effective_remarks?: string;
    @ApiProperty({ required: false, type: String }) internal_notes?: string;

    @ApiProperty({ required: true, type: String }) currency_code: string;
    @ApiProperty({ required: false, type: String }) currency_symbol?: string;
    @ApiProperty({ required: true, type: String }) exchange_rate: string;

    @ApiProperty({ enum: ENUM_PO_VENDOR_STATUS, required: true })
    status: ENUM_PO_VENDOR_STATUS;

    @ApiProperty({ required: false, type: String }) created_by?: string;
    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
    @ApiProperty({ required: false, type: Date }) updatedAt?: Date;

    @ApiProperty({ required: true, type: [PoVendorLineResponseDto] })
    lines: PoVendorLineResponseDto[];

    /** Vendor-side charges (Packing / Transport / etc.) snapshotted on
     *  this POV. Empty `[]` when none. */
    @ApiProperty({ required: false, type: Object, isArray: true })
    expenses_snapshot?: Array<{
        expense_id: string;
        code: string;
        name: string;
        type: string;
        value: string;
        amount: string;
        gst_pct?: string;
    }>;

    // ── Vendor payments ──────────────────────────────────────────────────
    /** Live "Order Value (Payable)" = lines (incl tax) + vendor charges. */
    @ApiProperty({ required: false, type: String }) order_value?: string;
    /** Input GST inside `order_value` = goods GST + per-charge GST. Read-only
     *  breakout for the Input-Output GST report; does not affect any total. */
    @ApiProperty({ required: false, type: String }) gst_inr?: string;
    /** Sum of active (non-voided) payments. */
    @ApiProperty({ required: false, type: String }) amount_paid?: string;
    /** Net effect of linked Adjustment Notes (positive = payable reduced). */
    @ApiProperty({ required: false, type: String }) adjustment_total?: string;
    /** order_value − amount_paid − adjustment_total. */
    @ApiProperty({ required: false, type: String }) balance_payable?: string;
    @ApiProperty({ enum: ENUM_PO_VENDOR_PAYMENT_STATUS, required: false })
    payment_status?: ENUM_PO_VENDOR_PAYMENT_STATUS;
    @ApiProperty({ required: false, type: [PoVendorPaymentResponseDto] })
    payments?: PoVendorPaymentResponseDto[];
}
