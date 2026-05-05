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

    /** Display order in the quotation document. */
    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type QuotationLineDoc = QuotationLineEntity;
