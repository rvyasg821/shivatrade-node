import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { DocumentCategoryRepository } from '../repository/repositories/document-category.repository';
import { DocumentCategoryEntity } from '../repository/entities/document-category.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class DocumentCategoryService implements OnModuleInit {
    private readonly logger = new Logger(DocumentCategoryService.name);

    private readonly SYSTEM_CATEGORIES = [
        { name: 'Contract', slug: 'contract', requires_expiry: false },
        { name: 'Passport / ID', slug: 'passport_id', requires_expiry: true },
        { name: 'Visa', slug: 'visa', requires_expiry: true },
        { name: 'BRP Card', slug: 'brp', requires_expiry: true },
        { name: 'Right to Work', slug: 'right_to_work', requires_expiry: true },
        { name: 'DBS Check', slug: 'dbs_check', requires_expiry: true },
        { name: 'P45', slug: 'p45', requires_expiry: false },
        { name: 'P60', slug: 'p60', requires_expiry: false },
        { name: 'Certificate / Qualification', slug: 'certificate', requires_expiry: false },
        { name: 'Medical / Health', slug: 'medical', requires_expiry: true },
        { name: 'Training Record', slug: 'training', requires_expiry: false },
        { name: 'Reference Letter', slug: 'reference', requires_expiry: false },
        { name: 'Other', slug: 'other', requires_expiry: false },
    ];

    constructor(
        private readonly categoryRepository: DocumentCategoryRepository
    ) {}

    async onModuleInit() {
        await this.seedSystemCategories();
    }

    private async seedSystemCategories() {
        try {
            const existing = await this.categoryRepository.findAll(
                { is_system: true, soft_delete: false },
                { paging: { limit: 100, offset: 0 } }
            ) as DocumentCategoryEntity[];

            const existingSlugs = new Set(existing.map((c) => c.slug));

            for (const cat of this.SYSTEM_CATEGORIES) {
                if (!existingSlugs.has(cat.slug)) {
                    await this.categoryRepository.create({
                        name: cat.name,
                        slug: cat.slug,
                        company_id: null,
                        is_system: true,
                        requires_expiry: cat.requires_expiry,
                        is_active: true,
                        soft_delete: false,
                    } as any);
                    this.logger.log(`Seeded system category: ${cat.name}`);
                }
            }
        } catch (err) {
            this.logger.warn(`Category seed skipped: ${err.message}`);
        }
    }

    private slugify(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    async create(companyId: string, data: Partial<DocumentCategoryEntity>): Promise<DocumentCategoryEntity> {
        const slug = this.slugify(data.name || '');
        return this.categoryRepository.create({
            ...data,
            company_id: companyId,
            slug,
            soft_delete: false,
        });
    }

    async findAll(companyId: string): Promise<DocumentCategoryEntity[]> {
        // Return system categories + company-specific categories
        const items = await this.categoryRepository.findAll(
            { soft_delete: false, is_active: true },
            { paging: { limit: 500, offset: 0 }, order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        );
        return (items as DocumentCategoryEntity[]).filter(
            (c) => !c.company_id || c.company_id === companyId
        );
    }

    async findAllAdmin(find: object, limit: number, offset: number): Promise<DocumentCategoryEntity[]> {
        return this.categoryRepository.findAll(find, {
            paging: { limit, offset },
            order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        }) as Promise<DocumentCategoryEntity[]>;
    }

    async getTotal(find: object): Promise<number> {
        return this.categoryRepository.getTotal(find);
    }

    async findOneById(id: string): Promise<DocumentCategoryEntity> {
        const item = await this.categoryRepository.findOne({ _id: id, soft_delete: false });
        if (!item) throw new NotFoundException('Document category not found');
        return item as DocumentCategoryEntity;
    }

    async update(id: string, data: Partial<DocumentCategoryEntity>): Promise<DocumentCategoryEntity> {
        const item = await this.findOneById(id);
        if (data.name && data.name !== item.name) {
            (data as any).slug = this.slugify(data.name);
        }
        return this.categoryRepository.update(item, data) as Promise<DocumentCategoryEntity>;
    }

    async softDelete(id: string): Promise<DocumentCategoryEntity> {
        const item = await this.findOneById(id);
        if (item.is_system) throw new Error('Cannot delete system categories');
        return this.categoryRepository.update(item, { soft_delete: true }) as Promise<DocumentCategoryEntity>;
    }

    mapGet(item: DocumentCategoryEntity) {
        return {
            _id: item._id,
            name: item.name,
            slug: item.slug,
            company_id: item.company_id,
            is_system: item.is_system,
            requires_expiry: item.requires_expiry,
            is_active: item.is_active,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
}
