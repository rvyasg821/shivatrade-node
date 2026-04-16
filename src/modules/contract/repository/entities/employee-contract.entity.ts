import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { EMPLOYEE_CONTRACT_TABLE } from '../../constants/contract.entity.constant';
import { ENUM_CONTRACT_STATUS } from '../../enums/contract.enum';

@Entity(EMPLOYEE_CONTRACT_TABLE)
export class EmployeeContractEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string; // employee

    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    contract_template_id: string;

    @Column({ type: 'int', default: 1 })
    template_version: number;

    @Column({ type: 'varchar', length: 30, default: ENUM_CONTRACT_STATUS.ISSUED })
    status: string;

    @Column({ type: 'uuid', nullable: true })
    issued_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    issued_at: Date;

    @Column({ type: 'timestamptz', nullable: true })
    signed_at: Date;

    @Column({ type: 'text', nullable: true })
    signature_data: string; // base64 PNG

    @Column({ type: 'varchar', length: 45, nullable: true })
    signature_ip: string;

    @Column({ type: 'date', nullable: true })
    effective_date: string;

    @Column({ type: 'date', nullable: true })
    end_date: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    pdf_path: string;

    @Column({ type: 'uuid', nullable: true })
    document_id: string; // FK to documents table

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ type: 'text', nullable: true })
    rendered_html: string; // Full rendered HTML snapshot at time of issue

    @Column({ type: 'boolean', default: false })
    is_customised: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    last_edited_at: Date;

    @Column({ type: 'uuid', nullable: true })
    last_edited_by: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type EmployeeContractDoc = EmployeeContractEntity;
