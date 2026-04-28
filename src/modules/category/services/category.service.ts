import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CategoryRepository } from '../repository/repositories/category.repository';
import { CategoryDoc } from '../repository/entities/category.entity';
import { CategoryCreateRequestDto } from '../dtos/request/category.create.request.dto';
import { CategoryUpdateRequestDto } from '../dtos/request/category.update.request.dto';
import { CategoryGetResponseDto } from '../dtos/response/category.get.response.dto';
import { CategoryListResponseDto } from '../dtos/response/category.list.response.dto';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class CategoryService {
    private readonly logger = new Logger(CategoryService.name);

    constructor(
        private readonly categoryRepository: CategoryRepository,
    ) {}

    async create(
        companyId: string,
        data: CategoryCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<CategoryDoc> {
        const name = data.name.trim();

        const nameExists = await this.categoryRepository.isNameExists(companyId, name);
        if (nameExists) {
            throw new BadRequestException(
                `Category '${name}' already exists for this company`
            );
        }

        if (data.parent_id) {
            await this.assertParentValid(companyId, data.parent_id);
        }

        const category = await this.categoryRepository.create(
            {
                ...data,
                name,
                company_id: companyId,
                created_by: createdBy,
            } as any,
            options
        );

        this.logger.log(`Category created: ${category._id} for company: ${companyId}`);
        return category;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CategoryDoc[]> {
        return this.categoryRepository.findByCompanyId(companyId, options);
    }

    async findActive(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CategoryDoc[]> {
        return this.categoryRepository.findActiveByCompanyId(companyId, options);
    }

    async findOneById(
        categoryId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CategoryDoc> {
        const category = await this.categoryRepository.findOneById(categoryId, options);
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return category;
    }

    async update(
        category: CategoryDoc,
        data: CategoryUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<CategoryDoc> {
        const companyId = category.company_id.toString();

        if (data.name && data.name.trim() !== category.name) {
            const nameExists = await this.categoryRepository.isNameExists(
                companyId,
                data.name.trim(),
                category._id.toString()
            );
            if (nameExists) {
                throw new BadRequestException(
                    `Category '${data.name.trim()}' already exists for this company`
                );
            }
            data.name = data.name.trim();
        }

        if (data.parent_id) {
            if (data.parent_id === category._id.toString()) {
                throw new BadRequestException('A category cannot be its own parent');
            }
            await this.assertParentValid(companyId, data.parent_id);
        }

        Object.assign(category, data);
        const updated = await this.categoryRepository.save(category, options);

        this.logger.log(`Category updated: ${category._id}`);
        return updated;
    }

    async softDelete(
        category: CategoryDoc,
        deletedBy?: string,
        options?: IDatabaseSaveOptions
    ): Promise<CategoryDoc> {
        const childCount = await this.categoryRepository.countChildren(
            category._id.toString()
        );
        if (childCount > 0) {
            throw new BadRequestException(
                'Cannot delete a category that has sub-categories'
            );
        }

        category.soft_delete = true;
        category.is_active = false;
        (category as any).deleted = true;
        (category as any).deletedAt = new Date();
        if (deletedBy) (category as any).deletedBy = deletedBy;

        const updated = await this.categoryRepository.save(category, options);

        this.logger.log(`Category soft deleted: ${category._id}`);
        return updated;
    }

    async restore(category: CategoryDoc): Promise<CategoryDoc> {
        category.soft_delete = false;
        category.is_active = true;
        (category as any).deleted = false;
        (category as any).deletedAt = null;
        (category as any).deletedBy = null;

        const updated = await this.categoryRepository.save(category);
        this.logger.log(`Category restored: ${category._id}`);
        return updated;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.categoryRepository.deleteAllByCompanyId(companyId);
    }

    private async assertParentValid(companyId: string, parentId: string): Promise<void> {
        const parent = await this.categoryRepository.findOne({
            _id: parentId,
            company_id: companyId,
            soft_delete: false,
        });
        if (!parent) {
            throw new BadRequestException('Parent category not found');
        }
    }

    /**
     * Build a quick id→name map for the given list of categories so we can
     * resolve parent_name without N additional queries.
     */
    private async buildParentNameMap(
        categories: CategoryDoc[]
    ): Promise<Record<string, string>> {
        const parentIds = Array.from(
            new Set(
                categories
                    .map((c) => (c.parent_id ? c.parent_id.toString() : null))
                    .filter(Boolean) as string[]
            )
        );
        if (parentIds.length === 0) return {};

        const parents = await this.categoryRepository.findAll({
            _id: { $in: parentIds },
            soft_delete: false,
        } as any);

        const map: Record<string, string> = {};
        for (const p of parents) {
            map[p._id.toString()] = p.name;
        }
        return map;
    }

    async mapGetWithParent(category: CategoryDoc): Promise<CategoryGetResponseDto> {
        const dto = plainToInstance(CategoryGetResponseDto, category);
        if (category.parent_id) {
            const parent = await this.categoryRepository.findOneById(
                category.parent_id.toString()
            );
            dto.parent_name = parent?.name;
        }
        return dto;
    }

    async mapListWithParent(
        categories: CategoryDoc[]
    ): Promise<CategoryListResponseDto[]> {
        const parentMap = await this.buildParentNameMap(categories);
        return categories.map((c) => {
            const dto = plainToInstance(CategoryListResponseDto, c);
            if (c.parent_id) {
                dto.parent_name = parentMap[c.parent_id.toString()];
            }
            return dto;
        });
    }

    mapGet(category: CategoryDoc): CategoryGetResponseDto {
        return plainToInstance(CategoryGetResponseDto, category);
    }

    mapList(categories: CategoryDoc[]): CategoryListResponseDto[] {
        return categories.map((c) => plainToInstance(CategoryListResponseDto, c));
    }
}
