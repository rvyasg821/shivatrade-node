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

import { GrnService } from '../services/grn.service';
import {
    GrnCreateFromPovDto,
    GrnUpdateDto,
} from '../dtos/request/grn.request.dto';
import {
    GrnGetResponseDto,
    GrnListResponseDto,
    GrnSourcePovResponseDto,
    GrnStatsResponseDto,
} from '../dtos/response/grn.response.dto';

@ApiTags('admin.grn')
@Controller({ version: '1', path: '/admin/grn' })
export class GrnAdminController {
    constructor(private readonly grnService: GrnService) {}

    @Response('grn.create')
    @AuthJwtAccessProtected()
    @Post('/from-pov/:povId')
    async createFromPov(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('povId') povId: string,
        @Body() body: GrnCreateFromPovDto
    ): Promise<IResponse<GrnGetResponseDto>> {
        const grn = await this.grnService.createFromPov(
            companyId,
            povId,
            body,
            userId
        );
        return { data: await this.grnService.mapGet(companyId, grn._id.toString()) };
    }

    @ResponsePaging('grn.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('po_vendor_id') poVendorId?: string,
        @Query('search') search?: string
    ): Promise<IResponsePaging<GrnListResponseDto>> {
        const filters = {
            status: parseGrnStatusParam(status),
            vendor_id: vendorId,
            po_vendor_id: poVendorId,
            search,
        };
        const find = this.grnService.buildListFind(companyId, filters);
        const data = await this.grnService.list(companyId, {
            find,
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.grnService.count(companyId, filters);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('grn.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('status') status?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('search') search?: string
    ): Promise<IResponse<GrnStatsResponseDto>> {
        const data = await this.grnService.stats(companyId, {
            status: parseGrnStatusParam(status),
            vendor_id: vendorId,
            search,
        });
        return { data };
    }

    @Response('grn.sourcePovs')
    @AuthJwtAccessProtected()
    @Get('/source-povs')
    async sourcePovs(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<GrnSourcePovResponseDto[]>> {
        return { data: await this.grnService.sourcePovs(companyId) };
    }

    @Response('grn.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<GrnGetResponseDto>> {
        return { data: await this.grnService.mapGet(companyId, id) };
    }

    @Response('grn.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: GrnUpdateDto
    ): Promise<IResponse<GrnGetResponseDto>> {
        await this.grnService.update(companyId, id, body, userId);
        return { data: await this.grnService.mapGet(companyId, id) };
    }

    @Response('grn.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async remove(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<{ deleted: boolean }>> {
        await this.grnService.softDelete(companyId, id);
        return { data: { deleted: true } };
    }

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } = await this.grnService.generatePdf(
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

}

// `status` query param → undefined / single / array (comma-separated).
function parseGrnStatusParam(status?: string): string | string[] | undefined {
    if (!status) return undefined;
    const parts = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0] : parts;
}
