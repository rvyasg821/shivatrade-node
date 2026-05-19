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
import type { Response as ExpressResponse } from 'express';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
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

import { PurchaseOrderService } from '../services/purchase-order.service';
import { PoPdfService } from '../services/po-pdf.service';
import { PurchaseOrderRepository } from '../repository/repositories/purchase-order.repository';
import { PurchaseOrderCreateRequestDto } from '../dtos/request/purchase-order.create.request.dto';
import { PurchaseOrderUpdateRequestDto } from '../dtos/request/purchase-order.update.request.dto';
import { PurchaseOrderAutoSplitRequestDto } from '../dtos/request/purchase-order.auto-split.request.dto';
import { PurchaseOrderGetResponseDto } from '../dtos/response/purchase-order.get.response.dto';
import { PoCoverageService } from '@modules/po-vendor/services/po-coverage.service';
import { PoCoverageResponseDto } from '@modules/po-vendor/dtos/response/po-coverage.response.dto';

@ApiTags('admin.purchase-order')
@Controller({ version: '1', path: '/admin/purchase-order' })
export class PurchaseOrderAdminController {
    constructor(
        private readonly poService: PurchaseOrderService,
        private readonly poPdfService: PoPdfService,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poCoverageService: PoCoverageService
    ) {}

    @Response('purchaseOrder.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PurchaseOrderCreateRequestDto
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.create(companyId, body, userId);
        return { data: await this.poService.mapGet(row) };
    }

    @ResponsePaging('purchaseOrder.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'vendor_id', required: false, type: String })
    @ApiQuery({ name: 'customer_id', required: false, type: String })
    @ApiQuery({ name: 'quotation_id', required: false, type: String })
    @ApiQuery({ name: 'pfi_id', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'date_from', required: false, type: String })
    @ApiQuery({ name: 'date_to', required: false, type: String })
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery()
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('vendor_id') vendorId?: string,
        @Query('customer_id') customerId?: string,
        @Query('quotation_id') quotationId?: string,
        @Query('pfi_id') pfiId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<PurchaseOrderGetResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (vendorId) find.vendor_id = vendorId;
        if (customerId) find.customer_id = customerId;
        if (quotationId) find.quotation_id = quotationId;
        if (pfiId) find.pfi_id = pfiId;
        if (status) find.status = status;
        if (dateFrom && dateTo) {
            find.po_date = { $gte: dateFrom, $lte: dateTo };
        } else if (dateFrom) {
            find.po_date = { $gte: dateFrom };
        } else if (dateTo) {
            find.po_date = { $lte: dateTo };
        }

        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { notes_to_vendor: { $regex: _search, $options: 'i' } },
            ];
        }

        const rows = await this.poRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });
        const total = await this.poRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.poService.mapList(rows),
        };
    }

    @Response('purchaseOrder.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.findOneById(id);
        return { data: await this.poService.mapGet(row) };
    }

    @Response('purchaseOrder.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: PurchaseOrderUpdateRequestDto
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.findOneById(id);
        const updated = await this.poService.update(row, body);
        return { data: await this.poService.mapGet(updated) };
    }

    @Response('purchaseOrder.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.poService.findOneById(id);
        await this.poService.softDelete(row);
        return { data: null };
    }

    // ─── Auto-split from PFI / Quotation ────────────────────────────────

    @Response('purchaseOrder.previewFromPfi')
    @AuthJwtAccessProtected()
    @Get('/preview-from-pfi/:pfiId')
    async previewFromPfi(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('pfiId') pfiId: string
    ): Promise<IResponse<any>> {
        return { data: await this.poService.previewFromPfi(companyId, pfiId) };
    }

    @Response('purchaseOrder.previewFromQuotation')
    @AuthJwtAccessProtected()
    @Get('/preview-from-quotation/:quotationId')
    async previewFromQuotation(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('quotationId') quotationId: string
    ): Promise<IResponse<any>> {
        return {
            data: await this.poService.previewFromQuotation(
                companyId,
                quotationId
            ),
        };
    }

    @Response('purchaseOrder.createFromPfi')
    @AuthJwtAccessProtected()
    @Post('/from-pfi/:pfiId')
    async createFromPfi(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('pfiId') pfiId: string,
        @Body() body: PurchaseOrderAutoSplitRequestDto
    ): Promise<IResponse<any>> {
        const out = await this.poService.createFromPfi(
            companyId,
            pfiId,
            userId,
            body.assignments
        );
        const mapped = await this.poService.mapList(out.created);
        return { data: { created: mapped, skipped: out.skipped } };
    }

    @Response('purchaseOrder.createFromQuotation')
    @AuthJwtAccessProtected()
    @Post('/from-quotation/:quotationId')
    async createFromQuotation(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('quotationId') quotationId: string,
        @Body() body: PurchaseOrderAutoSplitRequestDto
    ): Promise<IResponse<any>> {
        const out = await this.poService.createFromQuotation(
            companyId,
            quotationId,
            userId,
            body.assignments
        );
        const mapped = await this.poService.mapList(out.created);
        return { data: { created: mapped, skipped: out.skipped } };
    }

    /** Admin PDF download — streams the file directly (bypasses the standard
     *  JSON envelope decorator). Works in any status. */
    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async adminPdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.poService.findOneById(id);
        const dto = await this.poService.mapGet(row);
        const buf = await this.poPdfService.render(dto, companyId);
        const filename = this.poPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    /** Per-PO coverage roll-up (POV plan §14 — feeds Vendor Tracking tab). */
    @Response('purchaseOrder.coverage')
    @AuthJwtAccessProtected()
    @Get('/:id/coverage')
    async coverage(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<PoCoverageResponseDto>> {
        const data = await this.poCoverageService.getCoverage(companyId, id);
        return { data };
    }
}
