/**
 * Location pricing tier - cloned from Plan
 */
export interface IPaymentLocationPricing {
    locations: number;
    price: number;
    special_price?: number;
    special_price_duration?: number;
    platform_fee?: number;
}

/**
 * Tool information in payment/subscription context
 * Full clone from Plan with all pricing details
 */
export interface IPaymentTool {
    _id: string;
    name: string;
    slug?: string;
    base_price: number;              // Original price from plan
    pricing_mode: string;            // 'fixed' or 'multiplier'
    location_multiplier: number;     // e.g., 1.0, 1.5, 2.0
    calculated_price: number;        // Final price after applying mode
    is_mandatory?: boolean;
    display_order?: number;
}

/**
 * Plan snapshot - captured at purchase time
 */
export interface IPaymentPlanSnapshot {
    name: string;
    description?: string;
    duration: number;
    duration_type: string;           // MONTHLY, YEARLY
    recurring: boolean;
    is_lifetime: boolean;
    trial?: boolean;
    trial_days?: number;
}

/**
 * Payment request data structure
 * Stores the original request sent to payment gateway
 */
export interface IPaymentRequestData {
    card_number?: string; // Masked or last 4 digits only
    card_type?: string;
    holder_name?: string;
    expiry_month?: string;
    expiry_year?: string;
    cvv?: never; // Never store CVV
    billing_address?: {
        address_line_1?: string;
        address_line_2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country_code?: string;
    };
    amount?: number;
    currency?: string;
    description?: string;
    custom_id?: string;
    invoice_id?: string;
    return_url?: string;
    cancel_url?: string;
    [key: string]: unknown;
}

/**
 * Metadata interface for companies
 */
export interface ICompanyMetadata {
    companyName?: string;
    contactName?: string;
    email?: string;
    mobile?: string;
    website?: string;
    registeredAt?: Date;
    userId?: string;
    companyId?: string;
    industry?: string;
    size?: string;
    timezone?: string;
    locale?: string;
    preferences?: {
        emailNotifications?: boolean;
        smsNotifications?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

/**
 * Metadata interface for tenants
 */
export interface ITenantMetadata extends ICompanyMetadata {
    tenantVersion?: string;
    planType?: string;
    subscriptionId?: string;
    lastBackupAt?: Date;
    storageUsed?: number;
    userCount?: number;
    [key: string]: unknown;
}
