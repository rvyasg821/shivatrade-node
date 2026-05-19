import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_CUSTOMER_ADDRESS_TYPE } from '@modules/customer/enums/customer.enum';
import { CUSTOMER_ADDRESS_COLLECTION_NAME } from '../../constants/customer.entity.constant';

@Entity(CUSTOMER_ADDRESS_COLLECTION_NAME)
export class CustomerAddressEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    customer_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_CUSTOMER_ADDRESS_TYPE.BILL_TO,
    })
    type: ENUM_CUSTOMER_ADDRESS_TYPE;

    /** Friendly label e.g. "HQ Mumbai", "Conakry warehouse". */
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

    /** Per-address overrides. Accepts GSTIN (India) OR foreign VAT/TRN/Tax ID
     *  for overseas branches. Length 30 to accommodate prefixed EU VAT
     *  numbers and other international tax identifiers. */
    @Column({ type: 'varchar', length: 30, nullable: true })
    gstin?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    iec?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CustomerAddressDoc = CustomerAddressEntity;
