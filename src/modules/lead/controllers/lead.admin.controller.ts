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
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';
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

import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';

import { LeadService } from '../services/lead.service';
import { LeadImportExportService } from '../services/lead.import-export.service';
import { LeadRepository } from '../repository/repositories/lead.repository';
import { LeadCreateRequestDto } from '../dtos/request/lead.create.request.dto';
import { LeadUpdateRequestDto } from '../dtos/request/lead.update.request.dto';
import { LeadGetResponseDto } from '../dtos/response/lead.get.response.dto';
import { LeadListResponseDto } from '../dtos/response/lead.list.response.dto';
import { LeadStatsResponseDto } from '../dtos/response/lead.stats.response.dto';

@ApiTags('admin.lead')
@Controller({ version: '1', path: '/admin/lead' })
export class LeadAdminController {
    constructor(
        private readonly leadService: LeadService,
        private readonly leadRepository: LeadRepository,
        private readonly importExportService: LeadImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for lead import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="lead-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export leads to Excel (import template shape)' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportLeads(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="leads-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({ summary: 'Import leads from Excel/CSV (preview or confirm)' })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const { summary, rows } =
            await this.importExportService.parseAndValidate(
                file.buffer,
                companyId
            );
        if (preview === 'true') {
            return {
                statusCode: 200,
                message: 'Preview',
                data: { summary, rows },
            };
        }
        const validDocs = rows.filter((r) => r.status !== 'error');
        if (validDocs.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, skipped: 0, errors: [] },
            };
        }
        const result = await this.importExportService.importLeads(
            validDocs,
            companyId,
            userId
        );
        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.skipped} skipped`,
            data: { summary, ...result },
        };
    }

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
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('source') source?: string,
        @Query('assigned_to') assignedTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<LeadListResponseDto>> {
        // Status accepts a single value or a comma-separated list — the
        // tile strip uses the latter for the "In Pipeline" multi-status
        // bucket (Plan §7 gotcha #1).
        const statusValue = parseStatusParam(status);
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : '');

        // Ownership scope (Created-By filter). The dropdown is convenience —
        // this call is the gate: non-admins are forced to self, a Location
        // Admin is confined to users in their locations.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );

        const find = {
            ...this.leadService.buildListFind(companyId, {
                status: statusValue,
                source,
                assigned_to: assignedTo,
                search: searchTerm,
            }),
            ...CreatorScopeService.toFind(creatorValue),
        };

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

    @Response('lead.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('status') status?: string,
        @Query('source') source?: string,
        @Query('assigned_to') assignedTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<LeadStatsResponseDto>> {
        const statusValue = parseStatusParam(status);
        // Same ownership scope as /list so the tiles match the table.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.leadService.stats(
            companyId,
            {
                status: statusValue,
                source,
                assigned_to: assignedTo,
                search: searchRaw,
            },
            creatorValue
        );
        return { data };
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
        await this.leadService.deleteWithGuard(lead);
    }

    @Response('lead.delete')
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @AuthJwtPayload('user') userId: string,
        @Body() body: { ids: string[] }
    ): Promise<IResponse<{ deleted: string[]; skipped: any[] }>> {
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }
        const data = await this.leadService.deleteMany(ids, userId);
        return { data };
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

// Normalize the `status` query param: returns `undefined` for empty,
// the string itself when one status was passed, or an array when the
// caller sent a comma-separated list (e.g. `?status=new,contacted`).
function parseStatusParam(raw?: string): string | string[] | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (!trimmed.includes(',')) return trimmed;
    const parts = trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return parts;
}
