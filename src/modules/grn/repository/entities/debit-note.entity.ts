import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_DEBIT_NOTE_STATUS } from '../../enums/debit-note.enum';
import { DEBIT_NOTE_COLLECTION_NAME } from '../../constants/grn.entity.constant';

/**
 * Debit Note header — raised against a confirmed GRN to return QC-rejected
 * goods to the vendor. Snapshots the GRN / POV reference chain + currency so
 * the document reads standalone. Read-only over the GRN; never mutates it.
 */
@Entity(DEBIT_NOTE_COLLECTION_NAME)
export class DebitNoteEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    /** Display voucher e.g. `STIPL/DN/0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    // ── Source GRN ──
    @Index()
    @Column({ type: 'uuid', nullable: false })
    grn_id: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    grn_voucher_no?: string;

    // ── Reference chain snapshot (GRN → POV → SO) ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    po_vendor_id?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    po_vendor_voucher_no?: string;

    @Column({ type: 'uuid', nullable: true })
    purchase_order_id?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    purchase_order_voucher_no?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    @Column({ type: 'date', nullable: false })
    dn_date: string;

    // ── Money ──
    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
    exchange_rate?: string;

    /** Σ of line totals (returned_qty × unit_price), in the POV currency. */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    total_amount: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_DEBIT_NOTE_STATUS.DRAFT,
    })
    status: ENUM_DEBIT_NOTE_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type DebitNoteDoc = DebitNoteEntity;
