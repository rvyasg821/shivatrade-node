import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractSectionRepository } from '../repository/repositories/contract-section.repository';
import { ContractSectionEntity } from '../repository/entities/contract-section.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ContractSectionService {
    constructor(private readonly sectionRepository: ContractSectionRepository) {}

    async create(templateId: string, data: Partial<ContractSectionEntity>): Promise<ContractSectionEntity> {
        // Auto-assign next order value
        const existing = await this.sectionRepository.getTotal({ contract_template_id: templateId, soft_delete: false });
        return this.sectionRepository.create({
            ...data,
            contract_template_id: templateId,
            order: data.order ?? existing,
            soft_delete: false,
        });
    }

    async findByTemplate(templateId: string): Promise<ContractSectionEntity[]> {
        return this.sectionRepository.findAll(
            { contract_template_id: templateId, soft_delete: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<ContractSectionEntity[]>;
    }

    async findOneById(id: string): Promise<ContractSectionEntity> {
        const item = await this.sectionRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Contract section not found');
        return item as ContractSectionEntity;
    }

    async update(id: string, data: Partial<ContractSectionEntity>): Promise<ContractSectionEntity> {
        const item = await this.findOneById(id);
        return this.sectionRepository.update(item, data) as Promise<ContractSectionEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.sectionRepository.update(item, { soft_delete: true });
    }

    async reorder(templateId: string, orderedIds: string[]): Promise<void> {
        for (let i = 0; i < orderedIds.length; i++) {
            const item = await this.sectionRepository.findOne({ _id: orderedIds[i] });
            if (item) await this.sectionRepository.update(item as ContractSectionEntity, { order: i });
        }
    }

    mapGet(section: ContractSectionEntity) {
        return {
            _id: section._id,
            contract_template_id: section.contract_template_id,
            title: section.title,
            description: section.description,
            rich_text_body: section.rich_text_body ?? '',
            order: section.order,
            is_active: section.is_active,
        };
    }
}
