import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_VENDOR_ADDRESS_TYPE } from '@modules/vendor/enums/vendor.enum';
import { VENDOR_ADDRESS_COLLECTION_NAME } from '../../constants/vendor.entity.constant';

@Entity(VENDOR_ADDRESS_COLLECTION_NAME)
export class VendorAddressEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_VENDOR_ADDRESS_TYPE.BILL_FROM,
    })
    type: ENUM_VENDOR_ADDRESS_TYPE;

    @Column({ type: 'varchar', length: 150, nullable: true })
    label?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line1?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    address_line2?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state?: string;

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    country?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    postcode?: string;

    /** Per-address GSTIN — branch may differ from HQ. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    gstin?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type VendorAddressDoc = VendorAddressEntity;
