import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { RFQ_LINE_COLLECTION_NAME } from '../../constants/rfq.entity.constant';

/**
 * One item we're sourcing — copied from a lead requirement line. No price here
 * (that's what we're asking vendors for); vendor prices live in
 * rfq_vendor_price.
 */
@Entity(RFQ_LINE_COLLECTION_NAME)
export class RfqLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    rfq_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    product_id?: string;

    /** Source lead line (traceability). */
    @Column({ type: 'uuid', nullable: true })
    lead_line_id?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    customer_reference?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    @Column({ type: 'varchar', length: 15, nullable: true })
    hs_code?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    /** Whether this product is requested from the (single) RFQ vendor — the
     *  per-line export checkbox on the RFQ page. */
    @Column({ type: 'boolean', default: false })
    checked: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RfqLineDoc = RfqLineEntity;
