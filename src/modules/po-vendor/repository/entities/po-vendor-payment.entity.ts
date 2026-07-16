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

    /** GROSS amount — the vendor's bill this payment settles. This is what
     *  reduces the POV payable (TDS is paid to the govt on the vendor's behalf,
     *  so the vendor is still "paid in full"). Cash out of the bank = net_paid. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false })
    amount: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    // ── Paying company bank account (#7 — "from which account") ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_bank_account_id?: string;

    /** Frozen snapshot of the company bank at payment time (so the voucher is
     *  stable even if the master is later edited). */
    @Column({ type: 'jsonb', nullable: true })
    company_bank_snapshot?: {
        bank_name?: string;
        account_holder_name?: string;
        account_number?: string;
        ifsc?: string;
        branch_name?: string;
        account_type?: string;
    };

    // ── TDS (Tax Deducted at Source) — Gross → TDS → Net paid (#7) ──
    /** Section under which TDS was deducted, e.g. '194C', '194J'. Null = no TDS. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    tds_section?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: false, default: 0 })
    tds_rate_pct: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    tds_amount: string;

    /** amount (Gross) − tds_amount. The cash actually paid to the vendor. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    net_paid: string;

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
