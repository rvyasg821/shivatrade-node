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
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
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

import { RfqService } from '../services/rfq.service';
import { RfqVendorSheetService } from '../services/rfq-vendor-sheet.service';
import {
    RfqAddVendorsDto,
    RfqCreateFromLeadDto,
    RfqSelectPriceDto,
    RfqSetPricesDto,
    RfqUpdateDto,
} from '../dtos/request/rfq.request.dto';
import {
    RfqGetResponseDto,
    RfqListResponseDto,
    RfqStatsResponseDto,
} from '../dtos/response/rfq.response.dto';

@ApiTags('admin.rfq')
@Controller({ version: '1', path: '/admin/rfq' })
export class RfqAdminController {
    constructor(
        private readonly rfqService: RfqService,
        private readonly rfqVendorSheetService: RfqVendorSheetService
    ) {}

    // Per-vendor RFQ price-request sheets bundled into one ZIP. Draft-aware:
    // keyed off lead_id + vendor_ids (no rfq_id exists yet).
    @AuthJwtAccessProtected()
    @Get('/vendor-price-sheets')
    async vendorPriceSheets(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse,
        @Query('lead_id') leadId?: string,
        @Query('vendor_ids') vendorIdsRaw?: string
    ): Promise<void> {
        const vendorIds = (vendorIdsRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const { filename, zip } =
            await this.rfqVendorSheetService.buildVendorPriceSheets(
                companyId,
                leadId || '',
                vendorIds
            );
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.end(zip);
    }

    // Single-vendor price-request sheet (one .xlsx). product_ids = the checked
    // line items (the products this vendor supplies). Draft-aware (lead_id).
    @AuthJwtAccessProtected()
    @Get('/vendor-price-sheet')
    async vendorPriceSheet(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse,
        @Query('lead_id') leadId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('product_ids') productIdsRaw?: string
    ): Promise<void> {
        const productIds = (productIdsRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const { filename, buffer } =
            await this.rfqVendorSheetService.buildVendorPriceSheet(
                companyId,
                leadId || '',
                vendorId || '',
                productIds
            );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.end(buffer);
    }

    // Import one vendor's returned price sheet. Vendor identity = the `vendor_id`
    // query param (the dropdown), NOT the sheet. Returns parsed rows for the
    // grid + per-row errors; also upserts the price list.
    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import-vendor-prices')
    async importVendorPrices(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('vendor_id') vendorId?: string,
        @Query('preview') preview?: string,
        @Query('rfq_id') rfqId?: string
    ): Promise<IResponse<any>> {
        if (!file) throw new BadRequestException('No file provided');
        if (!vendorId) throw new BadRequestException('vendor_id is required');
        const data = await this.rfqVendorSheetService.importVendorPrices(
            companyId,
            vendorId,
            file.buffer,
            userId,
            preview === 'true',
            rfqId
        );
        return { data };
    }

    @Response('rfq.create')
    @AuthJwtAccessProtected()
    @Post('/from-lead/:leadId')
    async createFromLead(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Body() body: RfqCreateFromLeadDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        const rfq = await this.rfqService.createFromLead(
            companyId,
            leadId,
            body,
            userId
        );
        return { data: await this.rfqService.mapGet(companyId, rfq._id.toString()) };
    }

    @ResponsePaging('rfq.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('lead_id') leadId?: string,
        @Query('search') search?: string
    ): Promise<IResponsePaging<RfqListResponseDto>> {
        const filters = {
            status: parseRfqStatusParam(status),
            lead_id: leadId,
            search,
        };
        const find = this.rfqService.buildListFind(companyId, filters);
        const data = await this.rfqService.list(companyId, {
            find,
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.rfqService.count(companyId, filters);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('rfq.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('status') status?: string,
        @Query('lead_id') leadId?: string,
        @Query('search') search?: string
    ): Promise<IResponse<RfqStatsResponseDto>> {
        const data = await this.rfqService.stats(companyId, {
            status: parseRfqStatusParam(status),
            lead_id: leadId,
            search,
        });
        return { data };
    }

    @Response('rfq.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<RfqGetResponseDto>> {
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqUpdateDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.update(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async remove(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<{ deleted: boolean }>> {
        await this.rfqService.deleteWithGuard(companyId, id);
        return { data: { deleted: true } };
    }

    @Response('rfq.vendors')
    @AuthJwtAccessProtected()
    @Post('/:id/vendors')
    async addVendors(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqAddVendorsDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.addVendors(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.vendors')
    @AuthJwtAccessProtected()
    @Delete('/:id/vendors/:vendorId')
    async removeVendor(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Param('vendorId') vendorId: string
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.removeVendor(companyId, id, vendorId);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.prices')
    @AuthJwtAccessProtected()
    @Post('/:id/prices')
    async setPrices(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqSetPricesDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.setPrices(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.select')
    @AuthJwtAccessProtected()
    @Post('/:id/select')
    async selectPrice(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqSelectPriceDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.selectPrice(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Query('vendor_id') vendorId: string | undefined,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } = await this.rfqService.generatePdf(
            companyId,
            id,
            vendorId
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

// Normalize the `status` query param: `undefined` for empty, the string
// itself for one status, or an array when comma-separated (the "In
// Progress" tile sends `draft,sent,quoting`).
function parseRfqStatusParam(
    status?: string
): string | string[] | undefined {
    if (!status) return undefined;
    const parts = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0] : parts;
}
