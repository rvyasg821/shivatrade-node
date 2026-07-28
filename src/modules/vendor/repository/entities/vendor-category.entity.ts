import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { VENDOR_CATEGORY_COLLECTION_NAME } from '../../constants/vendor.entity.constant';

@Entity(VENDOR_CATEGORY_COLLECTION_NAME)
@Unique('uq_vendor_category', ['vendor_id', 'category_id'])
export class VendorCategoryEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    category_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false, default: 'vendor' })
    category_type: string; // 'vendor' | 'product'
}

export type VendorCategoryDoc = VendorCategoryEntity;
