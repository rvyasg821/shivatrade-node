import { ApiProperty } from '@nestjs/swagger';
import { ENUM_PURCHASE_ORDER_STATUS } from '../../enums/purchase-order.enum';

export class PurchaseOrderLineResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) product_id: string;
    @ApiProperty({ required: false, type: String }) product_name?: string;
    @ApiProperty({ required: false, type: String }) product_code?: string;
    @ApiProperty({ required: false, type: String }) vendor_id?: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_code?: string;
    @ApiProperty({ required: false, type: String }) source_quotation_line_id?: string;
    @ApiProperty({ required: false, type: String }) source_pfi_line_id?: string;
    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) customer_reference?: string;
    @ApiProperty({ required: false, type: String }) hsn_code?: string;
    @ApiProperty({ required: true, type: String }) qty: string;
    @ApiProperty({ required: false, type: String }) unit?: string;
    @ApiProperty({ required: true, type: String }) unit_price: string;
    @ApiProperty({ required: false, type: String }) discount_pct?: string;
    @ApiProperty({ required: true, type: String }) tax_pct: string;
    @ApiProperty({ required: true, type: String }) cgst: string;
    @ApiProperty({ required: true, type: String }) sgst: string;
    @ApiProperty({ required: true, type: String }) igst: string;
    @ApiProperty({ required: true, type: String }) taxable: string;
    @ApiProperty({ required: true, type: String }) line_total: string;
    @ApiProperty({ required: true, type: Number }) seq: number;
    @ApiProperty({ required: false, type: String }) margin_pct?: string;
    @ApiProperty({ required: false, type: Object })
    product_rebates_snapshot?: any[];
    @ApiProperty({ required: false, type: Object })
    product_expenses_snapshot?: any[];
    @ApiProperty({ required: false, type: String }) product_rebates_amount?: string;
    @ApiProperty({ required: false, type: String }) product_expenses_amount?: string;
    @ApiProperty({ required: false, type: String }) margin_amount?: string;
}

export class PurchaseOrderGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) voucher_no: string;

    @ApiProperty({ required: true, type: String }) vendor_id: string;
    @ApiProperty({ required: false, type: String }) vendor_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_name?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_email?: string;
    @ApiProperty({ required: false, type: String }) vendor_contact_phone?: string;
    @ApiProperty({ required: false, type: Object }) vendor_contact_country_code?: any;
    @ApiProperty({ required: false, type: String }) vendor_address_id?: string;

    @ApiProperty({ required: false, type: String }) customer_id?: string;
    @ApiProperty({ required: false, type: String }) customer_address_id?: string;
    @ApiProperty({ required: false, type: String }) consignee_id?: string;
    @ApiProperty({ required: false }) consignee_snapshot?: any;
    @ApiProperty({ required: false, type: String }) customer_name?: string;
    @ApiProperty({ required: false, type: String }) customer_contact_name?: string;
    @ApiProperty({ required: false, type: String }) customer_contact_email?: string;
    @ApiProperty({ required: false, type: String }) customer_contact_phone?: string;
    @ApiProperty({ required: false, type: Object }) customer_contact_country_code?: any;

    @ApiProperty({ required: false, type: String }) quotation_id?: string;
    @ApiProperty({ required: false, type: String }) quotation_voucher_no?: string;
    @ApiProperty({ required: false, type: String }) pfi_id?: string;
    @ApiProperty({ required: false, type: String }) pfi_voucher_no?: string;
    @ApiProperty({ required: false, type: String }) pfi_bank_account_id?: string;

    @ApiProperty({ required: true, type: String }) po_date: string;
    @ApiProperty({ required: false, type: String }) expected_delivery_date?: string;

    @ApiProperty({ required: true, type: String }) delivery_address: string;
    @ApiProperty({ required: false, type: String }) delivery_address_id?: string;
    @ApiProperty({ required: false, type: String }) payment_terms?: string;
    @ApiProperty({ required: false, type: String }) delivery_terms?: string;
    @ApiProperty({ required: false, type: String }) notes_to_vendor?: string;
    @ApiProperty({ required: false, type: String }) internal_notes?: string;

    @ApiProperty({ required: true, type: String }) currency_code: string;
    @ApiProperty({ required: false, type: String }) currency_symbol?: string;
    @ApiProperty({ required: true, type: String }) exchange_rate: string;

    @ApiProperty({ required: true, type: String }) subtotal: string;
    @ApiProperty({ required: true, type: String }) cgst_total: string;
    @ApiProperty({ required: true, type: String }) sgst_total: string;
    @ApiProperty({ required: true, type: String }) igst_total: string;
    @ApiProperty({ required: true, type: String }) tax_total: string;
    @ApiProperty({ required: true, type: String }) round_off: string;
    @ApiProperty({ required: true, type: String }) grand_total: string;

    @ApiProperty({ enum: ENUM_PURCHASE_ORDER_STATUS, required: true })
    status: ENUM_PURCHASE_ORDER_STATUS;

    @ApiProperty({ required: false, type: String }) public_token?: string;
    @ApiProperty({ required: false, type: Number }) public_view_count?: number;
    @ApiProperty({ required: false, type: Date })
    public_last_viewed_at?: Date;

    @ApiProperty({ required: false, type: String }) created_by?: string;
    @ApiProperty({ required: false, type: Date }) createdAt?: Date;
    @ApiProperty({ required: false, type: Date }) updatedAt?: Date;

    @ApiProperty({ required: true, type: [PurchaseOrderLineResponseDto] })
    lines: PurchaseOrderLineResponseDto[];
}
