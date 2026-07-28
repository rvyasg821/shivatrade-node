import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Res,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
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
import {
    datedFilename,
    handleImportRequest,
    sendExcel,
} from '@common/import/master-import.helper';

import { ExpenseService } from '../services/expense.service';
import { ExpenseImportExportService } from '../services/expense.import-export.service';
import { ExpenseRepository } from '../repository/repositories/expense.repository';
import { ExpenseCreateRequestDto } from '../dtos/request/expense.create.request.dto';
import { ExpenseUpdateRequestDto } from '../dtos/request/expense.update.request.dto';
import { ExpenseGetResponseDto } from '../dtos/response/expense.get.response.dto';
import { ExpenseListResponseDto } from '../dtos/response/expense.list.response.dto';

@ApiTags('admin.expense')
@Controller({ version: '1', path: '/admin/expense' })
export class ExpenseAdminController {
    constructor(
        private readonly expenseService: ExpenseService,
        private readonly expenseRepository: ExpenseRepository,
        private readonly importExportService: ExpenseImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for expense import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            this.importExportService.generateSampleExcel(),
            'expense-import-sample.xlsx'
        );
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export expenses as Excel' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        sendExcel(
            res,
            await this.importExportService.exportExpenses(companyId),
            datedFilename('expenses')
        );
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({ summary: 'Import expenses from Excel/CSV (preview or confirm)' })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');
        return handleImportRequest(
            file,
            preview,
            () => this.importExportService.parseAndValidate(file.buffer, companyId),
            (validRows) =>
                this.importExportService.importExpenses(
                    validRows,
                    companyId,
                    userId
                )
        );
    }

    @Response('expense.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ExpenseCreateRequestDto
    ): Promise<IResponse<ExpenseGetResponseDto>> {
        const expense = await this.expenseService.create(companyId, body, userId);
        return { data: this.expenseService.mapGet(expense) };
    }

    @ResponsePaging('expense.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<ExpenseListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;
        // PaginationSearchPipe doesn't populate `_search` without an
        // `availableSearch` option — fall back to the raw `search` query.
        // ExpenseEntity has no `description` column, so search is limited
        // to `name` and `code` (the only text fields on the entity).
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : null);
        if (searchTerm) {
            find.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { code: { $regex: searchTerm, $options: 'i' } },
            ];
        }
        const expenses = await this.expenseRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.expenseRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: this.expenseService.mapList(expenses),
        };
    }

    @Response('expense.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; name: string; code: string; type: string; value: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const expenses = await this.expenseRepository.findAll(find, {
            order: { name: 'asc' as any },
        });
        return {
            data: expenses.map((e) => ({
                _id: e._id.toString(),
                name: e.name,
                code: e.code,
                type: e.type,
                value: e.value,
            })),
        };
    }

    @Response('expense.get')
    @AuthJwtAccessProtected()
    @Get('/get/:expenseId')
    async get(
        @Param('expenseId') expenseId: string
    ): Promise<IResponse<ExpenseGetResponseDto>> {
        const expense = await this.expenseService.findOneById(expenseId);
        return { data: this.expenseService.mapGet(expense) };
    }

    @Response('expense.update')
    @AuthJwtAccessProtected()
    @Put('/update/:expenseId')
    async update(
        @Param('expenseId') expenseId: string,
        @Body() body: ExpenseUpdateRequestDto
    ): Promise<IResponse<ExpenseGetResponseDto>> {
        const expense = await this.expenseService.findOneById(expenseId);
        const updated = await this.expenseService.update(expense, body);
        return { data: this.expenseService.mapGet(updated) };
    }

    @Response('expense.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:expenseId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('expenseId') expenseId: string
    ): Promise<void> {
        const expense = await this.expenseService.findOneById(expenseId);
        await this.expenseService.softDelete(expense, userId);
    }

    @Response('expense.delete')
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
        const data = await this.expenseService.deleteMany(ids, userId);
        return { data };
    }
}
