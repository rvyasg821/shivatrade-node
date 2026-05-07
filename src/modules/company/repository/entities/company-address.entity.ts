import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_COMPANY_ADDRESS_TYPE } from '@modules/company/enums/company.enum';
import { COMPANY_ADDRESS_COLLECTION_NAME } from '../../constants/company.entity.constant';

@Entity(COMPANY_ADDRESS_COLLECTION_NAME)
export class CompanyAddressEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_COMPANY_ADDRESS_TYPE.CORPORATE,
    })
    type: ENUM_COMPANY_ADDRESS_TYPE;

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

    /** State-wise GSTIN — branch-specific. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    gstin?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CompanyAddressDoc = CompanyAddressEntity;
