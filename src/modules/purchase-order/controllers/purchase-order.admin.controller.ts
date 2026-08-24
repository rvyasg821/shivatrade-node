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
import type { Response as ExpressResponse } from 'express';
import { ApiTags, ApiQuery, ApiOperation, ApiConsumes } from '@nestjs/swagger';
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
import { PurchaseOrderService } from '../services/purchase-order.service';
import { PurchaseOrderImportExportService } from '../services/purchase-order.import-export.service';
import { PoPdfService } from '../services/po-pdf.service';
import { PurchaseOrderRepository } from '../repository/repositories/purchase-order.repository';
import { PurchaseOrderCreateRequestDto } from '../dtos/request/purchase-order.create.request.dto';
import { PurchaseOrderUpdateRequestDto } from '../dtos/request/purchase-order.update.request.dto';
import { PurchaseOrderAutoSplitRequestDto } from '../dtos/request/purchase-order.auto-split.request.dto';
import { PurchaseOrderGetResponseDto } from '../dtos/response/purchase-order.get.response.dto';
import { PurchaseOrderStatsResponseDto } from '../dtos/response/purchase-order.stats.response.dto';
import { PoCoverageService } from '@modules/po-vendor/services/po-coverage.service';
import { PoCoverageResponseDto } from '@modules/po-vendor/dtos/response/po-coverage.response.dto';

@ApiTags('admin.purchase-order')
@Controller({ version: '1', path: '/admin/purchase-order' })
export class PurchaseOrderAdminController {
    constructor(
        private readonly poService: PurchaseOrderService,
        private readonly poPdfService: PoPdfService,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poCoverageService: PoCoverageService,
        private readonly importExportService: PurchaseOrderImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for sales order import' })
    async downloadSampleExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.generateSampleExcel(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="sales-order-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({
        summary: 'Export sales orders to Excel (import template shape)',
    })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportSalesOrders(
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="sales-orders-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import sales orders from Excel/CSV (preview or confirm)',
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
        const validDocs = rows.filter((r) => r.status !== 'error');
        if (validDocs.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, skipped: 0, errors: [] },
            };
        }
        const result = await this.importExportService.importSalesOrders(
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

    @Response('purchaseOrder.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PurchaseOrderCreateRequestDto
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.create(companyId, body, userId);
        return { data: await this.poService.mapGet(row) };
    }

    @ResponsePaging('purchaseOrder.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'vendor_id', required: false, type: String })
    @ApiQuery({ name: 'customer_id', required: false, type: String })
    @ApiQuery({ name: 'quotation_id', required: false, type: String })
    @ApiQuery({ name: 'pfi_id', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'date_from', required: false, type: String })
    @ApiQuery({ name: 'date_to', required: false, type: String })
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @PaginationQuery()
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('vendor_id') vendorId?: string,
        @Query('customer_id') customerId?: string,
        @Query('quotation_id') quotationId?: string,
        @Query('pfi_id') pfiId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<PurchaseOrderGetResponseDto>> {
        const statusValue = parseStatusParam(status);
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : '');
        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const find = {
            ...this.poService.buildListFind(companyId, {
                vendor_id: vendorId,
                customer_id: customerId,
                quotation_id: quotationId,
                pfi_id: pfiId,
                status: statusValue,
                date_from: dateFrom,
                date_to: dateTo,
                search: searchTerm,
            }),
            ...CreatorScopeService.toFind(creatorValue),
        };

        const rows = await this.poRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });
        const total = await this.poRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.poService.mapList(rows),
        };
    }

    @Response('purchaseOrder.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('vendor_id') vendorId?: string,
        @Query('customer_id') customerId?: string,
        @Query('quotation_id') quotationId?: string,
        @Query('pfi_id') pfiId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<PurchaseOrderStatsResponseDto>> {
        const statusValue = parseStatusParam(status);
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.poService.stats(
            companyId,
            {
                vendor_id: vendorId,
                customer_id: customerId,
                quotation_id: quotationId,
                pfi_id: pfiId,
                status: statusValue,
                date_from: dateFrom,
                date_to: dateTo,
                search: searchRaw,
            },
            creatorValue
        );
        return { data };
    }

    @Response('purchaseOrder.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.findOneById(id);
        return { data: await this.poService.mapGet(row) };
    }

    @Response('purchaseOrder.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: PurchaseOrderUpdateRequestDto,
        @AuthJwtPayload('user') userId: string
    ): Promise<IResponse<PurchaseOrderGetResponseDto>> {
        const row = await this.poService.findOneById(id);
        const updated = await this.poService.update(row, body, userId);
        return { data: await this.poService.mapGet(updated) };
    }

    @Response('purchaseOrder.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.poService.findOneById(id);
        await this.poService.deleteWithGuard(row);
        return { data: null };
    }

    @Response('purchaseOrder.delete')
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
        const data = await this.poService.deleteMany(ids, userId);
        return { data };
    }

    // ─── Auto-split from PFI / Quotation ────────────────────────────────

    @Response('purchaseOrder.previewFromPfi')
    @AuthJwtAccessProtected()
    @Get('/preview-from-pfi/:pfiId')
    async previewFromPfi(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('pfiId') pfiId: string
    ): Promise<IResponse<any>> {
        return { data: await this.poService.previewFromPfi(companyId, pfiId) };
    }

    @Response('purchaseOrder.previewFromQuotation')
    @AuthJwtAccessProtected()
    @Get('/preview-from-quotation/:quotationId')
    async previewFromQuotation(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('quotationId') quotationId: string
    ): Promise<IResponse<any>> {
        return {
            data: await this.poService.previewFromQuotation(
                companyId,
                quotationId
            ),
        };
    }

    @Response('purchaseOrder.createFromPfi')
    @AuthJwtAccessProtected()
    @Post('/from-pfi/:pfiId')
    async createFromPfi(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('pfiId') pfiId: string,
        @Body() body: PurchaseOrderAutoSplitRequestDto
    ): Promise<IResponse<any>> {
        const out = await this.poService.createFromPfi(
            companyId,
            pfiId,
            userId,
            body.assignments,
            {
                deliveryAddressId: body.delivery_address_id,
                deliveryAddressText: body.delivery_address,
                vendorExpenses: body.vendor_expenses,
                customerOrder: {
                    customer_po_number: body.customer_po_number,
                    reference_no: body.reference_no,
                    advance_amount: body.advance_amount,
                    advance_date: body.advance_date,
                    advance_exchange_rate: body.advance_exchange_rate,
                    advance_notes: body.advance_notes,
                    advance_bank_account_id: body.advance_bank_account_id,
                    advance_bank_name: body.advance_bank_name,
                },
            }
        );
        const purchaseOrder = await this.poService.mapGet(out.purchase_order);
        return {
            data: {
                purchase_order: purchaseOrder,
                po_vendors: out.po_vendors,
            },
        };
    }

    @Response('purchaseOrder.createFromQuotation')
    @AuthJwtAccessProtected()
    @Post('/from-quotation/:quotationId')
    async createFromQuotation(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('quotationId') quotationId: string,
        @Body() body: PurchaseOrderAutoSplitRequestDto
    ): Promise<IResponse<any>> {
        // SO-only generation — vendor assignment + charges now happen later
        // at POV generation (assignments/vendor_expenses on the DTO are
        // ignored here, kept optional for backward compatibility).
        const out = await this.poService.createFromQuotation(
            companyId,
            quotationId,
            userId,
            {
                deliveryAddressId: body.delivery_address_id,
                deliveryAddressText: body.delivery_address,
                customerOrder: {
                    customer_po_number: body.customer_po_number,
                    reference_no: body.reference_no,
                    advance_amount: body.advance_amount,
                    advance_date: body.advance_date,
                    advance_exchange_rate: body.advance_exchange_rate,
                    advance_notes: body.advance_notes,
                    advance_bank_account_id: body.advance_bank_account_id,
                    advance_bank_name: body.advance_bank_name,
                },
            }
        );
        const purchaseOrder = await this.poService.mapGet(out.purchase_order);
        return {
            data: {
                purchase_order: purchaseOrder,
                po_vendors: out.po_vendors,
            },
        };
    }

    /** Admin PDF download — streams the file directly (bypasses the standard
     *  JSON envelope decorator). Works in any status. */
    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async adminPdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.poService.findOneById(id);
        const dto = await this.poService.mapGet(row);
        const buf = await this.poPdfService.render(dto, companyId);
        const filename = this.poPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    /** Sales Order Excel (mirrors the PDF). */
    @AuthJwtAccessProtected()
    @Get('/:id/excel')
    async adminExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.poService.findOneById(id);
        const dto = await this.poService.mapGet(row);
        const { buffer, filename } = await this.poPdfService.renderExcel(
            dto,
            companyId
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }

    /** Per-PFI coverage roll-up — covered/pending qty per PFI line. */
    @Response('purchaseOrder.pfiCoverage')
    @AuthJwtAccessProtected()
    @Get('/pfi-coverage/:pfiId')
    async pfiCoverage(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('pfiId') pfiId: string
    ): Promise<IResponse<any>> {
        const data = await this.poService.getSourceCoverage(
            companyId,
            'pfi',
            pfiId
        );
        return { data };
    }

    /** Per-Quotation coverage roll-up — covered/pending qty per Quotation line. */
    @Response('purchaseOrder.quotationCoverage')
    @AuthJwtAccessProtected()
    @Get('/quotation-coverage/:quotationId')
    async quotationCoverage(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('quotationId') quotationId: string
    ): Promise<IResponse<any>> {
        const data = await this.poService.getSourceCoverage(
            companyId,
            'quotation',
            quotationId
        );
        return { data };
    }

    /** Per-PO coverage roll-up (POV plan §14 — feeds Vendor Tracking tab). */
    @Response('purchaseOrder.coverage')
    @AuthJwtAccessProtected()
    @Get('/:id/coverage')
    async coverage(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<PoCoverageResponseDto>> {
        const data = await this.poCoverageService.getCoverage(companyId, id);
        return { data };
    }
}

// Normalize `status` query: empty → undefined, "a" → "a", "a,b" → ["a","b"].
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
