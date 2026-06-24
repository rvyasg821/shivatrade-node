import { Controller, Get, Param, Query } from '@nestjs/common';
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

import { InventoryService } from '../services/inventory.service';
import { InventoryListResponseDto } from '../dtos/response/inventory-list.response.dto';
import { InventoryReceiptDetailResponseDto } from '../dtos/response/inventory-receipt-detail.response.dto';
import { InventoryStatsResponseDto } from '../dtos/response/inventory-stats.response.dto';

@ApiTags('admin.inventory')
@Controller({ version: '1', path: '/admin/inventory' })
export class InventoryAdminController {
    constructor(private readonly inventoryService: InventoryService) {}

    /**
     * Received-goods register. One row per CLOSED POV line with
     * received_qty > 0. Paginated + filterable. Auth-only — read visibility
     * is gated on the frontend via the `inventory` module permission.
     */
    @ResponsePaging('inventory.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset }: PaginationListDto,
        @Query('search') search?: string,
        @Query('category_id') categoryId?: string,
        @Query('po_id') poId?: string,
        @Query('pov_id') povId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('location_id') locationId?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('min_qty') minQty?: string,
        @Query('orderBy') orderBy?: string,
        @Query('orderDirection') orderDirection?: string
    ): Promise<IResponsePaging<InventoryListResponseDto>> {
        const { rows, total } = await this.inventoryService.list(companyId, {
            search: search?.trim() || undefined,
            category_id: categoryId || undefined,
            po_id: poId || undefined,
            pov_id: povId || undefined,
            vendor_id: vendorId || undefined,
            location_id: locationId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            min_qty:
                minQty != null && minQty !== '' ? Number(minQty) : undefined,
            limit: _limit,
            offset: _offset,
            orderBy,
            orderDirection,
        });

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: rows,
        };
    }

    /**
     * KPI aggregates (stock value / lines / products / vendors) for the
     * listing header cards. Honours the same filters as `/list`.
     */
    @Response('inventory.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('search') search?: string,
        @Query('category_id') categoryId?: string,
        @Query('po_id') poId?: string,
        @Query('pov_id') povId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('location_id') locationId?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('min_qty') minQty?: string
    ): Promise<IResponse<InventoryStatsResponseDto>> {
        const data = await this.inventoryService.stats(companyId, {
            search: search?.trim() || undefined,
            category_id: categoryId || undefined,
            po_id: poId || undefined,
            pov_id: povId || undefined,
            vendor_id: vendorId || undefined,
            location_id: locationId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            min_qty:
                minQty != null && minQty !== '' ? Number(minQty) : undefined,
        });
        return { data };
    }

    /**
     * Full receipt detail for the modal (product → receipt → doc chain).
     * 404s when the POV line no longer belongs to a closed receipt.
     */
    @Response('inventory.receipt')
    @AuthJwtAccessProtected()
    @Get('/receipt/:povLineId')
    async receipt(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('povLineId') povLineId: string
    ): Promise<IResponse<InventoryReceiptDetailResponseDto>> {
        const data = await this.inventoryService.getReceiptDetail(
            companyId,
            povLineId
        );
        return { data };
    }
}
