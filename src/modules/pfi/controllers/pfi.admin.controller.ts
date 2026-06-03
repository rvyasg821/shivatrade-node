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
    ForbiddenException,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
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

import { PfiService } from '../services/pfi.service';
import { PfiPdfService } from '../services/pfi-pdf.service';
import { PfiRepository } from '../repository/repositories/pfi.repository';
import { PfiCreateRequestDto } from '../dtos/request/pfi.create.request.dto';
import { PfiUpdateRequestDto } from '../dtos/request/pfi.update.request.dto';
import { PfiGetResponseDto } from '../dtos/response/pfi.get.response.dto';
import { PfiStatsResponseDto } from '../dtos/response/pfi.stats.response.dto';

// PFI is retired from the workflow (Sales S4): Quotation → Sales Order is
// the path. Write/share endpoints are blocked so nothing new can be created
// — read endpoints stay so existing PFIs remain accessible. Set
// PFI_RETIRED=false to re-enable.
const PFI_RETIRED = process.env.PFI_RETIRED !== 'false';
const assertPfiNotRetired = () => {
    if (PFI_RETIRED) {
        throw new ForbiddenException(
            'PFI is retired. Generate a Sales Order from the Quotation instead.'
        );
    }
};

@ApiTags('admin.pfi')
@Controller({ version: '1', path: '/admin/pfi' })
export class PfiAdminController {
    constructor(
        private readonly pfiService: PfiService,
        private readonly pfiRepository: PfiRepository,
        private readonly pfiPdfService: PfiPdfService
    ) {}

    @Response('pfi.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PfiCreateRequestDto
    ): Promise<IResponse<PfiGetResponseDto>> {
        assertPfiNotRetired();
        const row = await this.pfiService.create(companyId, body, userId);
        return { data: await this.pfiService.mapGet(row) };
    }

    @Response('pfi.createFromQuotation')
    @AuthJwtAccessProtected()
    @Post('/from-quotation/:quotationId')
    async createFromQuotation(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('quotationId') quotationId: string
    ): Promise<IResponse<PfiGetResponseDto>> {
        assertPfiNotRetired();
        const row = await this.pfiService.createFromQuotation(
            companyId,
            quotationId,
            userId
        );
        return { data: await this.pfiService.mapGet(row) };
    }

    @ResponsePaging('pfi.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('customer_id') customerId?: string,
        @Query('quotation_id') quotationId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<PfiGetResponseDto>> {
        const statusValue = parseStatusParam(status);
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : '');
        const find = this.pfiService.buildListFind(companyId, {
            customer_id: customerId,
            quotation_id: quotationId,
            status: statusValue,
            date_from: dateFrom,
            date_to: dateTo,
            search: searchTerm,
        });

        const rows = await this.pfiRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });

        const total = await this.pfiRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.pfiService.mapList(rows),
        };
    }

    @Response('pfi.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('customer_id') customerId?: string,
        @Query('quotation_id') quotationId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponse<PfiStatsResponseDto>> {
        const statusValue = parseStatusParam(status);
        const data = await this.pfiService.stats(companyId, {
            customer_id: customerId,
            quotation_id: quotationId,
            status: statusValue,
            date_from: dateFrom,
            date_to: dateTo,
            search: searchRaw,
        });
        return { data };
    }

    @Response('pfi.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<PfiGetResponseDto>> {
        const row = await this.pfiService.findOneById(id);
        return { data: await this.pfiService.mapGet(row) };
    }

    @Response('pfi.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: PfiUpdateRequestDto
    ): Promise<IResponse<PfiGetResponseDto>> {
        const row = await this.pfiService.findOneById(id);
        const updated = await this.pfiService.update(row, body);
        return { data: await this.pfiService.mapGet(updated) };
    }

    @Response('pfi.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.pfiService.findOneById(id);
        await this.pfiService.softDelete(row);
        return { data: null };
    }

    // ─── Public share link ──────────────────────────────────────────────

    @Response('pfi.publish')
    @AuthJwtAccessProtected()
    @Post('/publish/:id')
    async publish(
        @Param('id') id: string
    ): Promise<IResponse<PfiGetResponseDto>> {
        assertPfiNotRetired();
        const row = await this.pfiService.publish(id);
        return { data: await this.pfiService.mapGet(row) };
    }

    @Response('pfi.rotateToken')
    @AuthJwtAccessProtected()
    @Post('/rotate-token/:id')
    async rotateToken(
        @Param('id') id: string
    ): Promise<IResponse<PfiGetResponseDto>> {
        assertPfiNotRetired();
        const row = await this.pfiService.rotateToken(id);
        return { data: await this.pfiService.mapGet(row) };
    }

    @Response('pfi.unpublish')
    @AuthJwtAccessProtected()
    @Post('/unpublish/:id')
    async unpublish(
        @Param('id') id: string
    ): Promise<IResponse<PfiGetResponseDto>> {
        const row = await this.pfiService.unpublish(id);
        return { data: await this.pfiService.mapGet(row) };
    }

    /** Admin-only "preview as client" — the exact sanitized projection the
     *  public route serves, but works in ANY status (incl. draft) so the
     *  user can see the client-facing layout before publishing. */
    @Response('pfi.publicPreview')
    @AuthJwtAccessProtected()
    @Get('/public-preview/:id')
    async publicPreview(@Param('id') id: string): Promise<IResponse<any>> {
        const row = await this.pfiService.findOneById(id);
        return { data: await this.pfiService.mapPublic(row) };
    }

    /** Admin PDF download — works in any status. Streams the file directly
     *  (bypasses the standard JSON envelope decorator). */
    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async adminPdf(
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.pfiService.findOneById(id);
        const dto = await this.pfiService.mapPublic(row);
        const buf = await this.pfiPdfService.render(dto);
        const filename = this.pfiPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buf.length);
        res.end(buf);
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
