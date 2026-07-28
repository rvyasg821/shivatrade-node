import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UploadedFile,
    Res,
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
import {
    datedFilename,
    sendExcel,
} from '@common/import/master-import.helper';

import { VendorService } from '../services/vendor.service';
import { VendorImportExportService } from '../services/vendor.import-export.service';
import { VendorRepository } from '../repository/repositories/vendor.repository';
import { VendorCategoryRepository } from '../repository/repositories/vendor-category.repository';
import { VendorCreateRequestDto } from '../dtos/request/vendor.create.request.dto';
import { VendorUpdateRequestDto } from '../dtos/request/vendor.update.request.dto';
import { VendorGetResponseDto } from '../dtos/response/vendor.get.response.dto';
import { VendorListResponseDto } from '../dtos/response/vendor.list.response.dto';

@ApiTags('admin.vendor')
@Controller({ version: '1', path: '/admin/vendor' })
export class VendorAdminController {
    constructor(
        private readonly vendorService: VendorService,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorCategoryRepository: VendorCategoryRepository,
        private readonly importExportService: VendorImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for vendor import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            this.importExportService.generateSampleExcel(),
            'vendor-import-sample.xlsx'
        );
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({
        summary:
            'Export vendors as Excel (Vendors + Addresses + Bank Accounts + Contacts)',
    })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        sendExcel(
            res,
            await this.importExportService.exportVendors(companyId),
            datedFilename('vendors')
        );
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import vendors from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');

        // The whole preview object is passed to the commit step, not a filtered
        // row list: the four sheets are interdependent (a bank account is
        // meaningless without knowing which vendor row it hangs off), so the
        // service does the filtering with all four in hand.
        const parsed = await this.importExportService.parseAndValidate(
            file.buffer,
            companyId
        );

        if (preview === 'true') {
            return { statusCode: 200, message: 'Preview', data: parsed };
        }

        const anyWritable = [...parsed.vendors, ...parsed.addresses].some(
            r => r.status !== 'error'
        );
        if (!anyWritable) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: {
                    summary: parsed.summary,
                    created: 0,
                    updated: 0,
                    errors: [],
                },
            };
        }

        const result = await this.importExportService.importVendors(
            parsed,
            companyId,
            userId
        );

        // Failures at COMMIT time (a service-level rule the preview could not
        // foresee) used to be collected and never shown — the toast reported
        // counts and the operator had no idea a vendor had been rejected. Name
        // them in the message.
        const failed = result.errors.length;
        const message = failed
            ? `Import finished with ${failed} failure${
                  failed > 1 ? 's' : ''
              }: ${result.created} created, ${result.updated} updated. ${result.errors
                  .slice(0, 3)
                  .map(e => (e.row ? `Row ${e.row}: ${e.message}` : e.message))
                  .join(' | ')}${failed > 3 ? ' …' : ''}`
            : `Import complete: ${result.created} created, ${result.updated} updated`;

        return {
            statusCode: 200,
            message,
            data: { summary: parsed.summary, ...result },
        };
    }

    @Response('vendor.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: VendorCreateRequestDto
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.create(companyId, body, userId);
        const data = await this.vendorService.mapGetWithRelations(vendor);
        return { data };
    }

    @Response('vendor.checkCode')
    @AuthJwtAccessProtected()
    @Post('/check-code')
    async checkCode(
        @AuthJwtPayload('companyId') companyId: string,
        @Body('code') code: string,
        @Body('vendorId') vendorId?: string
    ): Promise<IResponse<{ exists: boolean }>> {
        if (!code || !code.trim()) {
            return { data: { exists: false } };
        }
        const exists = await this.vendorRepository.isVendorCodeExists(
            companyId,
            code,
            vendorId
        );
        return { data: { exists } };
    }

    @ResponsePaging('vendor.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('category_id') categoryId?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<VendorListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        if (categoryId) {
            const vendorIds = await this.vendorService.findVendorIdsByCategoryId(
                companyId,
                categoryId
            );
            if (vendorIds.length === 0) {
                return {
                    _pagination: { total: 0, totalPage: 0 },
                    data: [],
                };
            }
            find._id = { $in: vendorIds };
        }

        // PaginationSearchPipe doesn't populate `_search` without an
        // `availableSearch` option — fall back to the raw `search` query.
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : null);
        if (searchTerm) {
            find.$or = [
                { company_name: { $regex: searchTerm, $options: 'i' } },
                { vendor_code: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const vendors = await this.vendorRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.vendorRepository.getTotal(find);
        const data = await this.vendorService.mapListWithRelations(vendors);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('vendor.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<
        IResponse<
            {
                _id: string;
                company_name: string;
                vendor_code?: string;
                category_ids: string[];
            }[]
        >
    > {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const vendors = await this.vendorRepository.findAll(find, {
            order: { company_name: 'asc' as any },
        });

        // Fetch all vendor↔category links for this company in one query and
        // group by vendor_id so each vendor in the response gets its
        // categories without N+1 round-trips.
        const links = await this.vendorCategoryRepository.findAll(
            { company_id: companyId } as any
        );
        const byVendor = new Map<string, string[]>();
        for (const l of links as any[]) {
            const vid = l.vendor_id?.toString();
            const cid = l.category_id?.toString();
            if (!vid || !cid) continue;
            if (!byVendor.has(vid)) byVendor.set(vid, []);
            byVendor.get(vid)!.push(cid);
        }

        return {
            data: vendors.map((v) => ({
                _id: v._id.toString(),
                company_name: v.company_name,
                vendor_code: v.vendor_code,
                category_ids: byVendor.get(v._id.toString()) || [],
            })),
        };
    }

    @Response('vendor.get')
    @AuthJwtAccessProtected()
    @Get('/get/:vendorId')
    async get(
        @Param('vendorId') vendorId: string
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.findOneById(vendorId);
        const data = await this.vendorService.mapGetWithRelations(vendor);
        return { data };
    }

    @Response('vendor.update')
    @AuthJwtAccessProtected()
    @Put('/update/:vendorId')
    async update(
        @Param('vendorId') vendorId: string,
        @Body() body: VendorUpdateRequestDto
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.findOneById(vendorId);
        const updated = await this.vendorService.update(vendor, body);
        const data = await this.vendorService.mapGetWithRelations(updated);
        return { data };
    }

    @Response('vendor.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:vendorId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('vendorId') vendorId: string
    ): Promise<void> {
        const vendor = await this.vendorService.findOneById(vendorId);
        await this.vendorService.softDelete(vendor, userId);
    }

    @Response('vendor.delete')
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
        const data = await this.vendorService.deleteMany(ids, userId);
        return { data };
    }
}
