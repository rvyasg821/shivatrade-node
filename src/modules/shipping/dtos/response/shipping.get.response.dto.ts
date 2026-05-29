import {
    ENUM_SHIPPING_BILL_TYPE,
    ENUM_SHIPPING_EVENT_TYPE,
    ENUM_SHIPPING_MODE,
    ENUM_SHIPPING_STATUS,
} from '@modules/shipping/enums/shipping.enum';

export class ShippingInvoiceAttachmentDto {
    _id?: string;
    invoice_id?: string;
    invoice_voucher_no?: string;
    invoice_grand_total?: string;
    invoice_currency_code?: string;
}

export class ShippingEventDto {
    _id?: string;
    type?: ENUM_SHIPPING_EVENT_TYPE;
    type_other?: string;
    occurred_at?: Date;
    location?: string;
    notes?: string;
    is_system?: boolean;
    created_by?: string;
    created_by_name?: string;
    createdAt?: Date;
    attachment_url?: string;
    soft_delete?: boolean;
    deleted_at?: Date;
    deleted_by_user_id?: string;
    deleted_by_name?: string;
    deleted_reason?: string;
}

export class ShippingGetResponseDto {
    _id?: string;
    voucher_no?: string;
    mode?: ENUM_SHIPPING_MODE;
    status?: ENUM_SHIPPING_STATUS;

    customer_id?: string;
    customer_snapshot?: any;
    consignee_id?: string;
    consignee_snapshot?: any;
    notify_party_id?: string;
    notify_party_snapshot?: any;
    forwarder_id?: string;
    forwarder_snapshot?: any;

    bl_awb_no?: string;
    bl_awb_date?: string;
    bl_awb_type?: string;

    shipping_bill_no?: string;
    shipping_bill_date?: string;
    shipping_bill_type?: ENUM_SHIPPING_BILL_TYPE;
    let_export_order_date?: string;
    egm_no?: string;
    egm_date?: string;

    container_no?: string;
    seal_no?: string;
    container_type?: string;
    vessel_name?: string;
    voyage_no?: string;
    flight_no?: string;

    pre_carriage_by?: string;
    place_of_receipt?: string;
    port_of_loading_id?: string;
    port_of_loading_snapshot?: any;
    port_of_discharge_id?: string;
    port_of_discharge_snapshot?: any;
    place_of_delivery?: string;
    country_of_origin?: string;
    country_of_destination?: string;

    booking_date?: string;
    gate_in_date?: string;
    etd?: string;
    actual_dispatch_date?: string;
    eta?: string;
    actual_arrival_date?: string;
    customs_cleared_date?: string;
    delivered_date?: string;

    total_packages?: number;
    package_type?: string;
    net_weight_kg?: string;
    gross_weight_kg?: string;
    volume_cbm?: string;
    marks_and_nos?: string;

    marine_insurance_policy_no?: string;
    insurance_company?: string;
    policy_amount_inr?: string;

    freight_charges_inr?: string;
    insurance_charges_inr?: string;
    cha_charges_inr?: string;
    forwarder_charges_inr?: string;
    other_charges_inr?: string;
    total_cost_inr?: string;

    iec_code?: string;
    ad_code?: string;

    notes?: string;
    internal_notes?: string;

    booked_by?: string;
    booked_at?: Date;
    cancelled_by?: string;
    cancelled_at?: Date;
    cancelled_reason?: string;

    createdAt?: Date;
    updatedAt?: Date;

    invoices?: ShippingInvoiceAttachmentDto[];
    events?: ShippingEventDto[];
}

export class ShippingListResponseDto {
    _id?: string;
    voucher_no?: string;
    mode?: ENUM_SHIPPING_MODE;
    status?: ENUM_SHIPPING_STATUS;
    consignee_id?: string;
    consignee_snapshot?: any;
    country_of_destination?: string;
    port_of_loading_snapshot?: any;
    port_of_discharge_snapshot?: any;
    bl_awb_no?: string;
    actual_dispatch_date?: string;
    eta?: string;
    actual_arrival_date?: string;
    total_cost_inr?: string;
    createdAt?: Date;
}
