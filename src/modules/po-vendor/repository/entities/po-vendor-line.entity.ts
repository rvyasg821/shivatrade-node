import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PO_VENDOR_LINE_COLLECTION_NAME } from '../../constants/po-vendor.entity.constant';

/**
 * POV line — one row per PO line being covered.
 *
 * `short_qty` and `undispatched_qty` are NOT stored; they are derived
 * in the service layer from these three qty columns (POV plan §9):
 *   short_qty        = dispatched_qty − received_qty   (loss, never recovered;
 *                                                       0 until a receipt
 *                                                       exists — an un-receipted
 *                                                       dispatch is in transit)
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

    /** Hard link back to PO line. Drives pending_qty arithmetic.
     *  Nullable since 2026-06: standalone POV lines have no parent PO line,
     *  so they carry their own product/qty/price snapshot below. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    purchase_order_line_id?: string;

    /** The source POV line this one re-orders, when this POV is a balance POV.
     *  Matching by line id (not product) keeps the arithmetic right when the
     *  same product appears on two lines. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    balance_of_po_vendor_line_id?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Snapshot of description at POV creation. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Snapshot of the part number at POV creation. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    part_no?: string;

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

    /** Per-line vendor discount %, applied before GST:
     *  line_total = ordered_qty × unit_price × (1 − discount_pct/100). */
    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: true,
        default: 0,
    })
    discount_pct?: string;

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

    // ── Tolerance & Three-Way Match (TOLERANCE_THREE_WAY_MATCH_PLAN.md §5.2) ──
    // Set when a pre-GRN price revision moves unit_price outside the
    // company's pov_price_tolerance_pct vs the source PO line's price. Read
    // by the vendor-payment three-way gate until edited back in range or
    // overridden.
    @Column({ type: 'boolean', default: false })
    tolerance_hold: boolean;

    @Column({ type: 'text', nullable: true })
    tolerance_hold_reason?: string;

    @Column({ type: 'uuid', nullable: true })
    tolerance_override_by?: string;

    @Column({ type: 'timestamp with time zone', nullable: true })
    tolerance_override_at?: Date;
}

export type PoVendorLineDoc = PoVendorLineEntity;
