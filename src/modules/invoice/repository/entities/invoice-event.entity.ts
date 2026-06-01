import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_INVOICE_EVENT_TYPE } from '@modules/invoice/enums/invoice.enum';
import { INVOICE_EVENT_COLLECTION_NAME } from '../../constants/invoice.entity.constant';

/**
 * Append-only timeline of manual invoice tracking events
 * (SHIPPING_INVOICE_MERGE_PLAN §8 — re-homed from shipping_events).
 *
 * Manual events only — there are no system lifecycle events. Operators add
 * them from the invoice "Tracking" tab; each event can carry one attachment
 * and can be retracted (soft_delete) with a mandatory reason.
 */
@Entity(INVOICE_EVENT_COLLECTION_NAME)
export class InvoiceEventEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    invoice_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'varchar', length: 40, nullable: false })
    type: ENUM_INVOICE_EVENT_TYPE;

    /** Free-text label when type=OTHER. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    type_other?: string;

    @Column({ type: 'timestamp with time zone', nullable: false })
    occurred_at: Date;

    /** Free text — port, checkpoint, customs office, transhipment hub. */
    @Column({ type: 'varchar', length: 200, nullable: true })
    location?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    /** Optional single attachment per event (relative path under static
     *  root, e.g. `files/invoice-events/<file>`). FE prepends PDF URL base. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    attachment_url?: string;

    /** When `soft_delete` was flipped true. */
    @Column({ type: 'timestamp with time zone', nullable: true })
    deleted_at?: Date;

    /** User who retracted the event. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    deleted_by_user_id?: string;

    /** Required reason captured at retraction — preserves chain-of-custody. */
    @Column({ type: 'text', nullable: true })
    deleted_reason?: string;
}

export type InvoiceEventDoc = InvoiceEventEntity;
