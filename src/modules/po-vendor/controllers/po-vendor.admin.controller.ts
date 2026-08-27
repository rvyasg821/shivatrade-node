import { Raw } from 'typeorm';
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
    NotFoundException,
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
import { PoVendorService } from '../services/po-vendor.service';
import { PoVendorPdfService } from '../services/po-vendor-pdf.service';
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorImportExportService } from '../services/po-vendor.import-export.service';
import { PoVendorCreateRequestDto } from '../dtos/request/po-vendor.create.request.dto';
import { PoVendorStandaloneCreateRequestDto } from '../dtos/request/po-vendor.standalone-create.request.dto';
import { PoVendorLineImportResolveRequestDto } from '../dtos/request/po-vendor.line-import.request.dto';
import { PoVendorLineExportRequestDto } from '../dtos/request/po-vendor.line-export.request.dto';
import { PoVendorUpdateRequestDto } from '../dtos/request/po-vendor.update.request.dto';
import { PoVendorDispatchRequestDto } from '../dtos/request/po-vendor.dispatch.request.dto';
import { PoVendorCancelRequestDto } from '../dtos/request/po-vendor.cancel.request.dto';
import {
    PoVendorPaymentCreateRequestDto,
    PoVendorPaymentVoidRequestDto,
} from '../dtos/request/po-vendor-payment.request.dto';
import { PoVendorRecoverRequestDto } from '../dtos/request/po-vendor.recover.request.dto';
import { PoVendorGetResponseDto } from '../dtos/response/po-vendor.get.response.dto';
import { PoVendorRecoverPreviewResponseDto } from '../dtos/response/po-vendor.recover-preview.response.dto';

@ApiTags('admin.po-vendor')
@Controller({ version: '1', path: '/admin/po-vendor' })
export class PoVendorAdminController {
    constructor(
        private readonly povService: PoVendorService,
        private readonly povRepository: PoVendorRepository,
        private readonly povPdfService: PoVendorPdfService,
        private readonly importExportService: PoVendorImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for VPO import (3 sheets)' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="vpo-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export VPOs to Excel (3-sheet import shape)' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportVpos(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="vpos-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({ summary: 'Import VPOs from Excel (preview or confirm)' })
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
        const validDocs = rows.filter((r) => r.docStatus !== 'error');
        if (validDocs.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, skipped: 0, errors: [] },
            };
        }
        const result = await this.importExportService.importVpos(
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

    // ── Vendor payments (against VPOs) ──
    @AuthJwtAccessProtected()
    @Get('/payments/sample-excel')
    async downloadPaymentSample(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generatePaymentSample();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="vendor-payment-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/payments/export')
    async exportPayments(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportPayments(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="vendor-payments-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/payments/import')
    async importPayments(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const { summary, rows } = await this.importExportService.parsePayments(
            file.buffer,
            companyId
        );
        if (preview === 'true') {
            return { statusCode: 200, message: 'Preview', data: { summary, rows } };
        }
        const valid = rows.filter((r) => r.status !== 'error');
        if (!valid.length)
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, skipped: 0, errors: [] },
            };
        const result = await this.importExportService.importPayments(
            valid,
            companyId,
            userId
        );
        const failed = result.errors.length
            ? `, ${result.errors.length} failed (${result.errors[0].message})`
            : '';
        return {
            statusCode: 200,
            message: `Payments: ${result.created} recorded, ${result.skipped} skipped${failed}`,
            data: { summary, ...result },
        };
    }

    // ─── Recover (multi-vendor batch) ───────────────────────────────────
    //
    // Surfaces only when has_pending=true on PO Coverage (e.g. after POV
    // cancel). Mirrors the PFI→PO modal: per-line vendor pick, default to
    // line's current vendor_id, submit creates N POVs grouped by vendor.

    @Response('poVendor.recoverPreview')
    @AuthJwtAccessProtected()
    @Get('/recover-preview/:poId')
    async recoverPreview(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('poId') poId: string
    ): Promise<IResponse<PoVendorRecoverPreviewResponseDto>> {
        const data = await this.povService.recoverPreviewByPoId(
            companyId,
            poId
        );
        return { data };
    }

    @Response('poVendor.recover')
    @AuthJwtAccessProtected()
    @Post('/recover/:poId')
    async recover(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('poId') poId: string,
        @Body() body: PoVendorRecoverRequestDto
    ): Promise<IResponse<{ created: PoVendorGetResponseDto[] }>> {
        const { created } = await this.povService.recoverFromPo(
            companyId,
            poId,
            body,
            userId
        );
        const mapped = await Promise.all(
            created.map(r => this.povService.mapGet(r))
        );
        return { data: { created: mapped } };
    }

    // ─── Create from PO ─────────────────────────────────────────────────

    @Response('poVendor.createFromPo')
    @AuthJwtAccessProtected()
    @Post('/from-po/:poId')
    async createFromPo(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('poId') poId: string,
        @Body() body: PoVendorCreateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.createFromPo(
            companyId,
            poId,
            body,
            userId
        );
        return { data: await this.povService.mapGet(row) };
    }

    // ─── Create standalone (no source Sales Order) ──────────────────────

    @Response('poVendor.createStandalone')
    @AuthJwtAccessProtected()
    @Post('/create')
    async createStandalone(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PoVendorStandaloneCreateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.createStandalone(
            companyId,
            body,
            userId
        );
        return { data: await this.povService.mapGet(row) };
    }

    // ─── Standalone create form: line-item Import/Export ────────────────
    // Scoped ONLY to the standalone POV create form — NOT the Generate-POV-
    // from-SO flow (a different, per-vendor-assignment UI with no bearing
    // here). See PoVendorService's "Line-item Import/Export" section.

    @AuthJwtAccessProtected()
    @Get('/standalone-lines/sample')
    @ApiOperation({ summary: 'Sample Excel for the standalone POV line-items import' })
    async standaloneLineSample(@Res() res: ExpressResponse) {
        const buffer = this.povService.buildStandaloneLineSample();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="pov-line-items-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Post('/standalone-lines/export')
    @ApiOperation({ summary: 'Export the standalone POV form\'s current line items to Excel' })
    async standaloneLineExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: PoVendorLineExportRequestDto,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.povService.buildStandaloneLineExport(
            companyId,
            body.lines || []
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="pov-line-items-export.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Post('/standalone-lines/resolve')
    @ApiOperation({ summary: 'Resolve uploaded (client-parsed) rows against the product master' })
    async standaloneLineResolve(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: PoVendorLineImportResolveRequestDto
    ): Promise<IResponse<{ resolved: any[] }>> {
        const result = await this.povService.resolveStandaloneLineImport(
            companyId,
            body.vendor_id || '',
            body.rows || []
        );
        return { data: result };
    }

    // ─── List ───────────────────────────────────────────────────────────

    @ResponsePaging('poVendor.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'purchase_order_id', required: false, type: String })
    @ApiQuery({ name: 'vendor_id', required: false, type: String })
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
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<PoVendorGetResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (vendorId) find.vendor_id = vendorId;
        if (status) find.status = status;
        if (dateFrom && dateTo) {
            find.dispatch_date = { $gte: dateFrom, $lte: dateTo };
        } else if (dateFrom) {
            find.dispatch_date = { $gte: dateFrom };
        } else if (dateTo) {
            find.dispatch_date = { $lte: dateTo };
        }

        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { lr_no: { $regex: _search, $options: 'i' } },
                { eway_bill_no: { $regex: _search, $options: 'i' } },
            ];
        }

        // Sales-Order filter (the SO detail "Vendor POs" tab): return POVs that
        // either COVER this SO (purchase_order_id) OR soft-link it for
        // traceability (linked_sales_orders jsonb array contains its id).
        if (purchaseOrderId) {
            if (find.$or) {
                // A text search already claimed $or; fall back to the direct
                // coverage match (search + the PO tab never combine in practice).
                find.purchase_order_id = purchaseOrderId;
            } else {
                find.$or = [
                    { purchase_order_id: purchaseOrderId },
                    {
                        linked_sales_orders: Raw(
                            alias => `${alias} @> :linkedSo::jsonb`,
                            { linkedSo: JSON.stringify([{ id: purchaseOrderId }]) }
                        ),
                    },
                ];
            }
        }

        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        Object.assign(find, CreatorScopeService.toFind(creatorValue));

        const rows = await this.povRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { createdAt: 'desc' as any },
        });
        const total = await this.povRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.povService.mapList(rows),
        };
    }

    // ─── Stats (list tiles) ─────────────────────────────────────────────

    @Response('poVendor.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<{ total: number; by_status: Record<string, number> }>> {
        // CSV status → array (the tiles pass comma-separated statuses).
        let statusValue: string | string[] | undefined;
        if (status) {
            const parts = status
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            statusValue = parts.length > 1 ? parts : parts[0];
        }
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.povService.stats(
            companyId,
            {
                purchase_order_id: purchaseOrderId,
                vendor_id: vendorId,
                status: statusValue,
                date_from: dateFrom,
                date_to: dateTo,
                search: searchRaw,
            },
            creatorValue
        );
        return { data };
    }

    // ─── Detail ─────────────────────────────────────────────────────────

    @Response('poVendor.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @Param('id') id: string
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        return { data: await this.povService.mapGet(row) };
    }

    // ─── PDF download (dispatch advice) ─────────────────────────────────

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.povService.findOneById(id);
        const dto = await this.povService.mapGet(row);
        const buf = await this.povPdfService.render(dto, companyId);
        const filename = this.povPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    // ─── Excel download (mirrors the PDF) ───────────────────────────────

    @AuthJwtAccessProtected()
    @Get('/:id/excel')
    async excel(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.povService.findOneById(id);
        const dto = await this.povService.mapGet(row);
        const { buffer, filename } = await this.povPdfService.renderExcel(
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

    // ─── Update (status-locked field edits + status transitions) ────────

    @Response('poVendor.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorUpdateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.update(row, body, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Dispatch ───────────────────────────────────────────────

    @Response('poVendor.dispatch')
    @AuthJwtAccessProtected()
    @Post('/:id/dispatch')
    async dispatch(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorDispatchRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.dispatch(row, body, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // Edit an already-dispatched POV's transport + per-line dispatched qty.
    @Response('poVendor.dispatch')
    @AuthJwtAccessProtected()
    @Put('/:id/dispatch')
    async editDispatch(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorDispatchRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.editDispatch(row, body, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Cancel ─────────────────────────────────────────────────

    @Response('poVendor.cancel')
    @AuthJwtAccessProtected()
    @Post('/:id/cancel')
    async cancel(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorCancelRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.cancel(row, body?.reason, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Action: Create balance POV ─────────────────────────────────────
    //
    // Re-orders whatever this POV never delivered (undispatched, plus any short
    // receipt once closed) as a new DRAFT POV on the same vendor. Returns the
    // NEW POV so the caller can navigate straight to it.

    @Response('poVendor.balance')
    @AuthJwtAccessProtected()
    @Post('/:id/balance')
    async createBalance(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const created = await this.povService.createBalance(row, userId);
        return { data: await this.povService.mapGet(created) };
    }

    // ─── Revert to draft (cancelled only) ───────────────────────────────

    @Response('poVendor.revertDraft')
    @AuthJwtAccessProtected()
    @Post('/:id/revert-draft')
    async revertDraft(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        const updated = await this.povService.revertToDraft(row, userId);
        return { data: await this.povService.mapGet(updated) };
    }

    // ─── Vendor payments ────────────────────────────────────────────────

    @Response('poVendor.payment.create')
    @AuthJwtAccessProtected()
    @Post('/payments/:id')
    async recordPayment(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: PoVendorPaymentCreateRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        const row = await this.povService.findOneById(id);
        await this.povService.recordPayment(row, body, userId);
        const fresh = await this.povService.findOneById(id);
        return { data: await this.povService.mapGet(fresh) };
    }

    @Response('poVendor.payment.void')
    @AuthJwtAccessProtected()
    @Post('/payments/:id/void/:paymentId')
    async voidPayment(
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Param('paymentId') paymentId: string,
        @Body() body: PoVendorPaymentVoidRequestDto
    ): Promise<IResponse<PoVendorGetResponseDto>> {
        await this.povService.findOneById(id);
        await this.povService.voidPayment(id, paymentId, userId, body?.reason);
        const fresh = await this.povService.findOneById(id);
        return { data: await this.povService.mapGet(fresh) };
    }

    /** Download the Payment Voucher (STIPL/PV/…) PDF for one payment. */
    @AuthJwtAccessProtected()
    @Get('/:id/payment-pdf/:paymentId')
    async paymentPdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Param('paymentId') paymentId: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.povService.findOneById(id);
        if (row.company_id.toString() !== companyId) {
            throw new NotFoundException('Vendor PO not found');
        }
        const dto = await this.povService.mapGet(row);
        const payment = (dto.payments || []).find((p) => p._id === paymentId);
        if (!payment) throw new NotFoundException('Payment not found');
        const buf = await this.povPdfService.renderPayment(
            dto,
            payment,
            companyId
        );
        const filename = this.povPdfService.buildPaymentFilename(payment);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    /** Download the Payment Voucher Excel (mirrors the PDF) for one payment. */
    @AuthJwtAccessProtected()
    @Get('/:id/payment-excel/:paymentId')
    async paymentExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Param('paymentId') paymentId: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.povService.findOneById(id);
        if (row.company_id.toString() !== companyId) {
            throw new NotFoundException('Vendor PO not found');
        }
        const dto = await this.povService.mapGet(row);
        const payment = (dto.payments || []).find((p) => p._id === paymentId);
        if (!payment) throw new NotFoundException('Payment not found');
        const { buffer, filename } = await this.povPdfService.renderPaymentExcel(
            dto,
            payment,
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

    // ─── Soft delete (draft only) ───────────────────────────────────────

    @Response('poVendor.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async delete(@Param('id') id: string): Promise<IResponse<null>> {
        const row = await this.povService.findOneById(id);
        await this.povService.deleteWithGuard(row);
        return { data: null };
    }

    /** Bulk delete (draft-only; server guard skips non-drafts / in-use rows). */
    @Response('poVendor.delete')
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @Body() body: { ids: string[] },
        @AuthJwtPayload('user') userId: string
    ): Promise<
        IResponse<{
            deleted: string[];
            skipped: Array<{ id: string; reason: string }>;
        }>
    > {
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }
        const data = await this.povService.deleteMany(ids, userId);
        return { data };
    }
}
