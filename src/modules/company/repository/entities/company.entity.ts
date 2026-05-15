import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_COMPANY_STATUS } from '@modules/company/enums/company.enum';

export const CompanyTableName = 'company';

@Entity(CompanyTableName)
export class CompanyEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    @Column({ type: 'varchar', nullable: false })
    company_name: string;

    @Column({ type: 'varchar', nullable: false })
    contact_name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contact_first_name?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contact_middle_name?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contact_last_name?: string;

    @Column({ type: 'varchar', nullable: false })
    email: string;

    @Column({ type: 'varchar', nullable: true })
    mobile: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code: Object;

    @Column({ type: 'varchar', nullable: true })
    website?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    license_number?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    tax_number?: string;

    // ── India export compliance ──
    @Column({ type: 'varchar', length: 20, nullable: true })
    iec?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    lut_no?: string;

    @Column({ type: 'date', nullable: true })
    lut_date?: string;

    @Column({ type: 'varchar', length: 21, nullable: true })
    cin?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    company_code?: string;

    /** Short uppercase prefix used at the front of every voucher_no
     *  (e.g. 'STIPL' → STIPL/PI0001/2026-27). If blank, voucher service
     *  falls back to first 5 chars of company_name. */
    @Column({ type: 'varchar', length: 10, nullable: true })
    voucher_prefix?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    paye_reference?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    pension_provider?: string;

    @Column({ type: 'boolean', default: false })
    is_sponsor_licence?: boolean;

    @Column({ type: 'varchar', length: 2, nullable: true })
    selected_country?: string;

    @Column({ type: 'varchar', nullable: true })
    timezone?: string;

    @Column({ type: 'varchar', length: 3, nullable: true })
    currency?: string;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: null })
    tenantId?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    address_1?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    address_2?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    state?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    city?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    country?: string;

    @Column({ type: 'varchar', nullable: true, default: '' })
    zipcode?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    subscription_id?: string;

    @Column({ type: 'boolean', default: false })
    is_subscribe?: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: true, default: ENUM_COMPANY_STATUS.ACTIVE })
    status: ENUM_COMPANY_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    @Column({ type: 'varchar', nullable: true, default: null })
    referal_code?: string;

    @Column({ type: 'uuid', nullable: true, default: null })
    agent_id?: string;

    @Column({ type: 'int', default: 0 })
    agent_commission?: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Column({ type: 'boolean', default: false })
    setup_completed: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    setup_completed_at: Date;
}

export type CompanyDocument = CompanyEntity;
export type CompanyDoc = CompanyDocument;
