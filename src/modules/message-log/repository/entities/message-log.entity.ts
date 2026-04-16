import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { MESSAGE_LOGS_TABLE } from '../../constants/message-log.constant';
import {
    ENUM_MESSAGE_LOG_CHANNEL,
    ENUM_MESSAGE_LOG_STATUS,
    ENUM_MESSAGE_LOG_RECIPIENT_TYPE,
} from '../../enums/message-log.enum';

@Entity(MESSAGE_LOGS_TABLE)
@Index(['company_id', 'channel', 'sent_at'])
@Index(['company_id', 'event_key', 'sent_at'])
export class MessageLogEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false })
    channel: string; // ENUM_MESSAGE_LOG_CHANNEL

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    event_key: string; // null for non-event sends (forgot password, signup OTP)

    @Column({ type: 'varchar', length: 30, nullable: false, default: ENUM_MESSAGE_LOG_RECIPIENT_TYPE.EXTERNAL })
    recipient_type: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    recipient_user_id: string;

    @Column({ type: 'varchar', length: 320, nullable: false })
    recipient_address: string; // email or phone

    @Column({ type: 'varchar', length: 200, nullable: true })
    recipient_name: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    subject: string; // email only

    @Column({ type: 'varchar', length: 600, nullable: true })
    body_preview: string; // first 500 chars (incl. HTML tags stripped for emails)

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_MESSAGE_LOG_STATUS.QUEUED })
    status: string;

    @Column({ type: 'text', nullable: true })
    error_message: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    provider: string; // nodemailer | azure | twilio | meta

    @Column({ type: 'varchar', length: 200, nullable: true })
    provider_message_id: string; // SMTP messageId, Twilio SID, Meta msg id

    @Column({ type: 'uuid', nullable: true })
    triggered_by_user_id: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    related_entity_type: string; // 'contract' | 'leave_request' | 'shift' | etc.

    @Column({ type: 'uuid', nullable: true })
    related_entity_id: string;

    @Index()
    @Column({ type: 'timestamptz', nullable: true })
    sent_at: Date;
}

export type MessageLogDoc = MessageLogEntity;
