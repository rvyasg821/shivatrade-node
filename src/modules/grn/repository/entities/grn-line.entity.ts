import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { GRN_LINE_COLLECTION_NAME } from '../../constants/grn.entity.constant';

/**
 * GRN line — one received item, copied from a closed POV line. Snapshots the
 * order/dispatch/received quantities and adds the quality check
 * (accepted / rejected). `accepted_qty + rejected_qty` should equal
 * `received_qty`.
 */
@Entity(GRN_LINE_COLLECTION_NAME)
export class GrnLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    grn_id: string;

    /** Source POV line (traceability). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    po_vendor_line_id?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'varchar', length: 15, nullable: true })
    hsn_code?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    // ── Snapshot from POV line ──
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    ordered_qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    dispatched_qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    received_qty: string;

    // ── Quality check ──
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    accepted_qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    rejected_qty: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    batch_no?: string;

    @Column({ type: 'varchar', length: 300, nullable: true })
    remarks?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type GrnLineDoc = GrnLineEntity;
