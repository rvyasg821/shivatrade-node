import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { DOCUMENT_COLLECTION_NAME } from '../../constants/document.entity.constant';
import { ENUM_DOCUMENT_STATUS, ENUM_DOCUMENT_APPROVAL_STATUS } from '../../enums/document.enum';

@Entity(DOCUMENT_COLLECTION_NAME)
export class DocumentEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    user_id: string; // employee this document belongs to

    @Column({ type: 'uuid', nullable: true })
    uploaded_by: string; // who uploaded it

    @Index()
    @Column({ type: 'varchar', length: 100, nullable: false })
    category_id: string;

    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 500, nullable: false })
    file_path: string; // stored path on disk

    @Column({ type: 'varchar', length: 255, nullable: false })
    file_name: string; // original file name

    @Column({ type: 'varchar', length: 50, nullable: true })
    file_type: string; // MIME type

    @Column({ type: 'int', nullable: true })
    file_size: number; // bytes

    @Column({ type: 'date', nullable: true })
    expiry_date: string;

    @Column({ type: 'boolean', default: false })
    is_expired: boolean;

    @Column({
        type: 'varchar',
        length: 50,
        default: ENUM_DOCUMENT_STATUS.ACTIVE,
    })
    status: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        default: ENUM_DOCUMENT_APPROVAL_STATUS.PENDING,
    })
    approved_status: string;

    @Column({ type: 'uuid', nullable: true })
    approved_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    approved_at: Date;

    @Column({ type: 'text', nullable: true })
    approval_note: string;
}

export type DocumentDoc = DocumentEntity;
