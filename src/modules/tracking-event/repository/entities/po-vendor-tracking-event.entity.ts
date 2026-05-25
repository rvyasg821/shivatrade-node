import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PO_VENDOR_TRACKING_EVENT_COLLECTION_NAME } from '../../constants/tracking-event.entity.constant';

/**
 * Append-only event log row attached to a single POV (Tracking plan §4).
 * Immutable once created - service never updates fields and never sets
 * `soft_delete = true` (§7). The column exists for schema consistency.
 */
@Entity(PO_VENDOR_TRACKING_EVENT_COLLECTION_NAME)
export class PoVendorTrackingEventEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Parent POV. Tracking is strictly per-POV (§1). */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    po_vendor_id: string;

    /** When the event happened (user-entered; FE defaults to now). */
    @Index()
    @Column({ type: 'timestamptz', nullable: false })
    event_at: Date;

    /** Enum value from `ENUM_TRACKING_EVENT_TYPE`. Stored as varchar so
     *  adding a new option is a constants change, not a migration. */
    @Index()
    @Column({ type: 'varchar', length: 40, nullable: false })
    event_type: string;

    /** Free-text label when `event_type = 'other'`. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    event_type_other?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    location?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Single optional attachment per event (§9). Stored as a relative
     *  path under the static root e.g. `files/tracking/<filename>`; the
     *  frontend prepends REACT_APP_BACKEND_REST_API_URL_PDF for display. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    attachment_url?: string;

    /** Set true at create time if the parent POV was already `closed`
     *  (§6 / §17.3). Drives the "Post-closure" badge. */
    @Index()
    @Column({ type: 'boolean', default: false })
    is_post_closure: boolean;

    /** True for auto-generated lifecycle events (pov_created, pov_dispatched,
     *  pov_received, pov_cancelled, pov_updated). UI badges these as "system"
     *  and hides the retract icon — users cannot delete system events. */
    @Index()
    @Column({ type: 'boolean', default: false })
    is_system: boolean;

    /** Ops user who logged the event. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    created_by: string;

    /** Soft-deleted (retracted) events stay in the table — Option D
     *  audit pattern: UI strikes through them and shows who retracted +
     *  why. Listing queries do NOT filter on this column so the row
     *  remains visible in both the per-POV timeline and the sidebar feed.
     */
    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    /** Set when `soft_delete` is flipped to true. */
    @Column({ type: 'timestamptz', nullable: true })
    deleted_at?: Date;

    /** User who retracted the event. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    deleted_by_user_id?: string;

    /** Required reason captured at retraction time — surfaces in the UI
     *  beneath the struck-through event so an auditor can see *why* it
     *  was retracted (chain-of-custody preserved). */
    @Column({ type: 'text', nullable: true })
    deleted_reason?: string;
}

export type PoVendorTrackingEventDoc = PoVendorTrackingEventEntity;
