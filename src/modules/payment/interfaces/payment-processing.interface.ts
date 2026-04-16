import { ENUM_PAYMENT_GATEWAY, ENUM_PAYMENT_METHOD } from '../repository/entities/payment.entity';
import { IPaymentTool } from './payment-data.interface';

/**
 * PayPal card payment request data
 */
export interface IPayPalCardPaymentRequest {
    user_id: string;
    company_id?: string;
    subscription_id?: string;
    plan_id?: string;
    amount?: number; // Optional for backward compatibility
    price?: number;
    tools_price?: number;
    total_price?: number;
    total?: number;
    final_price?: number;
    tax_value?: number;
    currency?: string;
    gateway?: ENUM_PAYMENT_GATEWAY;
    method?: ENUM_PAYMENT_METHOD;
    card_token?: string;
    return_url?: string;
    cancel_url?: string;
    tools?: IPaymentTool[];
    description?: string;
    [key: string]: unknown; // Allow additional properties
}

/**
 * Payment confirmation request
 */
export interface IPaymentConfirmationRequest {
    payment_id?: string;
    request_id?: string;
    state?: string;
    action?: string;
    token?: string;
    PayerID?: string;
    subscription_id?: string;
    [key: string]: unknown; // Allow additional properties
}

/**
 * Subscription data update payload
 */
export interface ISubscriptionUpdatePayload {
    payment_id?: string;
    subscription_id?: string;
    status?: boolean;
    start_date?: Date;
    next_date?: Date;
    end_date?: Date;
    provisioningStatus?: 'pending' | 'provisioning' | 'provisioned' | 'failed';
    provisionedAt?: Date;
    [key: string]: unknown;
}

/**
 * Payment response object
 * Flexible interface that allows partial returns
 */
export interface IPaymentResponse {
    _id?: string;
    user_id?: string;
    company_id?: string;
    subscription_id?: string;
    plan_id?: string;
    charge_id?: string;
    price?: number;
    final_price?: number;
    total?: number;
    status?: string;
    paid?: boolean;
    gateway?: ENUM_PAYMENT_GATEWAY;
    method?: ENUM_PAYMENT_METHOD;
    tools?: IPaymentTool[];
    createdAt?: Date;
    approval_url?: string;
    payment?: unknown; // Allow payment object
    message?: string; // Allow message
    redirectUrl?: string; // Allow redirect URL
    user?: unknown; // Allow user object
    [key: string]: unknown;
}

/**
 * Card details (minimal, never store full card data)
 */
export interface ICardDetails {
    last_four: string;
    card_type: string;
    expiry_month: string;
    expiry_year: string;
    holder_name?: string;
}

/**
 * Tool provisioning payload
 */
export interface IToolProvisioningPayload {
    subscription_id: string;
    company_id: string;
    tenant_id: string;
    tools: IPaymentTool[];
}
