import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { LEAD_LINE_COLLECTION_NAME } from '../../constants/lead-line.entity.constant';

/**
 * A requirement line on a Lead. Mirrors `quotation_line` so the Lead form can
 * reuse the shared `SalesDocLineItems` component verbatim (product + vendor +
 * price-from-price-list + Excel import/export). Costing/margin fields are
 * stored as-sent (no server-side recompute at lead stage — pricing is finalised
 * downstream at Quotation), so a lead can carry an indicative price the
 * salesperson sources from the cheapest vendor in the price list.
 */
@Entity(LEAD_LINE_COLLECTION_NAME)
export class LeadLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    lead_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Vendor selected for this line (from price list). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Buyer's requirement #. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    customer_reference?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** Indicative price — auto-filled from the cheapest current price-list
     *  vendor, stored NATIVE in that vendor's currency (multi-currency). */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    unit_price: string;

    /** The native currency of `unit_price` (the vendor/source currency). Mirrors
     *  quotation_line so the lead → quotation carry keeps the source currency. */
    @Column({ type: 'varchar', length: 10, nullable: true, default: 'INR' })
    source_currency_code?: string;

    /** Frozen source→lead-currency rate (cost_native × rate = cost in the lead
     *  currency). 1 when source == lead currency. Display/indicative at lead
     *  stage; the quotation re-derives it in the costing worksheet. */
    @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true, default: 1 })
    cost_exchange_rate?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    discount_pct?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    tax_pct?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    cgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    sgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    igst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    taxable: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    line_total: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    product_rebates_snapshot?: Array<{
        rebate_id: string;
        code?: string;
        name?: string;
        pct: string;
    }>;

    @Column({ type: 'jsonb', nullable: true, default: null })
    product_expenses_snapshot?: Array<{
        expense_id: string;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_rebates_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_expenses_amount: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    margin_pct?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    margin_amount: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    // ── Export / Shipping (mirrors quotation line) ──
    @Column({ type: 'varchar', length: 15, nullable: true })
    hs_code?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    part_no?: string;

    @Column({ type: 'numeric', precision: 14, scale: 3, nullable: false, default: 0 })
    net_weight_kg: string;

    @Column({ type: 'numeric', precision: 14, scale: 3, nullable: false, default: 0 })
    gross_weight_kg: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    package_count: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type LeadLineDoc = LeadLineEntity;
