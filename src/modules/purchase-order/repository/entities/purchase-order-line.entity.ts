import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PURCHASE_ORDER_LINE_COLLECTION_NAME } from '../../constants/purchase-order.entity.constant';

@Entity(PURCHASE_ORDER_LINE_COLLECTION_NAME)
export class PurchaseOrderLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    purchase_order_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Traceability back to source Quotation line (if PO created from Q). */
    @Column({ type: 'uuid', nullable: true })
    source_quotation_line_id?: string;

    /** Traceability back to source PFI line (if PO created from PFI). */
    @Column({ type: 'uuid', nullable: true })
    source_pfi_line_id?: string;

    /** Snapshot of product description at PO creation time. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Snapshot from product master. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    hsn_code?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** INR; pre-filled from
     *  `vendorPriceList.findCurrentPrice(companyId, vendorId, productId)`. */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: true,
        default: 0,
    })
    discount_pct?: string;

    /** Vendor GST rate (% e.g. 18). */
    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_pct: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    cgst: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    sgst: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    igst: string;

    /** Line subtotal pre-tax (qty × price − discount) */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    taxable: string;

    /** Including tax */
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

export type PurchaseOrderLineDoc = PurchaseOrderLineEntity;
