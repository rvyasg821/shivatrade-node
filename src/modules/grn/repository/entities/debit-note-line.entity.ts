import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { DEBIT_NOTE_LINE_COLLECTION_NAME } from '../../constants/grn.entity.constant';

/**
 * Debit Note line — one returned item, seeded from a GRN line that had
 * rejected_qty > 0. `returned_qty` defaults to the GRN's rejected_qty (but is
 * editable, capped at rejected_qty). `line_total = returned_qty × unit_price`.
 */
@Entity(DEBIT_NOTE_LINE_COLLECTION_NAME)
export class DebitNoteLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    debit_note_id: string;

    /** Source GRN line (traceability). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    grn_line_id?: string;

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
    part_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** Snapshot of the GRN line's rejected qty (the cap for returned_qty). */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    rejected_qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    returned_qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    unit_price: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    line_total: string;

    @Column({ type: 'varchar', length: 300, nullable: true })
    remarks?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type DebitNoteLineDoc = DebitNoteLineEntity;
