import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { SUBSCRIPTION_COLLECTION_NAME } from '../../constants/subscription.entity.constant';

/**
 * Location pricing tier - cloned from Plan at purchase time
 */
export interface ISubscriptionLocationPricing {
    locations: number;
    price: number;
    special_price?: number;
    special_price_duration?: number;
    platform_fee?: number;
}

/**
 * Tool information in subscription context
 * Full clone from Plan with all pricing details
 */
export interface ISelectedTool {
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

@Entity(SUBSCRIPTION_COLLECTION_NAME)
export class SubscriptionEntity extends DatabaseObjectIdEntityBase {
    // ============ REFERENCES ============
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    plan_id: string;

    // ============ LOCATION-BASED PRICING (Cloned from Plan at purchase) ============
    @Column({ type: 'int', nullable: true, default: 1 })
    locations: number;

    @Column({ type: 'boolean', default: false })
    is_custom_location: boolean;  // True if custom location count (not from predefined tiers)

    @Column({ type: 'jsonb', default: [] })
    location_pricing: ISubscriptionLocationPricing[];

    // ============ CURRENT TIER VALUES (Based on selected locations) ============
    @Column({ type: 'float', nullable: true, default: 0 })
    plan_price: number;  // Current plan price (editable by admin)

    @Column({ type: 'float', nullable: true, default: 0 })
    original_plan_price: number;  // Original at purchase (for reference)

    @Column({ type: 'float', nullable: true, default: 0 })
    special_price: number;  // Special price if active

    @Column({ type: 'int', nullable: true, default: 0 })
    special_price_duration: number;  // Total special price billing cycles

    @Column({ type: 'int', nullable: true, default: 0 })
    special_price_remaining: number;  // Remaining special price cycles

    // ============ TOOLS (Cloned from Plan with full pricing - editable) ============
    @Column({ type: 'jsonb', default: [] })
    tools: ISelectedTool[];

    @Column({ type: 'float', nullable: true, default: 0 })
    tools_price: number;  // Sum of all tools calculated_price

    // ============ CALCULATIONS ============
    @Column({ type: 'float', nullable: true, default: 0 })
    subtotal: number;  // plan_price + tools_price (before discount)

    // ============ DISCOUNT (Captured at purchase) ============
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
    discount_duration_type?: string;  // Duration type: forever, first_payment, limited_months

    @Column({ type: 'int', nullable: true, default: null })
    discount_duration_months?: number;  // Total months for limited_months duration

    @Column({ type: 'int', nullable: true, default: null })
    discount_remaining_months?: number;  // Remaining months for limited_months duration

    @Column({ type: 'varchar', nullable: true, default: null })
    discount_name?: string;  // Discount name for display

    @Column({ type: 'jsonb', default: [] })
    discount_location_rules?: Array<{
        type: string;
        value?: number;
        min?: number;
        max?: number;
    }>;  // Location rules for discount eligibility

    // ============ AFTER DISCOUNT ============
    @Column({ type: 'float', nullable: true, default: 0 })
    total: number;  // subtotal - discount_price

    // ============ TAX ============
    @Column({ type: 'varchar', nullable: true, default: null })
    tax_type?: string;  // 'VAT', 'GST', 'Sales Tax', etc.

    @Column({ type: 'float', nullable: true, default: 0 })
    tax_rate: number;  // Tax percentage (e.g., 10, 18)

    @Column({ type: 'float', nullable: true, default: 0 })
    tax_price: number;  // Calculated tax amount

    // ============ FINAL RECURRING AMOUNT ============
    @Column({ type: 'float', nullable: false, default: 0 })
    final_price: number;  // total + tax_price (recurring charge)

    // ============ PLAN INFO (Snapshot at purchase) ============
    @Column({ type: 'varchar', nullable: true, default: null })
    plan_name?: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    plan_description?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    plan_type: string;  // MONTHLY, YEARLY

    @Column({ type: 'int', nullable: true, default: 0 })
    plan_type_value: number;  // Days in billing cycle (30, 365)

    // ============ SUBSCRIPTION FLAGS ============
    @Column({ type: 'boolean', default: false })
    recurring: boolean;

    @Column({ type: 'boolean', default: false })
    is_lifetime: boolean;

    @Column({ type: 'boolean', default: false })
    trial: boolean;

    @Column({ type: 'int', nullable: true, default: 0 })
    trial_days: number;

    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    // ============ DATES ============
    @Column({ type: 'timestamptz', nullable: true, default: null })
    start_date: Date;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    next_date: Date;  // Next billing date

    @Column({ type: 'timestamptz', nullable: true, default: null })
    end_date: Date;

    // ============ STATUS ============
    @Column({ type: 'boolean', default: true })
    status: boolean;

    @Column({ type: 'boolean', default: false })
    hold: boolean;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    cancelledAt: Date;

    // ============ PROVISIONING ============
    @Column({ type: 'varchar', nullable: true, default: 'pending' })
    provisioningStatus: string;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    provisionedAt: Date;

    @Column({ type: 'varchar', nullable: true, default: null })
    provisioningError: string;

    // ============ AGENT/REFERRAL ============
    @Column({ type: 'varchar', nullable: true, default: null })
    referal_code?: string;

    @Column({ type: 'uuid', nullable: true, default: null })
    agent_id?: string;

    @Column({ type: 'float', nullable: true, default: 0 })
    commission?: number;

    // ============ METADATA ============
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type SubscriptionDoc = SubscriptionEntity;
