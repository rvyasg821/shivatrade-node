import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UploadedFile,
    Res,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';

import { VendorCategoryService } from '../services/vendor-category.service';
import { VendorCategoryImportExportService } from '../services/vendor-category.import-export.service';
import { VendorCategoryMasterRepository } from '../repository/repositories/vendor-category.repository';
import { VendorCategoryCreateRequestDto } from '../dtos/request/vendor-category.create.request.dto';
import { VendorCategoryUpdateRequestDto } from '../dtos/request/vendor-category.update.request.dto';
import { VendorCategoryGetResponseDto } from '../dtos/response/vendor-category.get.response.dto';
import { VendorCategoryListResponseDto } from '../dtos/response/vendor-category.list.response.dto';

@ApiTags('admin.vendorCategory')
@Controller({
    version: '1',
    path: '/admin/vendor-category',
})
export class VendorCategoryAdminController {
    constructor(
        private readonly vendorCategoryService: VendorCategoryService,
        private readonly vendorCategoryRepository: VendorCategoryMasterRepository,
        private readonly importExportService: VendorCategoryImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for vendor category import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="vendor-category-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export vendor categories as Excel' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer =
            await this.importExportService.exportVendorCategories(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="vendor-categories-${
                new Date().toISOString().split('T')[0]
            }.xlsx"`
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import vendor categories from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');

        const { summary, rows } =
            await this.importExportService.parseAndValidate(
                file.buffer,
                companyId
            );

        if (preview === 'true') {
            return {
                statusCode: 200,
                message: 'Preview',
                data: { summary, rows },
            };
        }

        const validRows = rows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, updated: 0, errors: [] },
            };
        }

        const result =
            await this.importExportService.importVendorCategories(
                validRows,
                companyId,
                userId
            );

        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.updated} updated`,
            data: { summary, ...result },
        };
    }

    @Response('vendor-category.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: VendorCategoryCreateRequestDto
    ): Promise<IResponse<VendorCategoryGetResponseDto>> {
        const vendorCategory = await this.vendorCategoryService.create(
            companyId,
            body,
            userId
        );
        const data = this.vendorCategoryService.mapGet(vendorCategory);
        return { data };
    }

    @ResponsePaging('vendor-category.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<VendorCategoryListResponseDto>> {
        const find: any = {
            soft_delete: false,
        };

        if (companyId) {
            find.company_id = companyId;
        }

        if (status === 'ACTIVE') {
            find.is_active = true;
        } else if (status === 'INACTIVE') {
            find.is_active = false;
        }

        // The PaginationSearchPipe only populates `_search` when the route
        // declares `availableSearch` options — which we don't. Fall back to
        // the raw `search` query param so the listing search box works.
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : null);
        if (searchTerm) {
            find.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { code: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const vendorCategories = await this.vendorCategoryRepository.findAll(
            find,
            {
                paging: { limit: _limit, offset: _offset },
                order: _order,
            }
        );

        const total = await this.vendorCategoryRepository.getTotal(find);
        const data = this.vendorCategoryService.mapList(vendorCategories);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('vendor-category.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; name: string; code?: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;

        const vendorCategories = await this.vendorCategoryRepository.findAll(
            find,
            {
                order: { name: 'asc' as any },
            }
        );

        return {
            data: vendorCategories.map((c) => ({
                _id: c._id.toString(),
                name: c.name,
                code: c.code || undefined,
            })),
        };
    }

    @Response('vendor-category.get')
    @AuthJwtAccessProtected()
    @Get('/get/:vendorCategoryId')
    async get(
        @Param('vendorCategoryId') vendorCategoryId: string
    ): Promise<IResponse<VendorCategoryGetResponseDto>> {
        const vendorCategory =
            await this.vendorCategoryService.findOneById(vendorCategoryId);
        const data = this.vendorCategoryService.mapGet(vendorCategory);
        return { data };
    }

    @Response('vendor-category.update')
    @AuthJwtAccessProtected()
    @Put('/update/:vendorCategoryId')
    async update(
        @Param('vendorCategoryId') vendorCategoryId: string,
        @Body() body: VendorCategoryUpdateRequestDto
    ): Promise<IResponse<VendorCategoryGetResponseDto>> {
        const vendorCategory =
            await this.vendorCategoryService.findOneById(vendorCategoryId);
        const updated = await this.vendorCategoryService.update(
            vendorCategory,
            body
        );
        const data = this.vendorCategoryService.mapGet(updated);
        return { data };
    }

    @Response('vendor-category.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:vendorCategoryId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('vendorCategoryId') vendorCategoryId: string
    ): Promise<void> {
        const vendorCategory =
            await this.vendorCategoryService.findOneById(vendorCategoryId);
        await this.vendorCategoryService.softDelete(vendorCategory, userId);
    }

    @Response('vendor-category.delete')
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @AuthJwtPayload('user') userId: string,
        @Body() body: { ids: string[] }
    ): Promise<IResponse<{ deleted: string[]; skipped: any[] }>> {
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }
        const data = await this.vendorCategoryService.deleteMany(ids, userId);
        return { data };
    }
}
