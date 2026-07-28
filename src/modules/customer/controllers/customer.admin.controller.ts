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
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';

import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { CustomerService } from '../services/customer.service';
import { CustomerImportExportService } from '../services/customer.import-export.service';
import { CustomerRepository } from '../repository/repositories/customer.repository';
import { CustomerCreateRequestDto } from '../dtos/request/customer.create.request.dto';
import { CustomerUpdateRequestDto } from '../dtos/request/customer.update.request.dto';
import { CustomerGetResponseDto } from '../dtos/response/customer.get.response.dto';
import { CustomerListResponseDto } from '../dtos/response/customer.list.response.dto';
import { CustomerStatsResponseDto } from '../dtos/response/customer.stats.response.dto';

@ApiTags('admin.customer')
@Controller({ version: '1', path: '/admin/customer' })
export class CustomerAdminController {
    constructor(
        private readonly customerService: CustomerService,
        private readonly customerRepository: CustomerRepository,
        private readonly importExportService: CustomerImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for customer import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="customer-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export customers to Excel (import template shape)' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportCustomers(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="customers-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import customers from Excel/CSV (preview or confirm)',
    })
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

        const validRows = rows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, updated: 0, errors: [] },
            };
        }

        const result = await this.importExportService.importCustomers(
            validRows,
            companyId,
            userId
        );

        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.updated} updated`,
            data: { summary, ...result },
        };
    }

    @Response('customer.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: CustomerCreateRequestDto
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.create(companyId, body, userId);
        const data = await this.customerService.mapGetWithRelations(customer);
        return { data };
    }

    @ResponsePaging('customer.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @PaginationQuery() { _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('country') country?: string,
        @Query('search') search?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<CustomerListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        // NOTE: `country` lives on the address table, not CustomerEntity, so it
        // cannot be a top-level find filter (would throw
        // EntityPropertyNotFoundError). Param kept for API compatibility; a
        // real country filter would need an address join (out of scope).
        void country;

        // Use the raw `search` string (mirrors /stats). The pagination pipe's
        // `_search` is a prebuilt object over its own configured fields — using
        // it as a $regex value doesn't filter, which is why the list ignored
        // the search box while the KPI tiles (which read `search`) did not.
        const term = typeof search === 'string' ? search.trim() : '';
        if (term) {
            // Search only real CustomerEntity columns. city/country live on the
            // address table (not this entity) — querying them here throws
            // EntityPropertyNotFoundError, so search by identity fields instead.
            find.$or = [
                { company_name: { $regex: term, $options: 'i' } },
                { website: { $regex: term, $options: 'i' } },
                { gstin: { $regex: term, $options: 'i' } },
                { pan: { $regex: term, $options: 'i' } },
                { iec: { $regex: term, $options: 'i' } },
            ];
        }

        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        Object.assign(find, CreatorScopeService.toFind(creatorValue));

        const customers = await this.customerRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.customerRepository.getTotal(find);
        const data = await this.customerService.mapListWithRelations(customers);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('customer.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('search') search?: string,
        @Query('country') country?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<CustomerStatsResponseDto>> {
        // Same ownership scope as /list so the tiles match the table.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.customerService.stats(
            companyId,
            { search, country },
            creatorValue
        );
        return { data };
    }

    @Response('customer.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<
        IResponse<{ _id: string; company_name: string; currency?: string }[]>
    > {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const customers = await this.customerRepository.findAll(find, {
            order: { company_name: 'asc' as any },
        });
        return {
            data: customers.map((c) => ({
                _id: c._id.toString(),
                company_name: c.company_name,
                currency: (c as any).currency || undefined,
            })),
        };
    }

    @Response('customer.get')
    @AuthJwtAccessProtected()
    @Get('/get/:customerId')
    async get(
        @Param('customerId') customerId: string
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.findOneById(customerId);
        const data = await this.customerService.mapGetWithRelations(customer);
        return { data };
    }

    @Response('customer.update')
    @AuthJwtAccessProtected()
    @Put('/update/:customerId')
    async update(
        @Param('customerId') customerId: string,
        @Body() body: CustomerUpdateRequestDto
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.findOneById(customerId);
        const updated = await this.customerService.update(customer, body);
        const data = await this.customerService.mapGetWithRelations(updated);
        return { data };
    }

    @Response('customer.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:customerId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('customerId') customerId: string
    ): Promise<void> {
        const customer = await this.customerService.findOneById(customerId);
        await this.customerService.softDelete(customer, userId);
    }

    @Response('customer.delete')
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
        const data = await this.customerService.deleteMany(ids, userId);
        return { data };
    }
}
