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

import { PoVendorService } from '../services/po-vendor.service';
import { PoVendorPdfService } from '../services/po-vendor-pdf.service';
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorCreateRequestDto } from '../dtos/request/po-vendor.create.request.dto';
import { PoVendorUpdateRequestDto } from '../dtos/request/po-vendor.update.request.dto';
import { PoVendorDispatchRequestDto } from '../dtos/request/po-vendor.dispatch.request.dto';
import { PoVendorReceiveRequestDto } from '../dtos/request/po-vendor.receive.request.dto';
import { PoVendorCancelRequestDto } from '../dtos/request/po-vendor.cancel.request.dto';
import { PoVendorRecoverRequestDto } from '../dtos/request/po-vendor.recover.request.dto';
import { PoVendorGetResponseDto } from '../dtos/response/po-vendor.get.response.dto';
import { PoVendorRecoverPreviewResponseDto } from '../dtos/response/po-vendor.recover-preview.response.dto';

@ApiTags('admin.po-vendor')
@Controller({ version: '1', path: '/admin/po-vendor' })
export class PoVendorAdminController {
    constructor(
        private readonly povService: PoVendorService,
        private readonly povRepository: PoVendorRepository,
        private readonly povPdfService: PoVendorPdfService
    ) {}

    // ─── Recover (multi-vendor batch) ───────────────────────────────────
    //
    // Surfaces only when has_pending=true on PO Coverage (e.g. after POV
    // cancel). Mirrors the PFI→PO modal: per-line vendor pick, default to
    // line's current vendor_id, submit creates N POVs grouped by vendor.

    @Response('poVendor.recoverPreview')
    @AuthJwtAccessProtected()
    @Get('/recover-preview/:poId')
    async recoverPreview(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('poId') poId: string
    ): Promise<IResponse<PoVendorRecoverPreviewResponseDto>> {
        const data = await this.povService.recoverPreviewByPoId(
            companyId,
            poId
        );
        return { data };
    }

    @Response('poVendor.recover')
    @AuthJwtAccessProtected()
    @Post('/recover/:poId')
    async recover(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('poId') poId: string,
        @Body() body: PoVendorRecoverRequestDto
    ): Promise<IResponse<{ created: PoVendorGetResponseDto[] }>> {
        const { created } = await this.povService.recoverFromPo(
            companyId,
            poId,
            body,
            userId
        );
        const mapped = await Promise.all(
            created.map(r => this.povService.mapGet(r))
        );
        return { data: { created: mapped } };
    }

    // ─── Create from PO ─────────────────────────────────────────────────

    @Response('poVendor.createFromPo')
    @AuthJwtAccessProtected()
    @Post('/from-po/:poId')
    async createFromPo(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('poId') poId: string,
        @Body() body: PoVendorCreateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.createFromPo(
            companyId,
            poId,
            body,
            userId
        );
        return { data: await this.povService.mapGet(row) };
    }

    // ─── List ───────────────────────────────────────────────────────────

    @ResponsePaging('poVendor.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'purchase_order_id', required: false, type: String })
    @ApiQuery({ name: 'vendor_id', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'date_from', required: false, type: String })
    @ApiQuery({ name: 'date_to', required: false, type: String })
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery()
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<PoVendorGetResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (purchaseOrderId) find.purchase_order_id = purchaseOrderId;
        if (vendorId) find.vendor_id = vendorId;
        if (status) find.status = status;
        if (dateFrom && dateTo) {
            find.dispatch_date = { $gte: dateFrom, $lte: dateTo };
        } else if (dateFrom) {
            find.dispatch_date = { $gte: dateFrom };
        } else if (dateTo) {
            find.dispatch_date = { $lte: dateTo };
        }

        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { lr_no: { $regex: _search, $options: 'i' } },
                { eway_bill_no: { $regex: _search, $options: 'i' } },
            ];
        }

        const rows = await this.povRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });
        const total = await this.povRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.povService.mapList(rows),
        };
    }

    // ─── Stats (list tiles) ─────────────────────────────────────────────

    @Response('poVendor.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponse<{ total: number; by_status: Record<string, number> }>> {
        // CSV status → array (the tiles pass comma-separated statuses).
        let statusValue: string | string[] | undefined;
        if (status) {
            const parts = status
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            statusValue = parts.length > 1 ? parts : parts[0];
        }
        const data = await this.povService.stats(companyId, {
            purchase_order_id: purchaseOrderId,
            vendor_id: vendorId,
            status: statusValue,
            date_from: dateFrom,
            date_to: dateTo,
            search: searchRaw,
        });
        return { data };
    }

    // ─── Detail ─────────────────────────────────────────────────────────

    @Response('poVendor.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        return { data: await this.povService.mapGet(row) };
    }

    // ─── PDF download (dispatch advice) ─────────────────────────────────

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.povService.findOneById(id);
        const dto = await this.povService.mapGet(row);
        const buf = await this.povPdfService.render(dto, companyId);
        const filename = this.povPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    // ─── Update (status-locked field edits + status transitions) ────────

    @Response('poVendor.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorUpdateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.update(row, body, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Dispatch ───────────────────────────────────────────────

    @Response('poVendor.dispatch')
    @AuthJwtAccessProtected()
    @Post('/:id/dispatch')
    async dispatch(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorDispatchRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.dispatch(row, body, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Receive ────────────────────────────────────────────────

    @Response('poVendor.receive')
    @AuthJwtAccessProtected()
    @Post('/:id/receive')
    async receive(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorReceiveRequestDto
    ): Promise<
        IResponse<{
            parent: PoVendorGetResponseDto;
        }>
    > {
        const row = await this.povService.findOneById(id);
        const { parent } = await this.povService.receive(row, body, userId);
        return {
            data: {
                parent: await this.povService.mapGet(parent),
            },
        };
    }

    // ─── Action: Cancel ─────────────────────────────────────────────────

    @Response('poVendor.cancel')
    @AuthJwtAccessProtected()
    @Post('/:id/cancel')
    async cancel(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorCancelRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.cancel(row, body?.reason, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Soft delete (draft only) ───────────────────────────────────────

    @Response('poVendor.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.povService.findOneById(id);
        await this.povService.softDelete(row);
        return { data: null };
    }
}
