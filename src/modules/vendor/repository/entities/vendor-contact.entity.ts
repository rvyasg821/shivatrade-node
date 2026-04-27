import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { VENDOR_CONTACT_COLLECTION_NAME } from '../../constants/vendor.entity.constant';

@Entity(VENDOR_CONTACT_COLLECTION_NAME)
export class VendorContactEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    designation?: string;

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone?: string;

    @Column({ type: 'jsonb', nullable: true, default: null })
    country_code?: { code: string; dialCode: string };

    @Index()
    @Column({ type: 'boolean', default: false })
    is_primary: boolean;

    /**
     * Linked user row for vendor login (created when this contact is the primary).
     * Currently no login enabled; the user is provisioned with a random password
     * so it's ready when login is turned on.
     */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    user_id?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type VendorContactDoc = VendorContactEntity;
