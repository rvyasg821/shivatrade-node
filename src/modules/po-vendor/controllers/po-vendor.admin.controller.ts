import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
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
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorCreateRequestDto } from '../dtos/request/po-vendor.create.request.dto';
import { PoVendorUpdateRequestDto } from '../dtos/request/po-vendor.update.request.dto';
import { PoVendorDispatchRequestDto } from '../dtos/request/po-vendor.dispatch.request.dto';
import { PoVendorReceiveRequestDto } from '../dtos/request/po-vendor.receive.request.dto';
import { PoVendorCancelRequestDto } from '../dtos/request/po-vendor.cancel.request.dto';
import { PoVendorGetResponseDto } from '../dtos/response/po-vendor.get.response.dto';

@ApiTags('admin.po-vendor')
@Controller({ version: '1', path: '/admin/po-vendor' })
export class PoVendorAdminController {
    constructor(
        private readonly povService: PoVendorService,
        private readonly povRepository: PoVendorRepository
    ) {}

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

    // ─── Update (status-locked field edits + status transitions) ────────

    @Response('poVendor.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: PoVendorUpdateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.update(row, body);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Dispatch ───────────────────────────────────────────────

    @Response('poVendor.dispatch')
    @AuthJwtAccessProtected()
    @Post('/:id/dispatch')
    async dispatch(
        @Param('id') id: string,
        @Body() body: PoVendorDispatchRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.dispatch(row, body);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Receive (may spawn child POV in same call) ─────────────

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
        @Param('id') id: string,
        @Body() body: PoVendorCancelRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.cancel(row, body?.reason);
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
