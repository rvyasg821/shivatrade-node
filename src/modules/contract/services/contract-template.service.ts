import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractTemplateRepository } from '../repository/repositories/contract-template.repository';
import { ContractSectionRepository } from '../repository/repositories/contract-section.repository';
import { ContractFieldRepository } from '../repository/repositories/contract-field.repository';
import { ContractTemplateEntity } from '../repository/entities/contract-template.entity';
import { ContractSectionEntity } from '../repository/entities/contract-section.entity';
import { ContractFieldEntity } from '../repository/entities/contract-field.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ContractTemplateService {
    constructor(
        private readonly templateRepository: ContractTemplateRepository,
        private readonly sectionRepository: ContractSectionRepository,
        private readonly fieldRepository: ContractFieldRepository
    ) {}

    async create(companyId: string, userId: string, data: Partial<ContractTemplateEntity>): Promise<ContractTemplateEntity> {
        return this.templateRepository.create({
            ...data,
            company_id: companyId,
            created_by: userId,
            soft_delete: false,
        });
    }

    async findAll(companyId: string, limit = 20, offset = 0, search?: string): Promise<ContractTemplateEntity[]> {
        const baseFind: any = { soft_delete: false };
        if (search) baseFind.$or = [{ name: { $regex: search, $options: 'i' } }];

        // Fetch company templates + system templates (is_system = true) separately
        const [companyItems, systemItems] = await Promise.all([
            this.templateRepository.findAll(
                { ...baseFind, company_id: companyId },
                { paging: { limit, offset }, order: { createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
            ) as Promise<ContractTemplateEntity[]>,
            this.templateRepository.findAll(
                { ...baseFind, is_system: true },
                { paging: { limit: 100, offset: 0 }, order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
            ) as Promise<ContractTemplateEntity[]>,
        ]);

        // System templates first, then company templates; deduplicate by _id
        const seen = new Set<string>();
        return [...(await systemItems), ...(await companyItems)].filter(t => {
            if (seen.has(t._id)) return false;
            seen.add(t._id);
            return true;
        });
    }

    async getTotal(companyId: string, search?: string): Promise<number> {
        const baseFind: any = { soft_delete: false };
        if (search) baseFind.$or = [{ name: { $regex: search, $options: 'i' } }];
        const [companyTotal, systemTotal] = await Promise.all([
            this.templateRepository.getTotal({ ...baseFind, company_id: companyId }),
            this.templateRepository.getTotal({ ...baseFind, is_system: true }),
        ]);
        return companyTotal + systemTotal;
    }

    async findOneById(id: string): Promise<ContractTemplateEntity> {
        const item = await this.templateRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Contract template not found');
        return item as ContractTemplateEntity;
    }

    /**
     * Returns the full template with sections + ordered fields.
     */
    async getTemplateWithSections(id: string): Promise<{
        template: ContractTemplateEntity;
        sections: Array<ContractSectionEntity & { fields: ContractFieldEntity[] }>;
    }> {
        const template = await this.findOneById(id);
        const sections = await this.sectionRepository.findAll(
            { contract_template_id: id, soft_delete: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as ContractSectionEntity[];

        const sectionsWithFields = await Promise.all(
            sections.map(async (section) => {
                const fields = await this.fieldRepository.findAll(
                    { contract_section_id: section._id, soft_delete: false },
                    { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
                ) as ContractFieldEntity[];
                return { ...section, fields };
            })
        );

        return { template, sections: sectionsWithFields };
    }

    async findByIds(ids: string[]): Promise<ContractTemplateEntity[]> {
        return this.templateRepository.findAll(
            { _id: ids, soft_delete: false },
            { paging: { limit: ids.length, offset: 0 } }
        ) as Promise<ContractTemplateEntity[]>;
    }

    async update(id: string, data: Partial<ContractTemplateEntity>): Promise<ContractTemplateEntity> {
        const item = await this.findOneById(id);
        return this.templateRepository.update(item, data) as Promise<ContractTemplateEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.templateRepository.update(item, { soft_delete: true });
    }

    mapGet(template: ContractTemplateEntity) {
        return {
            _id: template._id,
            company_id: template.company_id,
            name: template.name,
            description: template.description,
            status: template.status,
            version: template.version,
            is_default: template.is_default,
            is_system: template.is_system ?? false,
            requires_signature: template.requires_signature,
            created_by: template.created_by,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
        };
    }
}
