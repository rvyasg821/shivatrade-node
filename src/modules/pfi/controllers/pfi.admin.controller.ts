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

import { PfiService } from '../services/pfi.service';
import { PfiRepository } from '../repository/repositories/pfi.repository';
import { PfiCreateRequestDto } from '../dtos/request/pfi.create.request.dto';
import { PfiUpdateRequestDto } from '../dtos/request/pfi.update.request.dto';
import { PfiGetResponseDto } from '../dtos/response/pfi.get.response.dto';

@ApiTags('admin.pfi')
@Controller({ version: '1', path: '/admin/pfi' })
export class PfiAdminController {
    constructor(
        private readonly pfiService: PfiService,
        private readonly pfiRepository: PfiRepository
    ) {}

    @Response('pfi.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PfiCreateRequestDto
    ): Promise<IResponse<PfiGetResponseDto>> {
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
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<PfiGetResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (customerId) find.customer_id = customerId;
        if (quotationId) find.quotation_id = quotationId;
        if (status) find.status = status;
        if (dateFrom && dateTo) {
            find.pfi_date = { $gte: dateFrom, $lte: dateTo };
        } else if (dateFrom) {
            find.pfi_date = { $gte: dateFrom };
        } else if (dateTo) {
            find.pfi_date = { $lte: dateTo };
        }

        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { notes_to_client: { $regex: _search, $options: 'i' } },
            ];
        }

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
}
