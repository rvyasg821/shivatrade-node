import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_CATEGORY_STATUS } from '@modules/category/enums/category.enum';
import { CATEGORY_COLLECTION_NAME } from '../../constants/category.entity.constant';

@Entity(CATEGORY_COLLECTION_NAME)
export class CategoryEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    parent_id?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_CATEGORY_STATUS.ACTIVE })
    status: ENUM_CATEGORY_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CategoryDoc = CategoryEntity;
