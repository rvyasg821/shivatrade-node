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
import { signPdfTicket } from '@common/pdf/pdf-ticket.util';
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

import { DebitNoteService } from '../services/debit-note.service';
import {
    DebitNoteCreateFromGrnDto,
    DebitNoteUpdateDto,
} from '../dtos/request/debit-note.request.dto';
import {
    DebitNoteGetResponseDto,
    DebitNoteListResponseDto,
} from '../dtos/response/debit-note.response.dto';

@ApiTags('admin.debitNote')
@Controller({ version: '1', path: '/admin/debit-note' })
export class DebitNoteAdminController {
    constructor(private readonly debitNoteService: DebitNoteService) {}

    @Response('debitNote.create')
    @AuthJwtAccessProtected()
    @Post('/from-grn/:grnId')
    async createFromGrn(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('grnId') grnId: string,
        @Body() body: DebitNoteCreateFromGrnDto
    ): Promise<IResponse<DebitNoteGetResponseDto>> {
        const dn = await this.debitNoteService.createFromGrn(
            companyId,
            grnId,
            body,
            userId
        );
        return {
            data: await this.debitNoteService.mapGet(
                companyId,
                dn._id.toString()
            ),
        };
    }

    @ResponsePaging('debitNote.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('grn_id') grnId?: string,
        @Query('po_vendor_id') poVendorId?: string,
        @Query('search') search?: string
    ): Promise<IResponsePaging<DebitNoteListResponseDto>> {
        const filters = {
            status: parseStatusParam(status),
            vendor_id: vendorId,
            grn_id: grnId,
            po_vendor_id: poVendorId,
            search,
        };
        const find = this.debitNoteService.buildListFind(companyId, filters);
        const data = await this.debitNoteService.list(companyId, {
            find,
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.debitNoteService.count(companyId, filters);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('debitNote.forGrn')
    @AuthJwtAccessProtected()
    @Get('/for-grn/:grnId')
    async forGrn(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('grnId') grnId: string
    ): Promise<IResponse<DebitNoteListResponseDto[]>> {
        return {
            data: await this.debitNoteService.listByGrn(companyId, grnId),
        };
    }

    @Response('debitNote.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<DebitNoteGetResponseDto>> {
        return { data: await this.debitNoteService.mapGet(companyId, id) };
    }

    @Response('debitNote.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: DebitNoteUpdateDto
    ): Promise<IResponse<DebitNoteGetResponseDto>> {
        await this.debitNoteService.update(companyId, id, body, userId);
        return { data: await this.debitNoteService.mapGet(companyId, id) };
    }

    @Response('debitNote.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async remove(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<{ deleted: boolean }>> {
        await this.debitNoteService.softDelete(companyId, id);
        return { data: { deleted: true } };
    }

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } = await this.debitNoteService.generatePdf(
            companyId,
            id
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
    }

    /** Mint a short-lived ticket so the browser can open the Debit Note PDF
     *  inline in a new tab (proper filename) via the no-auth public route. */
    @Response('debitNote.get')
    @AuthJwtAccessProtected()
    @Get('/:id/pdf-ticket')
    async pdfTicket(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<{ ticket: string }>> {
        // Ensure the DN exists within the caller's company scope.
        await this.debitNoteService.mapGet(companyId, id);
        return { data: { ticket: signPdfTicket('debit-note', id) } };
    }
}

// `status` query param → undefined / single / array (comma-separated).
function parseStatusParam(status?: string): string | string[] | undefined {
    if (!status) return undefined;
    const parts = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!parts.length) return undefined;
    return parts.length === 1 ? parts[0] : parts;
}
