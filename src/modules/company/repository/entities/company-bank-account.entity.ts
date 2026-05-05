import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_COMPANY_BANK_ACCOUNT_TYPE } from '@modules/company/enums/company.enum';
import { COMPANY_BANK_ACCOUNT_COLLECTION_NAME } from '../../constants/company.entity.constant';

@Entity(COMPANY_BANK_ACCOUNT_COLLECTION_NAME)
export class CompanyBankAccountEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    bank_name: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    account_holder_name?: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    account_number: string;

    @Column({ type: 'varchar', length: 11, nullable: true })
    ifsc?: string;

    @Column({ type: 'varchar', length: 11, nullable: true })
    swift_code?: string;

    @Column({ type: 'varchar', length: 34, nullable: true })
    iban?: string;

    /**
     * Authorized Dealer code — required on accounts that receive forex
     * (export proceeds realization). Indian banking convention.
     */
    @Column({ type: 'varchar', length: 30, nullable: true })
    ad_code?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    currency_id: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    branch_name?: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    branch_address?: string;

    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_COMPANY_BANK_ACCOUNT_TYPE.CURRENT,
    })
    account_type: ENUM_COMPANY_BANK_ACCOUNT_TYPE;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CompanyBankAccountDoc = CompanyBankAccountEntity;
