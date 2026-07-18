import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../../enums/adjustment-note.enum';
import { ADJUSTMENT_NOTE_COLLECTION_NAME } from '../../constants/adjustment-note.entity.constant';

/**
 * An off-document debit/credit posted straight to a customer or vendor ledger
 * (client #8). No PO/Sales linkage by design — the free-text `reason` carries
 * any reference. Post-on-save; reversal is a soft Void (kept for audit),
 * mirroring PoVendorPayment. The Customer/Vendor ledgers (#9/#10) read these
 * live, so a create/void reflects immediately with no stored balance.
 */
@Entity(ADJUSTMENT_NOTE_COLLECTION_NAME)
export class AdjustmentNoteEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** STIPL/AN/0001/2026-27 — assigned at create, stable for the row's life. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    party_type: ENUM_ADJUSTMENT_PARTY_TYPE;

    /** FK → customer or vendor, per party_type. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    party_id: string;

    /** Frozen party label for the list/ledger (e.g. { name }). */
    @Column({ type: 'jsonb', nullable: true })
    party_snapshot?: { name?: string };

    @Column({ type: 'varchar', length: 6, nullable: false })
    direction: ENUM_ADJUSTMENT_DIRECTION;

    @Column({ type: 'date', nullable: false })
    note_date: string;

    /**
     * The BASE value, in the party's currency (customer: their ccy; vendor:
     * always INR). When GST applies (vendor + debit only), the money that
     * actually posts to the ledger is `amount + gst_amount` (see below).
     */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false })
    amount: string;

    /**
     * GST — populated ONLY on a VENDOR + DEBIT note (an Indian, INR claim back
     * on a vendor). Null everywhere else. `gst_amount = round2(amount ×
     * gst_rate / 100)`; the ledger posts `amount + gst_amount`.
     */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
    gst_rate?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
    gst_amount?: string;

    @Column({ type: 'varchar', length: 10, nullable: false, default: 'INR' })
    currency_code: string;

    /** Single free-text field — the client writes the full context here. */
    @Column({ type: 'text', nullable: false })
    reason: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    // ── Soft-void (kept for audit; removed from ledger totals) ──
    @Column({ type: 'timestamp with time zone', nullable: true })
    voided_at?: Date;

    @Column({ type: 'uuid', nullable: true })
    voided_by?: string;

    @Column({ type: 'text', nullable: true })
    voided_reason?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type AdjustmentNoteDoc = AdjustmentNoteEntity;
