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

import { LeadService } from '../services/lead.service';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadCreateRequestDto } from '../dtos/request/lead.create.request.dto';
import { LeadUpdateRequestDto } from '../dtos/request/lead.update.request.dto';
import { LeadGetResponseDto } from '../dtos/response/lead.get.response.dto';
import { LeadListResponseDto } from '../dtos/response/lead.list.response.dto';

@ApiTags('admin.lead')
@Controller({ version: '1', path: '/admin/lead' })
export class LeadAdminController {
    constructor(
        private readonly leadService: LeadService,
        private readonly leadRepository: LeadRepository
    ) {}

    @Response('lead.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: LeadCreateRequestDto
    ): Promise<IResponse<LeadGetResponseDto>> {
        const lead = await this.leadService.create(companyId, body, userId);
        const data = await this.leadService.mapGetWithRelations(lead);
        return { data };
    }

    @ResponsePaging('lead.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('source') source?: string,
        @Query('assigned_to') assignedTo?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<LeadListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (status) find.status = status;
        if (source) find.source = source;
        if (assignedTo) find.assigned_to = assignedTo;

        // PaginationSearchPipe doesn't populate `_search` without an
        // `availableSearch` option — fall back to the raw `search` query.
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : null);
        if (searchTerm) {
            find.$or = [
                { company_name: { $regex: searchTerm, $options: 'i' } },
                { contact_name: { $regex: searchTerm, $options: 'i' } },
                { contact_email: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const leads = await this.leadRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.leadRepository.getTotal(find);
        const data = await this.leadService.mapListWithRelations(leads);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('lead.get')
    @AuthJwtAccessProtected()
    @Get('/get/:leadId')
    async get(
        @Param('leadId') leadId: string
    ): Promise<IResponse<LeadGetResponseDto>> {
        const lead = await this.leadService.findOneById(leadId);
        const data = await this.leadService.mapGetWithRelations(lead);
        return { data };
    }

    @Response('lead.update')
    @AuthJwtAccessProtected()
    @Put('/update/:leadId')
    async update(
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Body() body: LeadUpdateRequestDto
    ): Promise<IResponse<LeadGetResponseDto>> {
        const lead = await this.leadService.findOneById(leadId);
        const updated = await this.leadService.update(lead, body, userId);
        const data = await this.leadService.mapGetWithRelations(updated);
        return { data };
    }

    @Response('lead.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:leadId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string
    ): Promise<void> {
        const lead = await this.leadService.findOneById(leadId);
        await this.leadService.softDelete(lead, userId);
    }

    @Response('lead.convert')
    @AuthJwtAccessProtected()
    @Post('/convert/:leadId')
    async convert(
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string
    ): Promise<IResponse<LeadGetResponseDto>> {
        const lead = await this.leadService.findOneById(leadId);
        const { lead: updated } = await this.leadService.convertToCustomer(
            lead,
            userId
        );
        const data = await this.leadService.mapGetWithRelations(updated);
        return { data };
    }
}
