import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { CONTRACT_FIELD_VALUE_TABLE } from '../../constants/contract.entity.constant';

@Entity(CONTRACT_FIELD_VALUE_TABLE)
export class ContractFieldValueEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    employee_contract_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    contract_field_id: string;

    @Column({ type: 'text', nullable: true })
    value: string;

    @Column({ type: 'boolean', default: false })
    is_auto_populated: boolean;
}

export type ContractFieldValueDoc = ContractFieldValueEntity;
