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

import { RebateService } from '../services/rebate.service';
import { RebateRepository } from '../repository/repositories/rebate.repository';
import { RebateCreateRequestDto } from '../dtos/request/rebate.create.request.dto';
import { RebateUpdateRequestDto } from '../dtos/request/rebate.update.request.dto';
import { RebateGetResponseDto } from '../dtos/response/rebate.get.response.dto';
import { RebateListResponseDto } from '../dtos/response/rebate.list.response.dto';

@ApiTags('admin.rebate')
@Controller({ version: '1', path: '/admin/rebate' })
export class RebateAdminController {
    constructor(
        private readonly rebateService: RebateService,
        private readonly rebateRepository: RebateRepository
    ) {}

    @Response('rebate.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: RebateCreateRequestDto
    ): Promise<IResponse<RebateGetResponseDto>> {
        const rebate = await this.rebateService.create(companyId, body, userId);
        return { data: this.rebateService.mapGet(rebate) };
    }

    @ResponsePaging('rebate.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string
    ): Promise<IResponsePaging<RebateListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;
        if (_search) {
            find.$or = [
                { name: { $regex: _search, $options: 'i' } },
                { code: { $regex: _search, $options: 'i' } },
                { description: { $regex: _search, $options: 'i' } },
            ];
        }
        const rebates = await this.rebateRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.rebateRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: this.rebateService.mapList(rebates),
        };
    }

    @Response('rebate.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; name: string; code: string; type: string; pct: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const rebates = await this.rebateRepository.findAll(find, {
            order: { name: 'asc' as any },
        });
        return {
            data: rebates.map((r) => ({
                _id: r._id.toString(),
                name: r.name,
                code: r.code,
                type: r.type,
                pct: r.pct,
            })),
        };
    }

    @Response('rebate.get')
    @AuthJwtAccessProtected()
    @Get('/get/:rebateId')
    async get(
        @Param('rebateId') rebateId: string
    ): Promise<IResponse<RebateGetResponseDto>> {
        const rebate = await this.rebateService.findOneById(rebateId);
        return { data: this.rebateService.mapGet(rebate) };
    }

    @Response('rebate.update')
    @AuthJwtAccessProtected()
    @Put('/update/:rebateId')
    async update(
        @Param('rebateId') rebateId: string,
        @Body() body: RebateUpdateRequestDto
    ): Promise<IResponse<RebateGetResponseDto>> {
        const rebate = await this.rebateService.findOneById(rebateId);
        const updated = await this.rebateService.update(rebate, body);
        return { data: this.rebateService.mapGet(updated) };
    }

    @Response('rebate.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:rebateId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('rebateId') rebateId: string
    ): Promise<void> {
        const rebate = await this.rebateService.findOneById(rebateId);
        await this.rebateService.softDelete(rebate, userId);
    }
}
