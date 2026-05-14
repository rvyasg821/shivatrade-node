import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { PRODUCT_REBATE_COLLECTION_NAME } from '../../constants/product.entity.constant';

@Entity(PRODUCT_REBATE_COLLECTION_NAME)
@Unique('uq_product_rebate', ['product_id', 'rebate_id'])
export class ProductRebateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    rebate_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Per-product override; null = use Rebate master's pct. */
    @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
    pct?: string;
}

export type ProductRebateDoc = ProductRebateEntity;
