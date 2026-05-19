import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PURCHASE_ORDER_STATUS } from '../../enums/purchase-order.enum';
import { PURCHASE_ORDER_COLLECTION_NAME } from '../../constants/purchase-order.entity.constant';

@Entity(PURCHASE_ORDER_COLLECTION_NAME)
export class PurchaseOrderEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/OS0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    /** Snapshot of vendor address used at PO time — defaults to vendor's
     *  `is_default = true` address. */
    @Column({ type: 'uuid', nullable: true })
    vendor_address_id?: string;

    /** Customer auto-linked from source PFI / Quotation (traceability only). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    customer_id?: string;

    /** Source Quotation - set when PO was created via createFromQuotation. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    quotation_id?: string;

    /** Source PFI - set when PO was created via createFromPfi. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    pfi_id?: string;

    @Column({ type: 'date', nullable: false })
    po_date: string;

    @Column({ type: 'date', nullable: true })
    expected_delivery_date?: string;

    /** Forwarder warehouse / port — pre-fills from
     *  `company.default_po_delivery_address`. */
    @Column({ type: 'text', nullable: false })
    delivery_address: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    payment_terms?: string;

    /** Incoterms (free-text or enum) */
    @Column({ type: 'varchar', length: 100, nullable: true })
    delivery_terms?: string;

    /** Renders on PDF */
    @Column({ type: 'text', nullable: true })
    notes_to_vendor?: string;

    /** Hidden from PDF */
    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    /** Always `INR` for v1 (domestic procurement only). */
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false, default: 'INR' })
    currency_code: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 6,
        nullable: false,
        default: 1,
    })
    exchange_rate: string;

    // ── Costing snapshot (recomputed on save) ──
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    subtotal: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    cgst_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    sgst_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    igst_total: string;

    /** Sum of CGST + SGST + IGST */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_total: string;

    /** Whole-rupee rounding adjustment (GST-compliant "Round Off" line). */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    round_off: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    grand_total: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_PURCHASE_ORDER_STATUS.DRAFT,
    })
    status: ENUM_PURCHASE_ORDER_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PurchaseOrderDoc = PurchaseOrderEntity;
