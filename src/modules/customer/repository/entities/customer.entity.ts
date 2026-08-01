import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_CUSTOMER_STATUS } from '@modules/customer/enums/customer.enum';
import { CUSTOMER_COLLECTION_NAME } from '../../constants/customer.entity.constant';

export interface ICustomerSocialMedia {
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
    other?: string;
}

@Entity(CUSTOMER_COLLECTION_NAME)
export class CustomerEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    company_name: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    website?: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    social_media?: ICustomerSocialMedia;

    // ── Tax & Compliance ──
    // gstin accepts GSTIN (India) OR foreign equivalent (VAT, TRN, EU VAT id).
    // pan accepts PAN (India) OR foreign Business Registration # (Trade
    // License, CR, EIN, etc.). Field labels are country-agnostic in the UI.
    @Column({ type: 'varchar', length: 30, nullable: true })
    gstin?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    pan?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    iec?: string;

    /** Default currency (ISO code) used when this customer is selected on
     *  a quotation / PFI / PO. Optional — falls back to company default. */
    @Column({ type: 'varchar', length: 10, nullable: true })
    currency?: string;

    // Migration opening balance (in the customer's currency). Carried over from
    // a previous system so the ledger's outstanding starts correct. `type` picks
    // the column — a customer who already owes us = 'debit'.
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
    opening_balance?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    opening_balance_type?: string; // 'debit' | 'credit'

    @Column({ type: 'date', nullable: true })
    opening_balance_date?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_CUSTOMER_STATUS.ACTIVE })
    status: ENUM_CUSTOMER_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CustomerDoc = CustomerEntity;
