export interface IStripeCardPaymentRequest {
    payment_method_id: string; // From Stripe.js frontend
    plan_id: string;
    tools?: string[];
    discount_code?: string;
    save_card?: boolean;
    request_id: string;
}

export interface IStripePaymentResponse {
    success: boolean;
    payment_intent_id: string;
    status: string;
    requires_action?: boolean;
    client_secret?: string;
    payment_id: string;
    subscription_id?: string;
    request_id?: string;
}

export interface IStripeConfirmPaymentRequest {
    payment_intent_id: string;
    request_id: string;
}

export interface IStripeConfigResponse {
    publishableKey: string;
    currency: string;
    mode: string;
}
