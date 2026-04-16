import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { CONTRACT_TEMPLATE_TABLE } from '../../constants/contract.entity.constant';
import { ENUM_CONTRACT_TEMPLATE_STATUS } from '../../enums/contract.enum';

@Entity(CONTRACT_TEMPLATE_TABLE)
export class ContractTemplateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_id: string; // null = system template

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 20, default: ENUM_CONTRACT_TEMPLATE_STATUS.DRAFT })
    status: string;

    @Column({ type: 'int', default: 1 })
    version: number;

    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Column({ type: 'boolean', default: false })
    is_system: boolean; // true = platform-provided template visible to all companies

    @Column({ type: 'boolean', default: true })
    requires_signature: boolean;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ContractTemplateDoc = ContractTemplateEntity;
