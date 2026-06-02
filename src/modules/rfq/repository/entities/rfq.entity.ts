import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { RFQ_COLLECTION_NAME } from '../../constants/rfq.entity.constant';
import { ENUM_RFQ_STATUS } from '../../enums/rfq.enum';

/**
 * Request For Quotation (Vendor Sourcing) — created from a Lead's requirement
 * lines. We send a "please quote" doc to one or more vendors, capture their
 * per-line prices, and mark the best price per line. The selected prices then
 * seed a Quotation (cost → margin → selling).
 */
@Entity(RFQ_COLLECTION_NAME)
export class RfqEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** STIPL/RFQ0001/2026-27 */
    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    voucher_no?: string;

    /** Source lead (requirement). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    lead_id?: string;

    /** Denormalised for the list/header. */
    @Column({ type: 'varchar', length: 50, nullable: true })
    lead_voucher_no?: string;

    @Column({ type: 'date', nullable: true })
    rfq_date?: string;

    /** Internal notes / scope of supply. */
    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_RFQ_STATUS.DRAFT })
    status: ENUM_RFQ_STATUS;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RfqDoc = RfqEntity;
