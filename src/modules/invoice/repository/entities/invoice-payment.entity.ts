import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { INVOICE_PAYMENT_COLLECTION_NAME } from '../../constants/invoice.entity.constant';

/**
 * Append-only payment receipt log. Each row is one inflow against an
 * invoice. Status (PARTIALLY_PAID / PAID) is derived from the sum of
 * non-voided payments vs invoice.grand_total — never set directly.
 *
 * Voiding a payment is soft (`voided_at` + `voided_by`); we keep the
 * row for audit. Amount is in the invoice's currency.
 */
@Entity(INVOICE_PAYMENT_COLLECTION_NAME)
export class InvoicePaymentEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    invoice_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'date', nullable: false })
    payment_date: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false })
    amount: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    /** "bank_transfer" / "lc" / "cash" / "cheque" / "other" — free-form. */
    @Column({ type: 'varchar', length: 30, nullable: true })
    method?: string;

    /** UTR / wire / LC ref / cheque no. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    reference?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Receipt voucher number (STIPL/RCP/0001/FY), assigned once at creation
     *  and kept stable for the life of the payment row (even if voided). */
    @Column({ type: 'varchar', length: 60, nullable: true })
    receipt_voucher_no?: string;

    /** Company bank account the money was RECEIVED into (+ a name snapshot so
     *  it survives if the bank is later edited/removed). */
    @Column({ type: 'uuid', nullable: true })
    company_bank_account_id?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    bank_name?: string;

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

export type InvoicePaymentDoc = InvoicePaymentEntity;
