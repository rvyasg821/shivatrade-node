import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_VENDOR_CATEGORY_STATUS } from '@modules/vendor-category/enums/vendor-category.enum';
import { VENDOR_CATEGORY_MASTER_COLLECTION_NAME } from '../../constants/vendor-category.entity.constant';

/**
 * Vendor-category MASTER. A flat master that classifies vendors (e.g.
 * "Raw Material", "Logistics"). Separate from the product `categories` master
 * and from the `vendor_categories` join table — this is the list a vendor's
 * category is chosen from.
 *
 * `code` is unique per company (enforced at the service layer, mirroring the
 * name check) and is the key the importer upserts on.
 */
@Entity(VENDOR_CATEGORY_MASTER_COLLECTION_NAME)
export class VendorCategoryMasterEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: true })
    code?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_VENDOR_CATEGORY_STATUS.ACTIVE,
    })
    status: ENUM_VENDOR_CATEGORY_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type VendorCategoryMasterDoc = VendorCategoryMasterEntity;
