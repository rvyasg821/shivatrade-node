import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { AdjustmentNoteService } from '../services/adjustment-note.service';
import { AdjustmentNoteCreateRequestDto } from '../dtos/request/adjustment-note.create.request.dto';
import { AdjustmentNoteVoidRequestDto } from '../dtos/request/adjustment-note.void.request.dto';
import { AdjustmentNoteResponseDto } from '../dtos/response/adjustment-note.response.dto';

/**
 * Adjustment Notes (client #8) — off-document debit/credit posted to a
 * customer/vendor ledger. Company-scoped by the caller's JWT `companyId`.
 * Menu visibility is gated by the `adjustment-notes` permission slug.
 */
@ApiTags('admin.adjustment-notes')
@Controller({ version: '1', path: '/admin/adjustment-notes' })
export class AdjustmentNoteAdminController {
    constructor(private readonly service: AdjustmentNoteService) {}

    @ResponsePaging('adjustmentNote.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'party_type', required: false })
    @ApiQuery({ name: 'party_id', required: false })
    @ApiQuery({ name: 'direction', required: false })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @Get()
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery({ availableSearch: ['voucher_no', 'reason'] })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('party_type') partyType?: string,
        @Query('party_id') partyId?: string,
        @Query('direction') direction?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<AdjustmentNoteResponseDto>> {
        const { data, total } = await this.service.list(companyId, {
            search: _search,
            limit: _limit,
            offset: _offset,
            order: _order,
            party_type: partyType,
            party_id: partyId,
            direction,
            date_from: dateFrom,
            date_to: dateTo,
        });
        return {
            data,
            _pagination: {
                total,
                totalPage: Math.ceil(total / (_limit || 25)),
            },
        };
    }

    @Response('adjustmentNote.create')
    @AuthJwtAccessProtected()
    @Post()
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: AdjustmentNoteCreateRequestDto
    ): Promise<IResponse<AdjustmentNoteResponseDto>> {
        const note = await this.service.create(companyId, body, userId);
        return { data: note };
    }

    @Response('adjustmentNote.void')
    @AuthJwtAccessProtected()
    @Post('/:id/void')
    async void(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: AdjustmentNoteVoidRequestDto
    ): Promise<IResponse<null>> {
        await this.service.void(companyId, id, userId, body?.reason);
        return { data: null };
    }
}
