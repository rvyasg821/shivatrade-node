import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShiftTemplateRepository } from '../repository/repositories/shift-template.repository';
import { ShiftTemplateEntity } from '../repository/entities/shift-template.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ShiftTemplateService {
    constructor(private readonly templateRepository: ShiftTemplateRepository) {}

    /**
     * Returns templates visible to the caller:
     *  - Company-wide templates (location_id IS NULL)
     *  - Templates belonging to the caller's location (if locationId provided)
     */
    async findAll(companyId: string, locationId?: string | null): Promise<ShiftTemplateEntity[]> {
        const find: Record<string, any> = { company_id: companyId, soft_delete: false };
        if (locationId) {
            // Return company-wide (null) OR the specific location's templates
            find.$or = [{ location_id: null }, { location_id: locationId }];
        }
        // If no locationId: Company Admin — return all templates (no location_id filter)
        return this.templateRepository.findAll(
            find,
            { order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<ShiftTemplateEntity[]>;
    }

    async findActiveByCompany(companyId: string, locationId?: string | null): Promise<ShiftTemplateEntity[]> {
        const find: Record<string, any> = { company_id: companyId, is_active: true, soft_delete: false };
        if (locationId) {
            find.$or = [{ location_id: null }, { location_id: locationId }];
        }
        return this.templateRepository.findAll(
            find,
            { order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<ShiftTemplateEntity[]>;
    }

    async findOneById(id: string): Promise<ShiftTemplateEntity> {
        const item = await this.templateRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Shift template not found');
        return item as ShiftTemplateEntity;
    }

    async create(companyId: string, data: {
        name: string;
        code: string;
        start_time: string;
        end_time: string;
        break_minutes?: number;
        color?: string;
        is_overnight?: boolean;
        location_id?: string | null;
    }): Promise<ShiftTemplateEntity> {
        // Check code uniqueness within company
        const existing = await this.templateRepository.findOne({
            company_id: companyId,
            code: data.code,
            soft_delete: false,
        });
        if (existing) throw new BadRequestException(`Shift code '${data.code}' already exists`);

        return this.templateRepository.create({
            company_id: companyId,
            location_id: data.location_id ?? null,
            name: data.name,
            code: data.code.toUpperCase(),
            start_time: data.start_time,
            end_time: data.end_time,
            break_minutes: data.break_minutes ?? 0,
            color: data.color ?? '#3b82f6',
            is_overnight: data.is_overnight ?? false,
            is_active: true,
            soft_delete: false,
        });
    }

    async update(id: string, data: Partial<ShiftTemplateEntity>): Promise<ShiftTemplateEntity> {
        const item = await this.findOneById(id);
        if (data.code) data.code = data.code.toUpperCase();
        return this.templateRepository.update(item, data) as Promise<ShiftTemplateEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.templateRepository.update(item, { soft_delete: true });
    }

    /** Returns worked minutes for a template (end_time - start_time - break_minutes) */
    getWorkMinutes(template: ShiftTemplateEntity): number {
        const [sh, sm] = template.start_time.split(':').map(Number);
        const [eh, em] = template.end_time.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (template.is_overnight || diff <= 0) diff += 1440; // add 24h for overnight
        return diff - template.break_minutes;
    }

    mapGet(t: ShiftTemplateEntity) {
        return {
            _id: t._id,
            company_id: t.company_id,
            location_id: t.location_id ?? null,
            name: t.name,
            code: t.code,
            start_time: t.start_time,
            end_time: t.end_time,
            break_minutes: t.break_minutes,
            color: t.color,
            is_overnight: t.is_overnight,
            is_active: t.is_active,
            createdAt: t.createdAt,
        };
    }
}
