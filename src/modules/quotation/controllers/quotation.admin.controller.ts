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
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags } from '@nestjs/swagger';
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
import { signPdfTicket } from '@common/pdf/pdf-ticket.util';

import { QuotationService } from '../services/quotation.service';
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
        private readonly quotationRepository: QuotationRepository
    ) {}

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
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('customer_id') customerId?: string,
        @Query('lead_id') leadId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<QuotationGetResponseDto>> {
        // Status accepts a single value or comma-separated list — the
        // tile strip uses csv for multi-status buckets like "Draft + Sent".
        const statusValue = parseStatusParam(status);
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : '');
        const find = this.quotationService.buildListFind(companyId, {
            customer_id: customerId,
            lead_id: leadId,
            status: statusValue,
            date_from: dateFrom,
            date_to: dateTo,
            search: searchTerm,
        });

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
        @Query('customer_id') customerId?: string,
        @Query('lead_id') leadId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponse<QuotationStatsResponseDto>> {
        const statusValue = parseStatusParam(status);
        const data = await this.quotationService.stats(companyId, {
            customer_id: customerId,
            lead_id: leadId,
            status: statusValue,
            date_from: dateFrom,
            date_to: dateTo,
            search: searchRaw,
        });
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
        await this.quotationService.softDelete(row);
        return { data: null };
    }

    // ─── Public share link ──────────────────────────────────────────────

    @Response('quotation.publish')
    @AuthJwtAccessProtected()
    @Post('/publish/:id')
    async publish(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.publish(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.rotateToken')
    @AuthJwtAccessProtected()
    @Post('/rotate-token/:id')
    async rotateToken(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.rotateToken(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.unpublish')
    @AuthJwtAccessProtected()
    @Post('/unpublish/:id')
    async unpublish(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.unpublish(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    /** Admin-only "preview as client" — the exact sanitized projection the
     *  public route serves, but works in ANY status (incl. draft) so the
     *  user can see the client-facing layout before publishing. */
    @Response('quotation.publicPreview')
    @AuthJwtAccessProtected()
    @Get('/public-preview/:id')
    async publicPreview(@Param('id') id: string): Promise<IResponse<any>> {
        const row = await this.quotationService.findOneById(id);
        return { data: await this.quotationService.mapPublic(row) };
    }

    /** Mint a short-lived ticket so the browser can open the PDF inline in a
     *  new tab (with the proper filename) via the no-auth public route. */
    @Response('quotation.get')
    @AuthJwtAccessProtected()
    @Get('/:id/pdf-ticket')
    async pdfTicket(
        @Param('id') id: string
    ): Promise<IResponse<{ ticket: string }>> {
        // Make sure the quotation exists (and is in this company's scope).
        await this.quotationService.findOneById(id);
        return { data: { ticket: signPdfTicket('quotation', id) } };
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
