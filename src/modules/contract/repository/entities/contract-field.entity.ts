import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { CONTRACT_FIELD_TABLE } from '../../constants/contract.entity.constant';
import { ENUM_CONTRACT_FIELD_TYPE } from '../../enums/contract.enum';

@Entity(CONTRACT_FIELD_TABLE)
export class ContractFieldEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    contract_section_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    contract_template_id: string; // denormalized

    @Column({ type: 'varchar', length: 200, nullable: false })
    label: string;

    @Column({ type: 'varchar', length: 30, default: ENUM_CONTRACT_FIELD_TYPE.TEXT })
    field_type: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    options: Array<{ value: string; label: string }>;

    @Column({ type: 'boolean', default: false })
    is_required: boolean;

    @Column({ type: 'boolean', default: false })
    is_readonly: boolean;

    @Column({ type: 'varchar', length: 100, nullable: true })
    auto_populate_from: string; // e.g. 'firstName', 'email', 'designation'

    @Column({ type: 'text', nullable: true })
    default_value: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    placeholder: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    validation_rules: Record<string, any>;

    @Column({ type: 'int', default: 0 })
    order: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ContractFieldDoc = ContractFieldEntity;
