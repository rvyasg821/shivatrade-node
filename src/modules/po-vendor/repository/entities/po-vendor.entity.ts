import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PO_VENDOR_STATUS } from '../../enums/po-vendor.enum';
import { PO_VENDOR_COLLECTION_NAME } from '../../constants/po-vendor.entity.constant';

@Entity(PO_VENDOR_COLLECTION_NAME)
export class PoVendorEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/POV0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    /** Source PO — must be `confirmed` (or `in_process`) at create time. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    purchase_order_id: string;

    /** Set on auto-spawned child POV after partial receipt (POV plan §2). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    parent_po_vendor_id?: string;

    /** Snapshot of vendor at POV creation — inherited from PO header. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    /** Snapshot of vendor address — inherited from PO header. */
    @Column({ type: 'uuid', nullable: true })
    vendor_address_id?: string;

    /** Captured on Dispatch action. */
    @Column({ type: 'date', nullable: true })
    dispatch_date?: string;

    @Column({ type: 'date', nullable: true })
    expected_arrival_date?: string;

    /** Captured on Receive action. */
    @Column({ type: 'date', nullable: true })
    actual_arrival_date?: string;

    // ── Transport / tracking ─────────────────────────────────────────────
    @Column({ type: 'varchar', length: 150, nullable: true })
    transporter_name?: string;

    @Column({ type: 'varchar', length: 40, nullable: true })
    vehicle_no?: string;

    /** Lorry Receipt / Bilty number. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    lr_no?: string;

    @Column({ type: 'date', nullable: true })
    lr_date?: string;

    @Column({ type: 'varchar', length: 40, nullable: true })
    eway_bill_no?: string;

    @Column({ type: 'date', nullable: true })
    eway_bill_date?: string;

    /** Snapshot text — pre-fills from PO header's delivery_address. */
    @Column({ type: 'text', nullable: false })
    delivery_address: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Hidden from any vendor-facing view (POV has no PDF in v1 — internal only). */
    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_PO_VENDOR_STATUS.DRAFT,
    })
    status: ENUM_PO_VENDOR_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PoVendorDoc = PoVendorEntity;
