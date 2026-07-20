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
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';
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

import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { QuotationService } from '../services/quotation.service';
import { QuotationImportExportService } from '../services/quotation.import-export.service';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationCreateRequestDto } from '../dtos/request/quotation.create.request.dto';
import { QuotationUpdateRequestDto } from '../dtos/request/quotation.update.request.dto';
import { QuotationGetResponseDto } from '../dtos/response/quotation.get.response.dto';
import { QuotationStatsResponseDto } from '../dtos/response/quotation.stats.response.dto';

@ApiTags('admin.quotation')
@Controller({ version: '1', path: '/admin/quotation' })
export class QuotationAdminController {
    constructor(
        private readonly quotationService: QuotationService,
        private readonly quotationRepository: QuotationRepository,
        private readonly importExportService: QuotationImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for quotation import' })
    async downloadSampleExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.generateSampleExcel(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="quotation-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({
        summary: 'Export quotations to Excel (import template shape)',
    })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportQuotations(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="quotations-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import quotations from Excel/CSV (preview or confirm)',
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
        const validDocs = rows.filter((r) => r.status !== 'error');
        if (validDocs.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, skipped: 0, errors: [] },
            };
        }
        const result = await this.importExportService.importQuotations(
            validDocs,
            companyId,
            userId
        );
        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.skipped} skipped`,
            data: { summary, ...result },
        };
    }

    @Response('quotation.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: QuotationCreateRequestDto
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.create(companyId, body, userId);
        return { data: await this.quotationService.mapGet(row) };
    }

    @ResponsePaging('quotation.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('customer_id') customerId?: string,
        @Query('lead_id') leadId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<QuotationGetResponseDto>> {
        // Status accepts a single value or comma-separated list — the
        // tile strip uses csv for multi-status buckets like "Draft + Sent".
        const statusValue = parseStatusParam(status);
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : '');
        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const find = {
            ...this.quotationService.buildListFind(companyId, {
                customer_id: customerId,
                lead_id: leadId,
                status: statusValue,
                date_from: dateFrom,
                date_to: dateTo,
                search: searchTerm,
            }),
            ...CreatorScopeService.toFind(creatorValue),
        };

        const rows = await this.quotationRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });

        const total = await this.quotationRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.quotationService.mapList(rows),
        };
    }

    @Response('quotation.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('customer_id') customerId?: string,
        @Query('lead_id') leadId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<QuotationStatsResponseDto>> {
        const statusValue = parseStatusParam(status);
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.quotationService.stats(
            companyId,
            {
                customer_id: customerId,
                lead_id: leadId,
                status: statusValue,
                date_from: dateFrom,
                date_to: dateTo,
                search: searchRaw,
            },
            creatorValue
        );
        return { data };
    }

    @Response('quotation.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.findOneById(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: QuotationUpdateRequestDto
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.findOneById(id);
        const updated = await this.quotationService.update(row, body);
        return { data: await this.quotationService.mapGet(updated) };
    }

    @Response('quotation.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.quotationService.findOneById(id);
        await this.quotationService.deleteWithGuard(row);
        return { data: null };
    }

    /** Client-facing PDF (same sanitized projection as the preview). Streamed
     *  inline so the FE can open it as a blob in a new tab. */
    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } =
            await this.quotationService.generatePdf(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${filename}"`
        );
        res.end(buffer);
    }
}

// Normalize `status` query: empty → undefined, "a" → "a", "a,b" → ["a","b"].
function parseStatusParam(raw?: string): string | string[] | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (!trimmed.includes(',')) return trimmed;
    const parts = trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return parts;
}
