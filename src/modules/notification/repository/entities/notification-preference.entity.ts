import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { NOTIFICATION_PREFERENCES_TABLE } from '../../constants/notification.entity.constant';
import { ENUM_NOTIFICATION_TEMPLATE_LEVEL } from '../../enums/notification.enum';

@Entity(NOTIFICATION_PREFERENCES_TABLE)
@Unique(['event_key', 'level', 'company_id', 'location_id'])
export class NotificationPreferenceEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    event_key: string; // FK to notification_events.event_key

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false })
    level: string; // 'company' | 'location'

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string; // NULL for company-level

    @Column({ type: 'boolean', default: true })
    email_enabled: boolean;

    @Column({ type: 'boolean', default: false })
    sms_enabled: boolean;

    @Column({ type: 'boolean', default: false })
    whatsapp_enabled: boolean;

    // Recipient-type matrix — who should receive this event
    @Column({ type: 'boolean', default: false })
    notify_company_admin: boolean;

    @Column({ type: 'boolean', default: true })
    notify_location_admin: boolean;

    @Column({ type: 'boolean', default: true })
    notify_employee: boolean;
}

export type NotificationPreferenceDoc = NotificationPreferenceEntity;
