import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { CONTRACT_SECTION_TABLE } from '../../constants/contract.entity.constant';

@Entity(CONTRACT_SECTION_TABLE)
export class ContractSectionEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    contract_template_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'int', default: 0 })
    order: number;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Column({ type: 'text', nullable: true })
    rich_text_body: string; // HTML content with {{placeholder}} tokens

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ContractSectionDoc = ContractSectionEntity;
