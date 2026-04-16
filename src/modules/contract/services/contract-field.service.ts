import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractFieldRepository } from '../repository/repositories/contract-field.repository';
import { ContractFieldEntity } from '../repository/entities/contract-field.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class ContractFieldService {
    constructor(private readonly fieldRepository: ContractFieldRepository) {}

    async create(sectionId: string, templateId: string, data: Partial<ContractFieldEntity>): Promise<ContractFieldEntity> {
        const existing = await this.fieldRepository.getTotal({ contract_section_id: sectionId, soft_delete: false });
        return this.fieldRepository.create({
            ...data,
            contract_section_id: sectionId,
            contract_template_id: templateId,
            order: data.order ?? existing,
            soft_delete: false,
        });
    }

    async findBySection(sectionId: string): Promise<ContractFieldEntity[]> {
        return this.fieldRepository.findAll(
            { contract_section_id: sectionId, soft_delete: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<ContractFieldEntity[]>;
    }

    async findByTemplate(templateId: string): Promise<ContractFieldEntity[]> {
        return this.fieldRepository.findAll(
            { contract_template_id: templateId, soft_delete: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        ) as Promise<ContractFieldEntity[]>;
    }

    async findOneById(id: string): Promise<ContractFieldEntity> {
        const item = await this.fieldRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Contract field not found');
        return item as ContractFieldEntity;
    }

    async update(id: string, data: Partial<ContractFieldEntity>): Promise<ContractFieldEntity> {
        const item = await this.findOneById(id);
        return this.fieldRepository.update(item, data) as Promise<ContractFieldEntity>;
    }

    async softDelete(id: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.fieldRepository.update(item, { soft_delete: true });
    }

    async reorder(sectionId: string, orderedIds: string[]): Promise<void> {
        for (let i = 0; i < orderedIds.length; i++) {
            const item = await this.fieldRepository.findOne({ _id: orderedIds[i] });
            if (item) await this.fieldRepository.update(item as ContractFieldEntity, { order: i });
        }
    }

    mapGet(field: ContractFieldEntity) {
        return {
            _id: field._id,
            contract_section_id: field.contract_section_id,
            contract_template_id: field.contract_template_id,
            label: field.label,
            field_type: field.field_type,
            options: field.options,
            is_required: field.is_required,
            is_readonly: field.is_readonly,
            auto_populate_from: field.auto_populate_from,
            default_value: field.default_value,
            placeholder: field.placeholder,
            validation_rules: field.validation_rules,
            order: field.order,
        };
    }
}
