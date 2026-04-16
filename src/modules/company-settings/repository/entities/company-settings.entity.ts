import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { COMPANY_SETTINGS_TABLE } from '../../constants/company-settings.entity.constant';

@Entity(COMPANY_SETTINGS_TABLE)
@Unique(['company_id', 'location_id'])
export class CompanySettingsEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string; // NULL = company-wide default

    // ── SMTP ──
    @Column({ type: 'boolean', default: false })
    smtp_enabled: boolean;

    @Column({ type: 'varchar', nullable: true })
    smtp_host: string;

    @Column({ type: 'int', default: 587 })
    smtp_port: number;

    @Column({ type: 'varchar', nullable: true })
    smtp_username: string;

    @Column({ type: 'text', nullable: true })
    smtp_password: string; // encrypted

    @Column({ type: 'varchar', nullable: true })
    smtp_from_email: string;

    @Column({ type: 'varchar', nullable: true })
    smtp_from_name: string;

    @Column({ type: 'boolean', default: false })
    smtp_secure: boolean;

    // ── SMS ──
    @Column({ type: 'boolean', default: false })
    sms_enabled: boolean;

    @Column({ type: 'varchar', nullable: true })
    sms_provider: string; // 'twilio' | 'vonage'

    @Column({ type: 'text', nullable: true })
    sms_api_key: string; // encrypted

    @Column({ type: 'text', nullable: true })
    sms_api_secret: string; // encrypted

    @Column({ type: 'varchar', nullable: true })
    sms_from_number: string;

    // ── WhatsApp ──
    @Column({ type: 'boolean', default: false })
    whatsapp_enabled: boolean;

    @Column({ type: 'varchar', nullable: true })
    whatsapp_provider: string; // 'twilio' | 'meta'

    @Column({ type: 'text', nullable: true })
    whatsapp_api_key: string; // encrypted

    @Column({ type: 'text', nullable: true })
    whatsapp_api_secret: string; // encrypted (Twilio auth token)

    @Column({ type: 'varchar', nullable: true })
    whatsapp_from_number: string;

    // ── Code Generation ──
    @Column({ type: 'varchar', length: 10, default: 'manual' })
    location_code_mode: string; // 'manual' | 'auto'

    @Column({ type: 'varchar', length: 10, default: '' })
    location_code_prefix: string;

    @Column({ type: 'int', default: 1 })
    location_code_next_seq: number;

    @Column({ type: 'varchar', length: 10, default: 'manual' })
    employee_code_mode: string; // 'manual' | 'auto'

    @Column({ type: 'varchar', length: 10, default: '' })
    employee_code_prefix: string;

    @Column({ type: 'int', default: 1 })
    employee_code_next_seq: number;

    // ── Branding ──
    @Column({ type: 'varchar', nullable: true })
    logo_url: string;

    @Column({ type: 'varchar', nullable: true })
    company_display_name: string;

    @Column({ type: 'text', nullable: true })
    footer_address: string;

    @Column({ type: 'text', nullable: true })
    footer_contact: string;

    @Column({ type: 'text', nullable: true })
    footer_extra: string;

    // ── Compliance Settings ──
    @Column({ type: 'jsonb', nullable: true, default: null })
    compliance_config: {
        rtw_check_reminder_days?: number;
        visa_reminder_1st_days?: number;
        visa_reminder_2nd_days?: number;
        visa_reminder_3rd_days?: number;
        ukvi_deadline_alert_days?: string; // comma-separated e.g. "5,3,1"
        personal_verification_months?: number;
        additional_notification_emails?: string;
    };
}

export type CompanySettingsDoc = CompanySettingsEntity;
