import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { IPayPalOrderResponse, IPayPalCaptureResponse } from '@modules/payment/interfaces/payment-paypal.interface';
import { IPaymentRequestData, IPaymentTool, IPaymentLocationPricing, IPaymentPlanSnapshot } from '@modules/payment/interfaces/payment-data.interface';

export const PAYMENT_COLLECTION_NAME = 'payments';

export enum ENUM_PAYMENT_STATUS {
    CREATED = 'created',
    PROCESSING = 'processing',
    PENDING = 'pending',
    FAILED = 'failed',
    DECLINED = 'declined',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed',
}

export enum ENUM_PAYMENT_GATEWAY {
    PAYPAL = 'paypal',
    STRIPE = 'stripe',
}

export enum ENUM_PAYMENT_METHOD {
    CARD = 'card',
}

@Entity(PAYMENT_COLLECTION_NAME)
export class PaymentEntity extends DatabaseObjectIdEntityBase {
    // ============ REFERENCES ============
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Column({ type: 'uuid', nullable: true, default: null })
    company_id: string;

    @Column({ type: 'uuid', nullable: true, default: null })
    plan_id?: string;

    @Column({ type: 'uuid', nullable: true, default: null })
    subscription_id?: string;

    // ============ LOCATION-BASED PRICING (Cloned from Plan) ============
    @Column({ type: 'int', nullable: true, default: 1 })
    locations: number;

    @Column({ type: 'jsonb', default: [] })
    location_pricing: IPaymentLocationPricing[];

    // ============ CURRENT TIER VALUES (Based on selected locations) ============
    @Column({ type: 'float', nullable: true, default: 0 })
    plan_price: number;

    @Column({ type: 'float', nullable: true, default: 0 })
    plan_special_price: number;

    @Column({ type: 'int', nullable: true, default: 0 })
    plan_special_price_duration: number;

    @Column({ type: 'int', nullable: true, default: 0 })
    plan_special_price_remaining: number;

    // ============ TOOLS (Cloned from Plan with full pricing info) ============
    @Column({ type: 'jsonb', default: [] })
    tools: IPaymentTool[];

    @Column({ type: 'float', nullable: true, default: 0 })
    tools_price: number;

    // ============ CALCULATIONS ============
    @Column({ type: 'float', nullable: true, default: 0 })
    subtotal: number;  // plan_price + tools_price (before discount)

    // ============ DISCOUNT ============
    @Column({ type: 'uuid', nullable: true, default: null })
    discount_id?: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    discount_code?: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    discount_type?: string;

    @Column({ type: 'float', nullable: true, default: 0 })
    discount_value: number;  // The discount % or fixed amount

    @Column({ type: 'float', nullable: true, default: 0 })
    discount_price: number;  // Calculated discount amount

    @Column({ type: 'varchar', nullable: true, default: null })
    discount_duration_type?: string;  // Duration type of the discount

    @Column({ type: 'int', nullable: true, default: null })
    discount_duration_months?: number;  // Total months for limited_months type

    @Column({ type: 'int', nullable: true, default: null })
    discount_remaining_months?: number;  // Remaining months at time of payment

    @Column({ type: 'varchar', nullable: true, default: null })
    discount_name?: string;  // Discount name for display

    // ============ AFTER DISCOUNT ============
    @Column({ type: 'float', nullable: false, default: 0 })
    total: number;  // subtotal - discount_price

    // ============ TAX ============
    @Column({ type: 'varchar', nullable: true, default: null })
    tax_type?: string;  // 'VAT', 'GST', 'Sales Tax', etc.

    @Column({ type: 'float', nullable: true, default: 0 })
    tax_rate: number;  // Tax percentage (e.g., 10, 18)

    @Column({ type: 'float', nullable: true, default: 0 })
    tax_price: number;  // Calculated tax amount

    // ============ FINAL AMOUNT ============
    @Column({ type: 'float', nullable: false, default: 0 })
    final_price: number;  // total + tax_price (Amount charged)

    // ============ PLAN SNAPSHOT (For reference) ============
    @Column({ type: 'jsonb', nullable: true, default: null })
    plan_snapshot?: IPaymentPlanSnapshot;

    // ============ PAYMENT INFO ============
    @Column({ type: 'varchar', nullable: false })
    gateway: ENUM_PAYMENT_GATEWAY;

    @Column({ type: 'varchar', nullable: false })
    method: ENUM_PAYMENT_METHOD;

    @Column({ type: 'varchar', nullable: true, default: '' })
    charge_id?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    request_id?: string;

    @Column({ type: 'boolean', default: false })
    paid: boolean;

    @Column({ type: 'varchar', nullable: true, default: null })
    postDateTime?: string;

    @Column({ type: 'boolean', default: false })
    trial?: boolean;

    @Column({ type: 'varchar', nullable: false, default: ENUM_PAYMENT_STATUS.CREATED })
    status: ENUM_PAYMENT_STATUS;

    // ============ INVOICE ============
    @Column({ type: 'int', nullable: true, default: 0 })
    inv_number?: number;

    @Column({ type: 'varchar', nullable: true, default: '' })
    full_inv_number?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    inv_path?: string;

    // ============ REQUEST/RESPONSE ============
    @Column({ type: 'jsonb', nullable: true, default: null })
    request_data?: IPaymentRequestData;

    @Column({ type: 'jsonb', nullable: true, default: null })
    response?: IPayPalOrderResponse | IPayPalCaptureResponse;

    // ============ METADATA ============
    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PaymentDoc = PaymentEntity;
