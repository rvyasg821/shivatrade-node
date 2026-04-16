import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';

@Injectable()
export class NotificationTemplateRepository extends DatabaseObjectIdRepositoryBase<NotificationTemplateEntity> {
    constructor(
        @InjectDatabaseModel(NotificationTemplateEntity)
        private readonly repo: Repository<NotificationTemplateEntity>
    ) {
        super(repo);
    }

    /**
     * Resolve template with fallback: location → company → system
     */
    async resolveTemplate(
        eventKey: string,
        channel: string,
        companyId?: string,
        locationId?: string,
    ): Promise<NotificationTemplateEntity | null> {
        // Try location-level first
        if (locationId && companyId) {
            const locationTemplate = await this.findOne({
                event_key: eventKey,
                channel,
                level: 'location',
                company_id: companyId,
                location_id: locationId,
                is_active: true,
                deleted: false,
            }) as NotificationTemplateEntity | null;
            if (locationTemplate) return locationTemplate;
        }

        // Try company-level
        if (companyId) {
            const companyTemplate = await this.findOne({
                event_key: eventKey,
                channel,
                level: 'company',
                company_id: companyId,
                is_active: true,
                deleted: false,
            }) as NotificationTemplateEntity | null;
            if (companyTemplate) return companyTemplate;
        }

        // Fall back to system-level
        return this.findOne({
            event_key: eventKey,
            channel,
            level: 'system',
            is_active: true,
            deleted: false,
        }) as Promise<NotificationTemplateEntity | null>;
    }

    async findByEventAndCompany(
        eventKey: string,
        companyId: string,
        locationId?: string,
    ): Promise<NotificationTemplateEntity[]> {
        const find: any = { event_key: eventKey, deleted: false };
        const results: NotificationTemplateEntity[] = [];

        // Get system templates
        const systemTemplates = await this.findAll({
            ...find,
            level: 'system',
        }) as NotificationTemplateEntity[];
        results.push(...systemTemplates);

        // Get company templates
        const companyTemplates = await this.findAll({
            ...find,
            level: 'company',
            company_id: companyId,
        }) as NotificationTemplateEntity[];
        results.push(...companyTemplates);

        // Get location templates
        if (locationId) {
            const locationTemplates = await this.findAll({
                ...find,
                level: 'location',
                company_id: companyId,
                location_id: locationId,
            }) as NotificationTemplateEntity[];
            results.push(...locationTemplates);
        }

        return results;
    }
}
