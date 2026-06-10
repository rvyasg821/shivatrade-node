import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { RFQ_VENDOR_COLLECTION_NAME } from '../../constants/rfq.entity.constant';
import { ENUM_RFQ_VENDOR_STATUS } from '../../enums/rfq.enum';

/** A vendor invited to quote on an RFQ. */
@Entity(RFQ_VENDOR_COLLECTION_NAME)
export class RfqVendorEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    rfq_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_RFQ_VENDOR_STATUS.INVITED })
    status: ENUM_RFQ_VENDOR_STATUS;

    /** When the "please quote" doc was issued to this vendor. */
    @Column({ type: 'timestamptz', nullable: true })
    sent_at?: Date;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Per-vendor export checkbox state — the rfq_line_ids ticked for THIS
     *  vendor's request sheet. Each vendor keeps its own selection (replaces the
     *  single per-line `checked` flag, which could only hold one vendor). */
    @Column({ type: 'simple-array', nullable: true })
    checked_line_ids?: string[];

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RfqVendorDoc = RfqVendorEntity;
