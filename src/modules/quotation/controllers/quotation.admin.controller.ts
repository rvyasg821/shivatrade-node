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

import { QuotationService } from '../services/quotation.service';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationCreateRequestDto } from '../dtos/request/quotation.create.request.dto';
import { QuotationUpdateRequestDto } from '../dtos/request/quotation.update.request.dto';
import { QuotationGetResponseDto } from '../dtos/response/quotation.get.response.dto';

@ApiTags('admin.quotation')
@Controller({ version: '1', path: '/admin/quotation' })
export class QuotationAdminController {
    constructor(
        private readonly quotationService: QuotationService,
        private readonly quotationRepository: QuotationRepository
    ) {}

    @Response('quotation.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: QuotationCreateRequestDto
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.create(companyId, body, userId);
        return { data: await this.quotationService.mapGet(row) };
    }

    @ResponsePaging('quotation.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('customer_id') customerId?: string,
        @Query('lead_id') leadId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<QuotationGetResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (customerId) find.customer_id = customerId;
        if (leadId) find.lead_id = leadId;
        if (status) find.status = status;
        if (dateFrom && dateTo) {
            find.quotation_date = { $gte: dateFrom, $lte: dateTo };
        } else if (dateFrom) {
            find.quotation_date = { $gte: dateFrom };
        } else if (dateTo) {
            find.quotation_date = { $lte: dateTo };
        }

        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { notes_to_client: { $regex: _search, $options: 'i' } },
            ];
        }

        const rows = await this.quotationRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });

        const total = await this.quotationRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.quotationService.mapList(rows),
        };
    }

    @Response('quotation.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.findOneById(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: QuotationUpdateRequestDto
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.findOneById(id);
        const updated = await this.quotationService.update(row, body);
        return { data: await this.quotationService.mapGet(updated) };
    }

    @Response('quotation.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.quotationService.findOneById(id);
        await this.quotationService.softDelete(row);
        return { data: null };
    }

    // ─── Public share link ──────────────────────────────────────────────

    @Response('quotation.publish')
    @AuthJwtAccessProtected()
    @Post('/publish/:id')
    async publish(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.publish(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.rotateToken')
    @AuthJwtAccessProtected()
    @Post('/rotate-token/:id')
    async rotateToken(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.rotateToken(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    @Response('quotation.unpublish')
    @AuthJwtAccessProtected()
    @Post('/unpublish/:id')
    async unpublish(
        @Param('id') id: string
    ): Promise<IResponse<QuotationGetResponseDto>> {
        const row = await this.quotationService.unpublish(id);
        return { data: await this.quotationService.mapGet(row) };
    }

    /** Admin-only "preview as client" — the exact sanitized projection the
     *  public route serves, but works in ANY status (incl. draft) so the
     *  user can see the client-facing layout before publishing. */
    @Response('quotation.publicPreview')
    @AuthJwtAccessProtected()
    @Get('/public-preview/:id')
    async publicPreview(@Param('id') id: string): Promise<IResponse<any>> {
        const row = await this.quotationService.findOneById(id);
        return { data: await this.quotationService.mapPublic(row) };
    }
}
