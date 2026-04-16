import {
    Controller, Get, Put, Delete,
    Body, Param, Query, HttpStatus, HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { NotificationEventRepository } from '../repository/repositories/notification-event.repository';
import { NotificationPreferenceRepository } from '../repository/repositories/notification-preference.repository';
import { NotificationTemplateRepository } from '../repository/repositories/notification-template.repository';

@ApiTags('admin.notification')
@Controller({ version: '1', path: '/notification' })
export class NotificationAdminController {
    constructor(
        private readonly eventRepository: NotificationEventRepository,
        private readonly preferenceRepository: NotificationPreferenceRepository,
        private readonly templateRepository: NotificationTemplateRepository,
    ) {}

    // ============ EVENTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/events')
    async listEvents() {
        const events = await this.eventRepository.findAllActive();
        const grouped: Record<string, any[]> = {};
        for (const event of events) {
            const module = event.module || 'general';
            if (!grouped[module]) {
                grouped[module] = [];
            }
            grouped[module].push(event);
        }
        return { statusCode: 200, message: 'Success', data: grouped };
    }

    // ============ PREFERENCES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/preferences')
    async getPreferences(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_locationId') locationId?: string,
    ) {
        const events = await this.eventRepository.findAllActive();
        const preferences = await Promise.all(
            events.map(async (event) => {
                const pref = await this.preferenceRepository.resolvePreference(
                    event.event_key,
                    companyId,
                    locationId,
                );
                return {
                    event_key: event.event_key,
                    event_name: event.name,
                    module: event.module,
                    email_enabled: pref.email_enabled,
                    sms_enabled: pref.sms_enabled,
                    whatsapp_enabled: pref.whatsapp_enabled,
                    notify_employee: pref.notify_employee,
                    notify_location_admin: pref.notify_location_admin,
                    notify_company_admin: pref.notify_company_admin,
                };
            }),
        );
        return { statusCode: 200, message: 'Success', data: preferences };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/preferences')
    async updatePreferences(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: {
            preferences: Array<{
                event_key: string;
                email_enabled: boolean;
                sms_enabled: boolean;
                whatsapp_enabled: boolean;
                notify_employee?: boolean;
                notify_location_admin?: boolean;
                notify_company_admin?: boolean;
            }>;
        },
        @Query('_locationId') locationId?: string,
    ) {
        const level = locationId ? 'location' : 'company';

        for (const pref of body.preferences) {
            const existing = await this.preferenceRepository.findOne({
                event_key: pref.event_key,
                level,
                company_id: companyId,
                location_id: locationId || null,
                deleted: false,
            });
            const payload: any = {
                email_enabled: pref.email_enabled,
                sms_enabled: pref.sms_enabled,
                whatsapp_enabled: pref.whatsapp_enabled,
            };
            if (pref.notify_employee !== undefined) payload.notify_employee = pref.notify_employee;
            if (pref.notify_location_admin !== undefined) payload.notify_location_admin = pref.notify_location_admin;
            if (pref.notify_company_admin !== undefined) payload.notify_company_admin = pref.notify_company_admin;

            if (existing) {
                await this.preferenceRepository.update(existing, payload);
            } else {
                await this.preferenceRepository.create({
                    event_key: pref.event_key,
                    level,
                    company_id: companyId,
                    location_id: locationId || null,
                    ...payload,
                });
            }
        }

        return { statusCode: 200, message: 'Preferences updated' };
    }

    // ============ TEMPLATES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/templates/:eventKey')
    async getTemplates(
        @Param('eventKey') eventKey: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Query('_locationId') locationId?: string,
    ) {
        const templates = await this.templateRepository.findByEventAndCompany(
            eventKey,
            companyId,
            locationId,
        );
        return { statusCode: 200, message: 'Success', data: templates };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/templates/:eventKey')
    async upsertTemplate(
        @Param('eventKey') eventKey: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: { channel: 'email' | 'sms' | 'whatsapp'; subject?: string; body: string },
        @Query('_locationId') locationId?: string,
    ) {
        const level = locationId ? 'location' : 'company';

        const existing = await this.templateRepository.findOne({
            event_key: eventKey,
            channel: body.channel,
            level,
            company_id: companyId,
            location_id: locationId || null,
            deleted: false,
        });

        if (existing) {
            await this.templateRepository.update(existing, {
                subject: body.subject,
                body: body.body,
            });
            return { statusCode: 200, message: 'Template updated', data: existing };
        } else {
            const created = await this.templateRepository.create({
                event_key: eventKey,
                channel: body.channel,
                level,
                company_id: companyId,
                location_id: locationId || null,
                subject: body.subject,
                body: body.body,
            });
            return { statusCode: 200, message: 'Template created', data: created };
        }
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/templates/:id')
    async deleteTemplate(@Param('id') id: string) {
        const template = await this.templateRepository.findOne({ _id: id, deleted: false });
        if (!template) {
            return { statusCode: 404, message: 'Template not found' };
        }
        if ((template as any).level === 'system') {
            return { statusCode: 400, message: 'Cannot delete system-level templates' };
        }
        await this.templateRepository.softDelete(template);
        return { statusCode: 200, message: 'Template deleted' };
    }
}
