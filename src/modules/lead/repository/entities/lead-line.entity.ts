import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { LEAD_LINE_COLLECTION_NAME } from '../../constants/lead-line.entity.constant';

/**
 * A single requirement line on a Lead — what the customer is asking for.
 * Replaces the old `interested_categories` / `interested_products` jsonb
 * arrays with a structured, document-style table (mirrors the Quotation
 * line shape but without pricing/costing). A line may reference a catalogued
 * `product_id`, a `category_id`, or be purely free-text (`description`) for
 * items not yet in the catalogue.
 */
@Entity(LEAD_LINE_COLLECTION_NAME)
export class LeadLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    lead_id: string;

    /** Optional FK to the product master (line may be free-text instead). */
    @Column({ type: 'uuid', nullable: true })
    product_id?: string;

    /** Optional FK to the category master. */
    @Column({ type: 'uuid', nullable: true })
    category_id?: string;

    /** What the customer wants — product name or free-text item. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
    qty?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** Customer's target / budget price (not our cost — captured for sourcing). */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
    target_price?: string;

    /** Buyer's requirement / reference no. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    customer_reference?: string;

    /** Additional specs / remarks for this requirement. */
    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LeadLineDoc = LeadLineEntity;
