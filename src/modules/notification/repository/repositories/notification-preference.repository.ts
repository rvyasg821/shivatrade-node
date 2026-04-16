import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { NotificationPreferenceEntity } from '../entities/notification-preference.entity';
import { NotificationEventEntity } from '../entities/notification-event.entity';
import { ENUM_NOTIFICATION_RECIPIENT_TYPE } from '../../enums/notification.enum';

@Injectable()
export class NotificationPreferenceRepository extends DatabaseObjectIdRepositoryBase<NotificationPreferenceEntity> {
    constructor(
        @InjectDatabaseModel(NotificationPreferenceEntity)
        private readonly repo: Repository<NotificationPreferenceEntity>,
        @InjectDatabaseModel(NotificationEventEntity)
        private readonly eventRepo: Repository<NotificationEventEntity>,
    ) {
        super(repo);
    }

    /**
     * Map a notification_events.recipient_type tag → recipient-type matrix defaults.
     * Used as the fallback when no per-company preference row exists.
     */
    private defaultMatrixForEvent(eventRecipientType?: string): {
        notify_employee: boolean;
        notify_location_admin: boolean;
        notify_company_admin: boolean;
    } {
        switch (eventRecipientType) {
            case ENUM_NOTIFICATION_RECIPIENT_TYPE.EMPLOYEE:
                // Notifications about an employee's own action — only the employee
                return { notify_employee: true, notify_location_admin: false, notify_company_admin: false };
            case ENUM_NOTIFICATION_RECIPIENT_TYPE.ADMIN:
                // Action that needs admin attention (leave request, swap request, etc.)
                return { notify_employee: false, notify_location_admin: true, notify_company_admin: false };
            case ENUM_NOTIFICATION_RECIPIENT_TYPE.BOTH:
                return { notify_employee: true, notify_location_admin: true, notify_company_admin: false };
            case ENUM_NOTIFICATION_RECIPIENT_TYPE.ALL_LOCATION_EMPLOYEES:
                return { notify_employee: true, notify_location_admin: false, notify_company_admin: false };
            default:
                return { notify_employee: true, notify_location_admin: true, notify_company_admin: false };
        }
    }

    /**
     * Resolve preferences with fallback: location → company → defaults
     * Returns channel toggles AND recipient-type toggles.
     */
    async resolvePreference(
        eventKey: string,
        companyId: string,
        locationId?: string,
    ): Promise<{
        email_enabled: boolean;
        sms_enabled: boolean;
        whatsapp_enabled: boolean;
        notify_company_admin: boolean;
        notify_location_admin: boolean;
        notify_employee: boolean;
    }> {
        const pick = (p: NotificationPreferenceEntity) => ({
            email_enabled: p.email_enabled,
            sms_enabled: p.sms_enabled,
            whatsapp_enabled: p.whatsapp_enabled,
            notify_company_admin: p.notify_company_admin ?? false,
            notify_location_admin: p.notify_location_admin ?? true,
            notify_employee: p.notify_employee ?? true,
        });

        // Try location-level
        if (locationId) {
            const locationPref = await this.findOne({
                event_key: eventKey,
                level: 'location',
                company_id: companyId,
                location_id: locationId,
                deleted: false,
            }) as NotificationPreferenceEntity | null;
            if (locationPref) return pick(locationPref);
        }

        // Try company-level
        const companyPref = await this.findOne({
            event_key: eventKey,
            level: 'company',
            company_id: companyId,
            deleted: false,
        }) as NotificationPreferenceEntity | null;
        if (companyPref) return pick(companyPref);

        // No saved preference — derive defaults from the event's recipient_type tag
        let eventRecipientType: string | undefined;
        try {
            const event = await this.eventRepo.findOne({ where: { event_key: eventKey } as any });
            eventRecipientType = event?.recipient_type;
        } catch {
            // ignore — fall through to catch-all defaults
        }
        const matrix = this.defaultMatrixForEvent(eventRecipientType);
        return {
            email_enabled: true,
            sms_enabled: false,
            whatsapp_enabled: false,
            ...matrix,
        };
    }

    async findByCompany(companyId: string): Promise<NotificationPreferenceEntity[]> {
        return this.findAll({
            company_id: companyId,
            level: 'company',
            deleted: false,
        }) as Promise<NotificationPreferenceEntity[]>;
    }

    async findByLocation(companyId: string, locationId: string): Promise<NotificationPreferenceEntity[]> {
        return this.findAll({
            company_id: companyId,
            location_id: locationId,
            level: 'location',
            deleted: false,
        }) as Promise<NotificationPreferenceEntity[]>;
    }
}
