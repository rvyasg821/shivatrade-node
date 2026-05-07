import { ENUM_PFI_STATUS } from '../../enums/pfi.enum';

export class PfiLineResponseDto {
    _id?: string;
    product_id?: string;
    product_code?: string;
    product_name?: string;
    vendor_id?: string;
    vendor_name?: string;
    description?: string;
    qty?: string;
    unit?: string;
    unit_price?: string;
    discount_pct?: string;
    tax_pct?: string;
    cgst?: string;
    sgst?: string;
    igst?: string;
    taxable?: string;
    line_total?: string;
    seq?: number;
}

export class PfiExpenseResponseDto {
    _id?: string;
    expense_id?: string;
    name?: string;
    amount?: string;
    is_overridden?: boolean;
    seq?: number;
}

export class PfiRebateResponseDto {
    _id?: string;
    rebate_id?: string;
    name?: string;
    amount?: string;
    is_overridden?: boolean;
    seq?: number;
}

export class PfiGetResponseDto {
    _id?: string;
    voucher_no?: string;
    quotation_id?: string;
    quotation_voucher_no?: string;
    lead_id?: string;
    customer_id?: string;
    customer_name?: string;
    customer_address_id?: string;
    pfi_date?: string;
    valid_until?: string;
    currency_id?: string;
    currency_code?: string;
    currency_symbol?: string;
    exchange_rate?: string;
    payment_terms?: string;
    delivery_terms?: string;
    delivery_location?: string;
    notes_to_client?: string;
    internal_notes?: string;

    subtotal?: string;
    expenses_total?: string;
    rebates_total?: string;
    margin_pct?: string;
    margin_amount?: string;
    tax_total?: string;
    grand_total?: string;

    status?: ENUM_PFI_STATUS;
    version?: number;
    parent_version_id?: string;

    created_by?: string;
    createdAt?: Date;
    updatedAt?: Date;

    lines?: PfiLineResponseDto[];
    expenses?: PfiExpenseResponseDto[];
    rebates?: PfiRebateResponseDto[];
}
