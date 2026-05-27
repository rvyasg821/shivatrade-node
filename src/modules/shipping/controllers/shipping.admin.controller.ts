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

import { ShippingService } from '../services/shipping.service';
import { ShippingRepository } from '../repository/repositories/shipping.repository';
import { ShippingCreateRequestDto } from '../dtos/request/shipping.create.request.dto';
import { ShippingUpdateRequestDto } from '../dtos/request/shipping.update.request.dto';
import { ShippingTransitionRequestDto } from '../dtos/request/shipping.transition.request.dto';
import { ShippingCancelRequestDto } from '../dtos/request/shipping.cancel.request.dto';
import { ShippingEventCreateRequestDto } from '../dtos/request/shipping-event.create.request.dto';
import { ShippingAttachInvoiceRequestDto } from '../dtos/request/shipping-attach-invoice.request.dto';
import {
    ShippingGetResponseDto,
    ShippingListResponseDto,
} from '../dtos/response/shipping.get.response.dto';

@ApiTags('admin.shipping')
@Controller({
    version: '1',
    path: '/admin/shipping',
})
export class ShippingAdminController {
    constructor(
        private readonly shippingService: ShippingService,
        private readonly shippingRepository: ShippingRepository
    ) {}

    @Response('shipping.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: ShippingCreateRequestDto
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.create(companyId, body, userId);
        const data = await this.shippingService.mapGet(row);
        return { data };
    }

    @ResponsePaging('shipping.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('mode') mode?: string,
        @Query('consignee_id') consigneeId?: string,
        @Query('forwarder_id') forwarderId?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<ShippingListResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (status) find.status = status;
        if (mode) find.mode = mode;
        if (consigneeId) find.consignee_id = consigneeId;
        if (forwarderId) find.forwarder_id = forwarderId;
        if (dateFrom || dateTo) {
            find.booking_date = {};
            if (dateFrom) (find.booking_date as any).$gte = dateFrom;
            if (dateTo) (find.booking_date as any).$lte = dateTo;
        }
        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { bl_awb_no: { $regex: _search, $options: 'i' } },
                { shipping_bill_no: { $regex: _search, $options: 'i' } },
                { container_no: { $regex: _search, $options: 'i' } },
            ];
        }

        const rows = await this.shippingRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.shippingRepository.getTotal(find);
        const data = (rows as any[]).map((r) => this.shippingService.mapList(r));

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('shipping.get')
    @AuthJwtAccessProtected()
    @Get('/get/:shippingId')
    async get(
        @Param('shippingId') id: string
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.findOneById(id);
        return { data: await this.shippingService.mapGet(row) };
    }

    @Response('shipping.update')
    @AuthJwtAccessProtected()
    @Put('/update/:shippingId')
    async update(
        @AuthJwtPayload('user') userId: string,
        @Param('shippingId') id: string,
        @Body() body: ShippingUpdateRequestDto
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.findOneById(id);
        const updated = await this.shippingService.update(row, body, userId);
        return { data: await this.shippingService.mapGet(updated) };
    }

    @Response('shipping.transition')
    @AuthJwtAccessProtected()
    @Post('/transition/:shippingId')
    async transition(
        @AuthJwtPayload('user') userId: string,
        @Param('shippingId') id: string,
        @Body() body: ShippingTransitionRequestDto
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.findOneById(id);
        const updated = await this.shippingService.transitionTo(row, body, userId);
        return { data: await this.shippingService.mapGet(updated) };
    }

    @Response('shipping.cancel')
    @AuthJwtAccessProtected()
    @Post('/cancel/:shippingId')
    async cancel(
        @AuthJwtPayload('user') userId: string,
        @Param('shippingId') id: string,
        @Body() body: ShippingCancelRequestDto
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.findOneById(id);
        const updated = await this.shippingService.cancel(
            row,
            body.reason,
            userId
        );
        return { data: await this.shippingService.mapGet(updated) };
    }

    @Response('shipping.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:shippingId')
    async softDelete(@Param('shippingId') id: string): Promise<void> {
        const row = await this.shippingService.findOneById(id);
        await this.shippingService.softDelete(row);
    }

    // ─── Invoice attach / detach ───────────────────────────────────────

    @Response('shipping.attachInvoices')
    @AuthJwtAccessProtected()
    @Post('/attach-invoices/:shippingId')
    async attachInvoices(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('shippingId') id: string,
        @Body() body: ShippingAttachInvoiceRequestDto
    ): Promise<IResponse<ShippingGetResponseDto>> {
        const row = await this.shippingService.findOneById(id);
        await this.shippingService.attachInvoices(
            id,
            companyId,
            body.invoice_ids
        );
        return { data: await this.shippingService.mapGet(row) };
    }

    @Response('shipping.detachInvoice')
    @AuthJwtAccessProtected()
    @Delete('/detach-invoice/:invoiceId')
    async detachInvoice(@Param('invoiceId') invoiceId: string): Promise<void> {
        await this.shippingService.detachInvoice(invoiceId);
    }

    // ─── Manual events ────────────────────────────────────────────────

    @Response('shipping.event.create')
    @AuthJwtAccessProtected()
    @Post('/event/:shippingId')
    async addEvent(
        @AuthJwtPayload('user') userId: string,
        @Param('shippingId') id: string,
        @Body() body: ShippingEventCreateRequestDto
    ): Promise<IResponse<any>> {
        const row = await this.shippingService.findOneById(id);
        const ev = await this.shippingService.addEvent(row, body, userId);
        return { data: ev };
    }

    @Response('shipping.event.retract')
    @AuthJwtAccessProtected()
    @Delete('/event/:eventId')
    async retractEvent(@Param('eventId') eventId: string): Promise<void> {
        await this.shippingService.retractEvent(eventId);
    }
}
