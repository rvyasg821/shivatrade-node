import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentRepository } from '../repository/repositories/document.repository';
import { DocumentCategoryRepository } from '../repository/repositories/document-category.repository';
import { DocumentEntity } from '../repository/entities/document.entity';
import { DocumentFileService } from './document-file.service';
import { ENUM_DOCUMENT_STATUS, ENUM_DOCUMENT_APPROVAL_STATUS } from '../enums/document.enum';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class DocumentService {
    constructor(
        private readonly documentRepository: DocumentRepository,
        private readonly categoryRepository: DocumentCategoryRepository,
        private readonly documentFileService: DocumentFileService
    ) {}

    async create(
        companyId: string,
        uploadedBy: string,
        file: Express.Multer.File,
        data: Partial<DocumentEntity>
    ): Promise<DocumentEntity> {
        const { file_path, file_name, file_type } = await this.documentFileService.saveFile(
            file.buffer,
            file.originalname,
            companyId
        );

        return this.documentRepository.create({
            ...data,
            company_id: companyId,
            uploaded_by: uploadedBy,
            file_path,
            file_name,
            file_type,
            file_size: file.size,
            status: data.status || ENUM_DOCUMENT_STATUS.ACTIVE,
            approved_status: data.approved_status || ENUM_DOCUMENT_APPROVAL_STATUS.PENDING,
            is_expired: false,
            soft_delete: false,
        });
    }

    async findAll(find: object, limit: number, offset: number, orderField = '_id', orderDir: ENUM_PAGINATION_ORDER_DIRECTION_TYPE = ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC): Promise<DocumentEntity[]> {
        return this.documentRepository.findAll(find, {
            paging: { limit, offset },
            order: { [orderField]: orderDir },
        }) as Promise<DocumentEntity[]>;
    }

    async getTotal(find: object): Promise<number> {
        return this.documentRepository.getTotal(find);
    }

    async findOneById(id: string): Promise<DocumentEntity> {
        const item = await this.documentRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Document not found');
        return item as DocumentEntity;
    }

    async update(id: string, data: Partial<DocumentEntity>): Promise<DocumentEntity> {
        const item = await this.findOneById(id);
        return this.documentRepository.update(item, data) as Promise<DocumentEntity>;
    }

    async softDelete(id: string): Promise<DocumentEntity> {
        const item = await this.findOneById(id);
        // Delete the physical file
        await this.documentFileService.deleteFile(item.file_path);
        return this.documentRepository.update(item, { soft_delete: true }) as Promise<DocumentEntity>;
    }

    /**
     * Mark expired documents: called by cron
     */
    async markExpiredDocuments(companyId: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const docs = await this.documentRepository.findAll(
            { company_id: companyId, soft_delete: false, is_expired: false },
            { paging: { limit: 1000, offset: 0 } }
        ) as DocumentEntity[];

        for (const doc of docs) {
            if (doc.expiry_date && doc.expiry_date < today) {
                await this.documentRepository.update(doc, {
                    is_expired: true,
                    status: ENUM_DOCUMENT_STATUS.EXPIRED,
                });
            }
        }
    }

    mapGet(item: DocumentEntity, category?: any) {
        return {
            _id: item._id,
            company_id: item.company_id,
            user_id: item.user_id,
            uploaded_by: item.uploaded_by,
            category_id: item.category_id,
            category: category || null,
            location_id: item.location_id,
            title: item.title,
            description: item.description,
            file_path: item.file_path,
            file_name: item.file_name,
            file_type: item.file_type,
            file_size: item.file_size,
            expiry_date: item.expiry_date,
            is_expired: item.is_expired,
            status: item.status,
            approved_status: item.approved_status,
            approved_by: item.approved_by,
            approved_at: item.approved_at,
            approval_note: item.approval_note,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }

    mapList(item: DocumentEntity) {
        return {
            _id: item._id,
            title: item.title,
            file_name: item.file_name,
            file_type: item.file_type,
            file_size: item.file_size,
            file_path: item.file_path,
            category_id: item.category_id,
            user_id: item.user_id,
            location_id: item.location_id,
            expiry_date: item.expiry_date,
            is_expired: item.is_expired,
            status: item.status,
            approved_status: item.approved_status,
            approved_by: item.approved_by,
            createdAt: item.createdAt,
        };
    }
}
