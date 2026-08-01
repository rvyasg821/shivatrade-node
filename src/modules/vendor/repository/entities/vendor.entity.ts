import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_VENDOR_STATUS } from '@modules/vendor/enums/vendor.enum';
import { VENDOR_COLLECTION_NAME } from '../../constants/vendor.entity.constant';

export interface IVendorSocialMedia {
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
    other?: string;
}

@Entity(VENDOR_COLLECTION_NAME)
export class VendorEntity extends DatabaseObjectIdEntityBase {
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
    social_media?: IVendorSocialMedia;

    // Categories are stored in the `vendor_categories` join table.

    // ── Tax & Compliance ──
    @Index()
    @Column({ type: 'varchar', length: 15, nullable: true })
    gstin?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    pan?: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    vendor_code?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    payment_terms?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    incoterms?: string;

    // Preferred transaction currency (ISO code, e.g. "USD"). Auto-selected on a
    // Vendor PO for this vendor; blank → the POV falls back to INR.
    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    // Migration opening balance (in the vendor's currency). Carried over from a
    // previous system so the ledger's outstanding starts correct. `type` picks
    // which column it posts to — a vendor we already owe = 'credit'.
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
    opening_balance?: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    opening_balance_type?: string; // 'debit' | 'credit'

    @Column({ type: 'date', nullable: true })
    opening_balance_date?: string;

    // Addresses are stored in `vendor_addresses` join table.

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_VENDOR_STATUS.ACTIVE })
    status: ENUM_VENDOR_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type VendorDoc = VendorEntity;
