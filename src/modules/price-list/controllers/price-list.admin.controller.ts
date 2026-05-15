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

import { PriceListService } from '../services/price-list.service';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { PriceListCreateRequestDto } from '../dtos/request/price-list.create.request.dto';
import { PriceListUpdateRequestDto } from '../dtos/request/price-list.update.request.dto';
import { PriceListGetResponseDto } from '../dtos/response/price-list.get.response.dto';

@ApiTags('admin.priceList')
@Controller({ version: '1', path: '/admin/price-list' })
export class PriceListAdminController {
    constructor(
        private readonly priceListService: PriceListService,
        private readonly priceListRepository: PriceListRepository
    ) {}

    @Response('priceList.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PriceListCreateRequestDto
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.create(companyId, body, userId);
        return { data: await this.priceListService.mapGet(row) };
    }

    @ResponsePaging('priceList.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('vendor_id') vendorId?: string,
        @Query('product_id') productId?: string,
        @Query('currency_id') currencyId?: string
    ): Promise<IResponsePaging<PriceListGetResponseDto>> {
        const find: any = {};
        if (companyId) find.company_id = companyId;
        if (vendorId) find.vendor_id = vendorId;
        if (productId) find.product_id = productId;
        if (currencyId) find.currency_id = currencyId;

        if (_search) {
            find.$or = [{ notes: { $regex: _search, $options: 'i' } }];
        }

        const rows = await this.priceListRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { effective_date: 'desc' as any, createdAt: 'desc' as any },
        });

        const total = await this.priceListRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.priceListService.mapList(rows),
        };
    }

    @Response('priceList.byProduct')
    @AuthJwtAccessProtected()
    @Get('/by-product/:productId')
    async byProduct(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('productId') productId: string
    ): Promise<IResponse<PriceListGetResponseDto[]>> {
        const today = new Date().toISOString().slice(0, 10);
        const rows = await this.priceListRepository.findAll(
            {
                company_id: companyId,
                product_id: productId,
                effective_date: { $lte: today },
            } as any,
            { order: { effective_date: 'desc' as any } }
        );
        const mapped = await this.priceListService.mapList(rows);
        // Filter out expired rows (where effective_until < today).
        const active = mapped.filter(
            (r) => !r.effective_until || r.effective_until >= today
        );
        // Keep the most recent row per vendor (first occurrence in desc order).
        const byVendor = new Map<string, PriceListGetResponseDto>();
        for (const r of active) {
            const key = (r as any).vendor_id?.toString();
            if (key && !byVendor.has(key)) byVendor.set(key, r);
        }
        // Sort: cheapest unit_price first.
        const result = Array.from(byVendor.values()).sort(
            (a, b) =>
                Number(a.unit_price || 0) - Number(b.unit_price || 0)
        );
        return { data: result };
    }

    @Response('priceList.get')
    @AuthJwtAccessProtected()
    @Get('/get/:priceListId')
    async get(
        @Param('priceListId') id: string
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.findOneById(id);
        return { data: await this.priceListService.mapGet(row) };
    }

    @Response('priceList.update')
    @AuthJwtAccessProtected()
    @Put('/update/:priceListId')
    async update(
        @Param('priceListId') id: string,
        @Body() body: PriceListUpdateRequestDto
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.findOneById(id);
        const updated = await this.priceListService.update(row, body);
        return { data: await this.priceListService.mapGet(updated) };
    }

    @Response('priceList.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:priceListId')
    async delete(@Param('priceListId') id: string): Promise<void> {
        const row = await this.priceListService.findOneById(id);
        await this.priceListService.hardDelete(row);
    }
}
