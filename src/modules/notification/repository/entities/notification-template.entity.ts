import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { NOTIFICATION_TEMPLATES_TABLE } from '../../constants/notification.entity.constant';
import {
    ENUM_NOTIFICATION_CHANNEL,
    ENUM_NOTIFICATION_TEMPLATE_LEVEL,
} from '../../enums/notification.enum';

@Entity(NOTIFICATION_TEMPLATES_TABLE)
@Unique(['event_key', 'channel', 'level', 'company_id', 'location_id'])
export class NotificationTemplateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    event_key: string; // FK to notification_events.event_key

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_NOTIFICATION_CHANNEL.EMAIL })
    channel: string; // 'email' | 'sms' | 'whatsapp'

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_NOTIFICATION_TEMPLATE_LEVEL.SYSTEM })
    level: string; // 'system' | 'company' | 'location'

    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_id: string; // NULL for system-level

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string; // NULL for system/company-level

    @Column({ type: 'varchar', length: 500, nullable: true })
    subject: string; // Email subject (null for SMS/WhatsApp)

    @Column({ type: 'text', nullable: false })
    body: string; // Template body with {{variable}} placeholders

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Column({ type: 'varchar', length: 10, default: 'en' })
    language: string; // Future: multi-language support
}

export type NotificationTemplateDoc = NotificationTemplateEntity;
