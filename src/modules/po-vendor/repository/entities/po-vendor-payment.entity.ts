import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PO_VENDOR_PAYMENT_COLLECTION_NAME } from '../../constants/po-vendor.entity.constant';

/**
 * Append-only vendor payment log. Each row is one outflow (advance or
 * part-payment) against a vendor PO. The POV's payment_status
 * (unpaid / partially_paid / paid) is derived from the sum of non-voided
 * payments vs the POV's live order value (payable) — never set directly.
 *
 * Voiding a payment is soft (`voided_at` + `voided_by`); the row is kept
 * for audit. Amount is in the POV's currency (home currency, ₹ by default).
 */
@Entity(PO_VENDOR_PAYMENT_COLLECTION_NAME)
export class PoVendorPaymentEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    po_vendor_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'date', nullable: false })
    payment_date: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false })
    amount: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    /** The vendor's invoice number this payment is against (free text). */
    @Column({ type: 'varchar', length: 120, nullable: true })
    invoice_number?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Payment voucher number (STIPL/PV/0001/FY), assigned once at creation
     *  and kept stable for the life of the payment row (even if voided). */
    @Column({ type: 'varchar', length: 60, nullable: true })
    payment_voucher_no?: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

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

export type PoVendorPaymentDoc = PoVendorPaymentEntity;
