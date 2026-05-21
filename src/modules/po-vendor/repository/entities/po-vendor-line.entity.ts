import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PO_VENDOR_LINE_COLLECTION_NAME } from '../../constants/po-vendor.entity.constant';

/**
 * POV line — one row per PO line being covered.
 *
 * `short_qty` and `undispatched_qty` are NOT stored; they are derived
 * in the service layer from these three qty columns (POV plan §9):
 *   short_qty        = dispatched_qty − received_qty   (loss, never recovered)
 *   undispatched_qty = ordered_qty    − dispatched_qty (recoverable via a new POV
 *                                                       manually created against
 *                                                       the parent PO)
 */
@Entity(PO_VENDOR_LINE_COLLECTION_NAME)
export class PoVendorLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    po_vendor_id: string;

    /** Hard link back to PO line. Drives pending_qty arithmetic. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    purchase_order_line_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Snapshot of description at POV creation. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Snapshot of HSN. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    hsn_code?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** Snapshot of tax rate — POV does not do tax math; this is for reporting. */
    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_pct: string;

    /** Snapshot from PO line — never recomputed. */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    /** Quantity this POV covers from the PO line. */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    ordered_qty: string;

    /** Set on Dispatch action; capped at `ordered_qty`. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 4,
        nullable: false,
        default: 0,
    })
    dispatched_qty: string;

    /** Set on Receive action; capped at `dispatched_qty`. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 4,
        nullable: false,
        default: 0,
    })
    received_qty: string;

    /** Informational: `ordered_qty × unit_price` (POV plan §6.2). */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    line_total: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type PoVendorLineDoc = PoVendorLineEntity;
