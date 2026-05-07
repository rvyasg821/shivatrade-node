import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { QUOTATION_LINE_COLLECTION_NAME } from '../../constants/quotation.entity.constant';

@Entity(QUOTATION_LINE_COLLECTION_NAME)
export class QuotationLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    quotation_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Vendor selected for this line (from price list). Drives PO grouping. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    /** Snapshot of product description at quote time. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    discount_pct?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    tax_pct?: string;

    /** Per-line tax allocation snapshots — populated by tax engine. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    cgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    sgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    igst?: string;

    /** taxable amount = (qty × unit_price) − discount. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    taxable: string;

    /** taxable + cgst + sgst + igst. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    line_total: string;

    /** Snapshot of product master's rebates at line-save time. Each entry:
     *  { rebate_id, code, name, pct }. `pct` is the effective rate (override
     *  on product link if present, else master's pct). Lets recompute apply
     *  per-line rebates without re-reading masters and shields old quotes
     *  from rate changes. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    product_rebates_snapshot?: Array<{
        rebate_id: string;
        code?: string;
        name?: string;
        pct: string;
    }>;

    /** Same idea for expenses. type='percent' applies value as % of line
     *  taxable; type='amount' applies value as flat per-line. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    product_expenses_snapshot?: Array<{
        expense_id: string;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    /** Sum of rebate amounts derived from product_rebates_snapshot.
     *  Cached for fast totals without re-iterating the jsonb array. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_rebates_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_expenses_amount: string;

    /** Display order in the quotation document. */
    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type QuotationLineDoc = QuotationLineEntity;
