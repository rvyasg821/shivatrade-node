import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PRODUCT_STATUS } from '@modules/product/enums/product.enum';
import { PRODUCT_COLLECTION_NAME } from '../../constants/product.entity.constant';

@Entity(PRODUCT_COLLECTION_NAME)
export class ProductEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    code: string; // SKU / Item Code — unique per company (case-insensitive)

    @Index()
    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    category_id: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'text', nullable: true })
    specifications?: string; // free-text, e.g. "Weight: 50kg\nGrade: A"

    @Column({ type: 'text', nullable: true })
    packaging_details?: string;

    @Column({ type: 'text', nullable: true })
    quality_parameters?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    hsn_code?: string; // GST classification

    @Column({ type: 'varchar', length: 50, nullable: true })
    unit_of_measure?: string;

    // ── Pricing ──
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
    selling_price?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    currency_id?: string;

    // ── Identification (extra) ──
    @Column({ type: 'varchar', length: 100, nullable: true })
    part_no?: string;

    // ── Logistics ──
    @Column({ type: 'int', nullable: true })
    pack_size?: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    net_weight_per_unit?: string;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    gross_weight_per_unit?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country_of_origin?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_PRODUCT_STATUS.ACTIVE })
    status: ENUM_PRODUCT_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ProductDoc = ProductEntity;
