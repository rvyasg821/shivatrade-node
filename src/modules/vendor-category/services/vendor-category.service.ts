import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { VendorCategoryMasterRepository } from '../repository/repositories/vendor-category.repository';
import { VendorCategoryMasterDoc } from '../repository/entities/vendor-category.entity';
import { VendorCategoryCreateRequestDto } from '../dtos/request/vendor-category.create.request.dto';
import { VendorCategoryUpdateRequestDto } from '../dtos/request/vendor-category.update.request.dto';
import { VendorCategoryGetResponseDto } from '../dtos/response/vendor-category.get.response.dto';
import { VendorCategoryListResponseDto } from '../dtos/response/vendor-category.list.response.dto';
import { VendorCategoryRepository } from '@modules/vendor/repository/repositories/vendor-category.repository';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class VendorCategoryService {
    private readonly logger = new Logger(VendorCategoryService.name);

    constructor(
        private readonly vendorCategoryRepository: VendorCategoryMasterRepository,
        // The vendor<->category join table. Injected read-only so we can block
        // deleting a master row that is still assigned to a vendor.
        private readonly vendorCategoryJoinRepository: VendorCategoryRepository
    ) {}

    async create(
        companyId: string,
        data: VendorCategoryCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<VendorCategoryMasterDoc> {
        const name = data.name.trim();

        const nameExists = await this.vendorCategoryRepository.isNameExists(
            companyId,
            name
        );
        if (nameExists) {
            throw new BadRequestException(
                `Vendor category '${name}' already exists for this company`
            );
        }

        const code = data.code?.trim();
        if (code) {
            const codeExists = await this.vendorCategoryRepository.isCodeExists(
                companyId,
                code
            );
            if (codeExists) {
                throw new BadRequestException(
                    `Vendor category code '${code}' already exists for this company`
                );
            }
        }

        const vendorCategory = await this.vendorCategoryRepository.create(
            {
                ...data,
                name,
                code: code || undefined,
                company_id: companyId,
                created_by: createdBy,
            } as any,
            options
        );

        this.logger.log(
            `Vendor category created: ${vendorCategory._id} for company: ${companyId}`
        );
        return vendorCategory;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<VendorCategoryMasterDoc[]> {
        return this.vendorCategoryRepository.findByCompanyId(companyId, options);
    }

    async findActive(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<VendorCategoryMasterDoc[]> {
        return this.vendorCategoryRepository.findActiveByCompanyId(
            companyId,
            options
        );
    }

    async findOneById(
        vendorCategoryId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<VendorCategoryMasterDoc> {
        const vendorCategory = await this.vendorCategoryRepository.findOneById(
            vendorCategoryId,
            options
        );
        if (!vendorCategory) {
            throw new NotFoundException('Vendor category not found');
        }
        return vendorCategory;
    }

    async update(
        vendorCategory: VendorCategoryMasterDoc,
        data: VendorCategoryUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<VendorCategoryMasterDoc> {
        const companyId = vendorCategory.company_id.toString();

        if (data.name && data.name.trim() !== vendorCategory.name) {
            const nameExists = await this.vendorCategoryRepository.isNameExists(
                companyId,
                data.name.trim(),
                vendorCategory._id.toString()
            );
            if (nameExists) {
                throw new BadRequestException(
                    `Vendor category '${data.name.trim()}' already exists for this company`
                );
            }
            data.name = data.name.trim();
        }

        if (data.code && data.code.trim() !== vendorCategory.code) {
            const codeExists = await this.vendorCategoryRepository.isCodeExists(
                companyId,
                data.code.trim(),
                vendorCategory._id.toString()
            );
            if (codeExists) {
                throw new BadRequestException(
                    `Vendor category code '${data.code.trim()}' already exists for this company`
                );
            }
            data.code = data.code.trim();
        }

        Object.assign(vendorCategory, data);
        const updated = await this.vendorCategoryRepository.save(
            vendorCategory,
            options
        );

        this.logger.log(`Vendor category updated: ${vendorCategory._id}`);
        return updated;
    }

    async softDelete(
        vendorCategory: VendorCategoryMasterDoc,
        deletedBy?: string,
        options?: IDatabaseSaveOptions
    ): Promise<VendorCategoryMasterDoc> {
        // Guard: block deletion if this master is still assigned to any vendor
        // through the vendor_categories join table.
        const assignedVendorIds =
            await this.vendorCategoryJoinRepository.findVendorIdsByCategoryId(
                vendorCategory.company_id.toString(),
                vendorCategory._id.toString()
            );
        if (assignedVendorIds.length > 0) {
            throw new BadRequestException(
                'Cannot delete a vendor category that is assigned to vendors'
            );
        }

        vendorCategory.soft_delete = true;
        vendorCategory.is_active = false;
        (vendorCategory as any).deleted = true;
        (vendorCategory as any).deletedAt = new Date();
        if (deletedBy) (vendorCategory as any).deletedBy = deletedBy;

        const updated = await this.vendorCategoryRepository.save(
            vendorCategory,
            options
        );

        this.logger.log(`Vendor category soft deleted: ${vendorCategory._id}`);
        return updated;
    }

    /**
     * Bulk soft-delete. Loops the SAME guarded single-delete so a vendor
     * category still assigned to vendors is skipped, not force-deleted. Returns
     * the ids actually deleted and the ones skipped with a reason.
     */
    async deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                const vendorCategory = await this.findOneById(id);
                await this.softDelete(vendorCategory, deletedBy);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
    }

    async restore(
        vendorCategory: VendorCategoryMasterDoc
    ): Promise<VendorCategoryMasterDoc> {
        vendorCategory.soft_delete = false;
        vendorCategory.is_active = true;
        (vendorCategory as any).deleted = false;
        (vendorCategory as any).deletedAt = null;
        (vendorCategory as any).deletedBy = null;

        const updated = await this.vendorCategoryRepository.save(vendorCategory);
        this.logger.log(`Vendor category restored: ${vendorCategory._id}`);
        return updated;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.vendorCategoryRepository.deleteAllByCompanyId(companyId);
    }

    mapGet(
        vendorCategory: VendorCategoryMasterDoc
    ): VendorCategoryGetResponseDto {
        return plainToInstance(VendorCategoryGetResponseDto, vendorCategory);
    }

    mapList(
        vendorCategories: VendorCategoryMasterDoc[]
    ): VendorCategoryListResponseDto[] {
        return vendorCategories.map((c) =>
            plainToInstance(VendorCategoryListResponseDto, c)
        );
    }
}
