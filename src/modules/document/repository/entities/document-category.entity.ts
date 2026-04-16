import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { DOCUMENT_CATEGORY_COLLECTION_NAME } from '../../constants/document.entity.constant';

@Entity(DOCUMENT_CATEGORY_COLLECTION_NAME)
export class DocumentCategoryEntity extends DatabaseObjectIdEntityBase {
    @Column({ type: 'uuid', nullable: true })
    company_id: string; // NULL = system default category

    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    slug: string;

    @Column({ type: 'boolean', default: false })
    is_system: boolean; // non-deletable system defaults

    @Column({ type: 'boolean', default: false })
    requires_expiry: boolean; // visa, BRP must have expiry date

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type DocumentCategoryDoc = DocumentCategoryEntity;
