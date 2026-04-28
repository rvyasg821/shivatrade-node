import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ProductRepository } from '../repository/repositories/product.repository';
import { ProductDoc } from '../repository/entities/product.entity';
import { ProductCreateRequestDto } from '../dtos/request/product.create.request.dto';
import { ProductUpdateRequestDto } from '../dtos/request/product.update.request.dto';
import { ProductGetResponseDto } from '../dtos/response/product.get.response.dto';
import { ProductListResponseDto } from '../dtos/response/product.list.response.dto';
import { CategoryRepository } from '@modules/category/repository/repositories/category.repository';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class ProductService {
    private readonly logger = new Logger(ProductService.name);

    constructor(
        private readonly productRepository: ProductRepository,
        private readonly categoryRepository: CategoryRepository,
    ) {}

    async create(
        companyId: string,
        data: ProductCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<ProductDoc> {
        const code = data.code.trim();

        const codeExists = await this.productRepository.isCodeExists(companyId, code);
        if (codeExists) {
            throw new BadRequestException(
                `Product code '${code}' already exists for this company`
            );
        }

        if (data.category_id) {
            await this.assertCategoryValid(companyId, data.category_id);
        }

        const product = await this.productRepository.create(
            {
                ...data,
                code,
                name: data.name.trim(),
                company_id: companyId,
                created_by: createdBy,
            } as any,
            options
        );

        this.logger.log(`Product created: ${product._id} for company: ${companyId}`);
        return product;
    }

    async findOneById(
        productId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ProductDoc> {
        const product = await this.productRepository.findOneById(productId, options);
        if (!product) {
            throw new NotFoundException('Product not found');
        }
        return product;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<ProductDoc[]> {
        return this.productRepository.findByCompanyId(companyId, options);
    }

    async update(
        product: ProductDoc,
        data: ProductUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<ProductDoc> {
        const companyId = product.company_id.toString();

        if (data.code && data.code.trim() !== product.code) {
            const codeExists = await this.productRepository.isCodeExists(
                companyId,
                data.code.trim(),
                product._id.toString()
            );
            if (codeExists) {
                throw new BadRequestException(
                    `Product code '${data.code.trim()}' already exists for this company`
                );
            }
            data.code = data.code.trim();
        }

        if (data.name) data.name = data.name.trim();

        if (data.category_id) {
            await this.assertCategoryValid(companyId, data.category_id);
        }

        Object.assign(product, data);
        const updated = await this.productRepository.save(product, options);

        this.logger.log(`Product updated: ${product._id}`);
        return updated;
    }

    async softDelete(
        product: ProductDoc,
        deletedBy?: string,
        options?: IDatabaseSaveOptions
    ): Promise<ProductDoc> {
        product.soft_delete = true;
        product.is_active = false;
        (product as any).deleted = true;
        (product as any).deletedAt = new Date();
        if (deletedBy) (product as any).deletedBy = deletedBy;

        const updated = await this.productRepository.save(product, options);

        this.logger.log(`Product soft deleted: ${product._id}`);
        return updated;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.productRepository.deleteAllByCompanyId(companyId);
    }

    private async assertCategoryValid(companyId: string, categoryId: string): Promise<void> {
        const category = await this.categoryRepository.findOne({
            _id: categoryId,
            company_id: companyId,
            soft_delete: false,
        });
        if (!category) {
            throw new BadRequestException('Category not found');
        }
    }

    /**
     * Build category id→name map without N+1.
     */
    private async buildCategoryNameMap(
        products: ProductDoc[]
    ): Promise<Record<string, string>> {
        const ids = Array.from(
            new Set(
                products
                    .map((p) => (p.category_id ? p.category_id.toString() : null))
                    .filter(Boolean) as string[]
            )
        );
        if (ids.length === 0) return {};

        const cats = await this.categoryRepository.findAll({
            _id: { $in: ids },
            soft_delete: false,
        } as any);

        const map: Record<string, string> = {};
        for (const c of cats) {
            map[c._id.toString()] = c.name;
        }
        return map;
    }

    async mapGetWithCategory(product: ProductDoc): Promise<ProductGetResponseDto> {
        const dto = plainToInstance(ProductGetResponseDto, product);
        if (product.category_id) {
            const cat = await this.categoryRepository.findOneById(
                product.category_id.toString()
            );
            dto.category_name = cat?.name;
        }
        return dto;
    }

    async mapListWithCategory(
        products: ProductDoc[]
    ): Promise<ProductListResponseDto[]> {
        const catMap = await this.buildCategoryNameMap(products);
        return products.map((p) => {
            const dto = plainToInstance(ProductListResponseDto, p);
            if (p.category_id) {
                dto.category_name = catMap[p.category_id.toString()];
            }
            return dto;
        });
    }
}
