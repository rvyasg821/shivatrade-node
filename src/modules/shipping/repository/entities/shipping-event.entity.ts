import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_SHIPPING_EVENT_TYPE } from '@modules/shipping/enums/shipping.enum';
import { SHIPPING_EVENT_COLLECTION_NAME } from '../../constants/shipping.entity.constant';

/**
 * Append-only timeline of shipping events.
 *
 * System events (is_system=true) are auto-emitted by the service at every
 * status flip (booked / dispatched / arrived / cleared / delivered /
 * cancelled / updated). Operators can also add manual events post-BOOKED.
 * Manual events can be retracted (soft_delete), system events cannot.
 */
@Entity(SHIPPING_EVENT_COLLECTION_NAME)
export class ShippingEventEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    shipping_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'varchar', length: 40, nullable: false })
    type: ENUM_SHIPPING_EVENT_TYPE;

    /** Free-text label when type=OTHER (carrier app sometimes has bespoke labels). */
    @Column({ type: 'varchar', length: 120, nullable: true })
    type_other?: string;

    @Column({ type: 'timestamp with time zone', nullable: false })
    occurred_at: Date;

    /** Free text - port, checkpoint, customs office, transhipment hub. */
    @Column({ type: 'varchar', length: 200, nullable: true })
    location?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_system: boolean;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ShippingEventDoc = ShippingEventEntity;
