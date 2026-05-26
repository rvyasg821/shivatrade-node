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
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';

import { CategoryService } from '../services/category.service';
import { CategoryImportExportService } from '../services/category.import-export.service';
import { CategoryRepository } from '../repository/repositories/category.repository';
import { CategoryCreateRequestDto } from '../dtos/request/category.create.request.dto';
import { CategoryUpdateRequestDto } from '../dtos/request/category.update.request.dto';
import { CategoryGetResponseDto } from '../dtos/response/category.get.response.dto';
import { CategoryListResponseDto } from '../dtos/response/category.list.response.dto';

@ApiTags('admin.category')
@Controller({
    version: '1',
    path: '/admin/category',
})
export class CategoryAdminController {
    constructor(
        private readonly categoryService: CategoryService,
        private readonly categoryRepository: CategoryRepository,
        private readonly importExportService: CategoryImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for category import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="category-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export categories as Excel' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportCategories(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="categories-${
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
        summary: 'Import categories from Excel/CSV (preview or confirm)',
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

        const result = await this.importExportService.importCategories(
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

    @Response('category.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: CategoryCreateRequestDto
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.create(companyId, body, userId);
        const data = await this.categoryService.mapGetWithParent(category);
        return { data };
    }

    @ResponsePaging('category.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<CategoryListResponseDto>> {
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
                { description: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const categories = await this.categoryRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.categoryRepository.getTotal(find);
        const data = await this.categoryService.mapListWithParent(categories);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('category.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; name: string; parent_id?: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;

        const categories = await this.categoryRepository.findAll(find, {
            order: { name: 'asc' as any },
        });

        return {
            data: categories.map((c) => ({
                _id: c._id.toString(),
                name: c.name,
                parent_id: c.parent_id ? c.parent_id.toString() : undefined,
            })),
        };
    }

    @Response('category.get')
    @AuthJwtAccessProtected()
    @Get('/get/:categoryId')
    async get(
        @Param('categoryId') categoryId: string
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.findOneById(categoryId);
        const data = await this.categoryService.mapGetWithParent(category);
        return { data };
    }

    @Response('category.update')
    @AuthJwtAccessProtected()
    @Put('/update/:categoryId')
    async update(
        @Param('categoryId') categoryId: string,
        @Body() body: CategoryUpdateRequestDto
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.findOneById(categoryId);
        const updated = await this.categoryService.update(category, body);
        const data = await this.categoryService.mapGetWithParent(updated);
        return { data };
    }

    @Response('category.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:categoryId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('categoryId') categoryId: string
    ): Promise<void> {
        const category = await this.categoryService.findOneById(categoryId);
        await this.categoryService.softDelete(category, userId);
    }
}
