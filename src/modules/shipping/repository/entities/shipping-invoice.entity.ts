import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { SHIPPING_INVOICE_COLLECTION_NAME } from '../../constants/shipping.entity.constant';

/**
 * Join table: one shipment can carry multiple invoices (LCL consolidation).
 * Each Invoice can be attached to at most one shipment at a time - the
 * unique constraint on `invoice_id` enforces 1-shipping-per-invoice; service
 * detaches the old link before attaching to a new shipping if reassignment
 * is allowed (Phase 2).
 */
@Entity(SHIPPING_INVOICE_COLLECTION_NAME)
@Unique('UQ_shipping_invoice_invoice', ['invoice_id'])
export class ShippingInvoiceEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    shipping_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    invoice_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Snapshot for fast listing without joining invoices on every page. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    invoice_voucher_no?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
    invoice_grand_total?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    invoice_currency_code?: string;
}

export type ShippingInvoiceDoc = ShippingInvoiceEntity;
