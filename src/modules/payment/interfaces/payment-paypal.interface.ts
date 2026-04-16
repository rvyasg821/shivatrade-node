/**
 * PayPal API Response Interfaces
 * Based on PayPal Orders API v2 and Payments API
 */

export interface IPayPalAmount {
    currency_code: string;
    value: string;
}

export interface IPayPalPayer {
    email_address?: string;
    payer_id?: string;
    name?: {
        given_name?: string;
        surname?: string;
    };
    address?: {
        country_code?: string;
    };
}

export interface IPayPalPaymentSource {
    card?: {
        last_digits?: string;
        brand?: string;
        type?: string;
    };
}

export interface IPayPalPurchaseUnit {
    reference_id?: string;
    amount: IPayPalAmount;
    payee?: {
        email_address?: string;
        merchant_id?: string;
    };
    description?: string;
    custom_id?: string;
    invoice_id?: string;
    soft_descriptor?: string;
    payments?: {
        captures?: Array<{
            id: string;
            status: string;
            amount: IPayPalAmount;
            final_capture?: boolean;
            create_time?: string;
            update_time?: string;
        }>;
    };
}

export interface IPayPalLink {
    href: string;
    rel: string;
    method?: string;
}

/**
 * PayPal Order Response
 * https://developer.paypal.com/docs/api/orders/v2/
 */
export interface IPayPalOrderResponse {
    id: string;
    intent?: 'CAPTURE' | 'AUTHORIZE';
    status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
    purchase_units?: IPayPalPurchaseUnit[];
    payer?: IPayPalPayer;
    payment_source?: IPayPalPaymentSource;
    create_time?: string;
    update_time?: string;
    links?: IPayPalLink[];
}

/**
 * PayPal Capture Payment Response
 */
export interface IPayPalCaptureResponse {
    id: string;
    status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
    purchase_units?: IPayPalPurchaseUnit[];
    payer?: IPayPalPayer;
    payment_source?: IPayPalPaymentSource;
    create_time?: string;
    update_time?: string;
    links?: IPayPalLink[];
}

/**
 * PayPal Error Response
 */
export interface IPayPalErrorDetails {
    field?: string;
    value?: string;
    location?: string;
    issue: string;
    description?: string;
}

export interface IPayPalErrorResponse {
    name: string;
    message: string;
    debug_id?: string;
    details?: IPayPalErrorDetails[];
    links?: IPayPalLink[];
}

/**
 * PayPal Order Create Request
 */
export interface IPayPalOrderCreateRequest {
    intent: 'CAPTURE' | 'AUTHORIZE';
    purchase_units: Array<{
        reference_id?: string;
        amount: {
            currency_code: string;
            value: string;
            breakdown?: {
                item_total?: IPayPalAmount;
                shipping?: IPayPalAmount;
                tax_total?: IPayPalAmount;
                discount?: IPayPalAmount;
            };
        };
        description?: string;
        custom_id?: string;
        invoice_id?: string;
        soft_descriptor?: string;
    }>;
    payment_source?: {
        card?: {
            number?: string;
            expiry?: string;
            security_code?: string;
            name?: string;
            billing_address?: {
                address_line_1?: string;
                address_line_2?: string;
                admin_area_2?: string; // City
                admin_area_1?: string; // State
                postal_code?: string;
                country_code: string;
            };
        };
        token?: {
            id: string;
            type: 'BILLING_AGREEMENT';
        };
    };
    application_context?: {
        brand_name?: string;
        locale?: string;
        landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
        shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
        user_action?: 'CONTINUE' | 'PAY_NOW';
        return_url?: string;
        cancel_url?: string;
    };
}

/**
 * PayPal Token Response
 */
export interface IPayPalTokenResponse {
    id: string;
    customer?: {
        id?: string;
    };
    payment_source?: IPayPalPaymentSource;
    links?: IPayPalLink[];
}

/**
 * Generic PayPal API Response
 * Use when specific response type is unknown
 */
export interface IPayPalGenericResponse {
    id?: string;
    status?: string;
    [key: string]: unknown;
}
