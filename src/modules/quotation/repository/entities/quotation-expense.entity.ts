import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { QUOTATION_EXPENSE_COLLECTION_NAME } from '../../constants/quotation.entity.constant';

/**
 * Expense line attached to a quotation (Transport, CHA, Insurance, etc.).
 * `expense_id` links to the Expense master when picked from there; null
 * for ad-hoc free-form entries.
 */
@Entity(QUOTATION_EXPENSE_COLLECTION_NAME)
export class QuotationExpenseEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    quotation_id: string;

    @Column({ type: 'uuid', nullable: true })
    expense_id?: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    amount: string;

    /** When true, recompute trusts the stored amount as user override.
     *  When false (and expense_id set), recompute derives from master rule
     *  (flat or % of subtotal). */
    @Column({ type: 'boolean', nullable: false, default: false })
    is_overridden: boolean;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type QuotationExpenseDoc = QuotationExpenseEntity;
