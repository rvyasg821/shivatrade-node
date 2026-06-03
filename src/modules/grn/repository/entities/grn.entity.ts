import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_GRN_STATUS } from '../../enums/grn.enum';
import { GRN_COLLECTION_NAME } from '../../constants/grn.entity.constant';

/**
 * Goods Receipt Note header — raised against a closed POV (vendor shipment).
 * Snapshots the reference chain (VPO / SO / Customer-PO) so the document and
 * PDF read standalone. Read-only over the POV; never mutates it.
 */
@Entity(GRN_COLLECTION_NAME)
export class GrnEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    /** Display voucher e.g. `STIPL/GRN0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    // ── Source POV (vendor shipment) ──
    @Index()
    @Column({ type: 'uuid', nullable: false })
    po_vendor_id: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    po_vendor_voucher_no?: string;

    // ── Reference chain snapshot (read from POV → PO) ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    purchase_order_id?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    purchase_order_voucher_no?: string;

    /** Buyer's own PO number, snapshotted from the Sales Order (S4). */
    @Column({ type: 'varchar', length: 100, nullable: true })
    customer_po_number?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    @Column({ type: 'date', nullable: false })
    grn_date: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_GRN_STATUS.DRAFT,
    })
    status: ENUM_GRN_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type GrnDoc = GrnEntity;
