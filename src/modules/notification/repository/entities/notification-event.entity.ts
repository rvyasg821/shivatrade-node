import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { NOTIFICATION_EVENTS_TABLE } from '../../constants/notification.entity.constant';
import {
    ENUM_NOTIFICATION_EVENT_TYPE,
    ENUM_NOTIFICATION_CHANNEL,
    ENUM_NOTIFICATION_RECIPIENT_TYPE,
    ENUM_NOTIFICATION_MODULE,
} from '../../enums/notification.enum';

@Entity(NOTIFICATION_EVENTS_TABLE)
@Unique(['event_key'])
export class NotificationEventEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    event_key: string; // e.g. LEAVE_REQUESTED, SHIFT_ASSIGNED

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    module: string; // ENUM_NOTIFICATION_MODULE values

    @Column({ type: 'varchar', length: 50, nullable: false, default: ENUM_NOTIFICATION_EVENT_TYPE.COMPANY })
    event_type: string; // 'system' | 'company'

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string; // Human-readable: "Leave Request Submitted"

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'jsonb', nullable: false, default: '["email"]' })
    default_channels: string[]; // ["email"] or ["email", "sms"]

    @Column({ type: 'varchar', length: 50, nullable: false, default: ENUM_NOTIFICATION_RECIPIENT_TYPE.ADMIN })
    recipient_type: string; // 'employee' | 'admin' | 'both' | 'all_location_employees'

    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    variables: string[]; // Available placeholders: ["employee_name", "leave_type", ...]

    @Column({ type: 'boolean', default: true })
    is_active: boolean; // System-level kill switch
}

export type NotificationEventDoc = NotificationEventEntity;
