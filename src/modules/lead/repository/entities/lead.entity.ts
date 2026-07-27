import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_LEAD_SOURCE,
    ENUM_LEAD_STATUS,
} from '@modules/lead/enums/lead.enum';
import { LEAD_COLLECTION_NAME } from '../../constants/lead.entity.constant';

@Entity(LEAD_COLLECTION_NAME)
export class LeadEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Customer Requirement number — STIPL/RQ/0001/2026-27. Nullable for
     *  leads created before voucher numbering was introduced. */
    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    voucher_no?: string;

    /** Manual, free-text tracking reference typed by the operator (alphanumeric).
     *  Distinct from the system `voucher_no` — this is the user's own reference
     *  for cross-referencing the lead against external records. Not unique. */
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    reference_no?: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Optional link to an existing customer (repeat-business lead). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    customer_id?: string;

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    company_name: string;

    @Column({ type: 'varchar', length: 150, nullable: false })
    contact_name: string;

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    contact_email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contact_phone?: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code?: { code: string; dialCode: string };

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_LEAD_SOURCE.OTHER,
    })
    source: ENUM_LEAD_SOURCE;

    /** Array of category _ids — broad area of interest. Required at lead creation. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    interested_categories?: string[];

    /** Array of product _ids — optional refinement within selected categories. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    interested_products?: string[];

    @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
    expected_value?: number;

    @Column({ type: 'varchar', length: 300, nullable: true })
    website_url?: string;

    /** Free-form social map: { facebook, linkedin, instagram, twitter, ... }.
     *  Stored as jsonb so we can add platforms without schema changes. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    social_media_urls?: Record<string, string>;

    /** Free text — quantity is often a range or unit-bound spec
     *  (e.g. "500 PCS" or "approx 2 tonnes"). */
    @Column({ type: 'varchar', length: 200, nullable: true })
    quantity?: string;

    /** Customer's expected delivery timeline / window
     *  (e.g. "within 30 days", "Q3 2026"). */
    @Column({ type: 'varchar', length: 200, nullable: true })
    delivery_expectation?: string;

    /** Vendor _ids the customer named as preferred suppliers. Hint for
     *  Quotation line-vendor pre-selection later. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    preferred_vendors?: string[];

    /** Next planned outreach. List view highlights overdue rows. */
    @Index()
    @Column({ type: 'date', nullable: true })
    follow_up_date?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency?: string;

    /** Assigned sales user (FK to users._id). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    assigned_to?: string;

    /** Initial brief — product specs, target price, RFQ details. Stable
     * reference info, distinct from the timeline of activity notes. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    // ── Address ──
    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line1?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line2?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state?: string;

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    country?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    postcode?: string;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_LEAD_STATUS.NEW,
    })
    status: ENUM_LEAD_STATUS;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    /** Set when the lead is converted into a customer record. */
    @Column({ type: 'uuid', nullable: true })
    converted_customer_id?: string;

    @Column({ type: 'timestamp', nullable: true })
    converted_at?: Date;
}

export type LeadDoc = LeadEntity;
