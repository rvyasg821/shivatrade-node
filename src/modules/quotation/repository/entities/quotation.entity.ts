import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_QUOTATION_STATUS } from '../../enums/quotation.enum';
import { QUOTATION_COLLECTION_NAME } from '../../constants/quotation.entity.constant';

@Entity(QUOTATION_COLLECTION_NAME)
export class QuotationEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/QT0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    /** Source lead - nullable for quotations created without going through Leads. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    lead_id?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    customer_id: string;

    /** Bill-to address picked from `customer_addresses` at quotation time. */
    @Column({ type: 'uuid', nullable: true })
    customer_address_id?: string;

    @Column({ type: 'date', nullable: false })
    quotation_date: string;

    @Column({ type: 'date', nullable: true })
    valid_until?: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    currency_code: string;

    /** FX rate at the time of quote (snapshot - does not auto-update). */
    @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
    exchange_rate?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    payment_terms?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    delivery_terms?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    delivery_location?: string;

    @Column({ type: 'text', nullable: true })
    notes_to_client?: string;

    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    // ── Costing snapshot (recomputed on save) ──
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    subtotal: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    expenses_total: string;

    /** Per-product expenses, summed from each line's product master link.
     *  Kept separate from `expenses_total` (which is user-added per-quote)
     *  so the costing card can show both buckets independently. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_expenses_total: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    rebates_total: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_rebates_total: string;

    /** When true, the recompute zeros out product_rebates_total and
     *  product_expenses_total - useful when the user wants to apply rebates
     *  and expenses ONLY at the quotation level (one-off custom rates) and
     *  skip the per-product master configuration entirely. */
    @Column({ type: 'boolean', nullable: false, default: false })
    skip_product_costing: boolean;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
    margin_pct?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    margin_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    tax_total: string;

    /** Home-currency (INR) rounding adjustment — the ± difference applied to
     *  the raw home grand total to reach a whole-rupee figure. GST-compliant
     *  "Round Off" line. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    round_off: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    grand_total: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_QUOTATION_STATUS.DRAFT,
    })
    status: ENUM_QUOTATION_STATUS;

    /** Versioning. v1 on create; edit-after-Sent will create v2, v3 (next week). */
    @Column({ type: 'int', nullable: false, default: 1 })
    version: number;

    @Column({ type: 'uuid', nullable: true })
    parent_version_id?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type QuotationDoc = QuotationEntity;
