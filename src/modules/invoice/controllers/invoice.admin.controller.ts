import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Res,
    HttpCode,
    HttpStatus,
    UploadedFile,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
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
import { InvoiceService } from '../services/invoice.service';
import { InvoiceImportExportService } from '../services/invoice.import-export.service';
import { InvoiceLineImportService } from '../services/invoice-line-import.service';
import { IFile } from '@common/file/interfaces/file.interface';
import { InvoiceEventService } from '../services/invoice-event.service';
import { InvoiceEventFileService } from '../services/invoice-event-file.service';
import {
    InvoicePdfService,
    InvoicePdfDocType,
} from '../services/invoice-pdf.service';
import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceCreateRequestDto } from '../dtos/request/invoice.create.request.dto';
import { InvoiceUpdateRequestDto } from '../dtos/request/invoice.update.request.dto';
import { InvoiceCancelRequestDto } from '../dtos/request/invoice.cancel.request.dto';
import { InvoiceEventCreateRequestDto } from '../dtos/request/invoice-event.create.request.dto';
import { InvoiceEventDeleteRequestDto } from '../dtos/request/invoice-event.delete.request.dto';
import {
    InvoicePaymentCreateRequestDto,
    InvoicePaymentVoidRequestDto,
} from '../dtos/request/invoice-payment.create.request.dto';
import {
    InvoiceGetResponseDto,
    InvoiceListResponseDto,
} from '../dtos/response/invoice.get.response.dto';

@ApiTags('admin.invoice')
@Controller({
    version: '1',
    path: '/admin/invoice',
})
export class InvoiceAdminController {
    constructor(
        private readonly invoiceService: InvoiceService,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoicePdfService: InvoicePdfService,
        private readonly invoiceLineImportService: InvoiceLineImportService,
        private readonly invoiceEventService: InvoiceEventService,
        private readonly invoiceEventFileService: InvoiceEventFileService,
        private readonly importExportService: InvoiceImportExportService,
        private readonly creatorScope: CreatorScopeService
    ) {}

    /**
     * ONE-TIME correction for the source_currency_code import bug — see
     * InvoiceService.backfillSourceCurrency doc comment. Idempotent; safe
     * to call more than once. Remove once the historical-import backfill
     * is done — it's a cleanup tool, not a feature.
     */
    @AuthJwtAccessProtected()
    @Post('/backfill-source-currency')
    async backfillSourceCurrency(
        @AuthJwtPayload('companyId') companyId: string
    ) {
        const result = await this.invoiceService.backfillSourceCurrency(
            companyId
        );
        return {
            statusCode: 200,
            message: `Backfilled ${result.invoicesFixed} invoices, ${result.linesFixed} lines, ${result.igstBucketsFixed} IGST-refund snapshots`,
            data: result,
        };
    }

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
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
            'attachment; filename="invoice-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportInvoices(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="invoices-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
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
        const result = await this.importExportService.importInvoices(
            validDocs,
            companyId,
            userId
        );
        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.updated} tax-rate updated, ${result.skipped} skipped`,
            data: { summary, ...result },
        };
    }

    // ── Receipts (customer payments against invoices) ──
    @AuthJwtAccessProtected()
    @Get('/receipts/sample-excel')
    async downloadReceiptSample(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateReceiptSample();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="receipt-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/receipts/export')
    async exportReceipts(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse
    ) {
        const buffer = await this.importExportService.exportReceipts(companyId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="receipts-export.xlsx"'
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/receipts/import')
    async importReceipts(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const { summary, rows } = await this.importExportService.parseReceipts(
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
        const result = await this.importExportService.importReceipts(
            valid,
            companyId,
            userId
        );
        const failed = result.errors.length
            ? `, ${result.errors.length} failed (${result.errors[0].message})`
            : '';
        return {
            statusCode: 200,
            message: `Receipts: ${result.created} recorded, ${result.skipped} skipped${failed}`,
            data: { summary, ...result },
        };
    }

    private static readonly ALLOWED_EVENT_ATTACHMENT_EXTS = new Set([
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'pdf',
        'heic',
    ]);

    @Response('invoice.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: InvoiceCreateRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.create(companyId, body, userId);
        const data = await this.invoiceService.mapGet(row);
        return { data };
    }

    @ResponsePaging('invoice.list')
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
        @Query('customer_id') customerId?: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('created_by') createdBy?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<InvoiceListResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        // status may be a single value or a CSV (tile clicks send
        // "issued,partially_paid"); an array is translated to an IN clause.
        const statusValue = parseStatusParam(status);
        if (statusValue) find.status = statusValue;
        if (customerId) find.customer_id = customerId;
        if (purchaseOrderId) find.purchase_order_id = purchaseOrderId;
        if (dateFrom || dateTo) {
            find.invoice_date = {};
            if (dateFrom) (find.invoice_date as any).$gte = dateFrom;
            if (dateTo) (find.invoice_date as any).$lte = dateTo;
        }
        // `_search` (from @PaginationQuery) only populates when this endpoint
        // configures `availableSearch`, which it doesn't — so it was always
        // undefined and this filter never actually ran. `search` is the plain
        // query param the frontend list page sends (same pattern already
        // working on quotations/purchase-orders' list endpoints).
        const searchTerm = searchRaw?.trim() || (typeof _search === 'string' ? _search : '');
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { purchase_order_voucher_no: { $regex: searchTerm, $options: 'i' } },
                { reference_no: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        Object.assign(find, CreatorScopeService.toFind(creatorValue));

        const rows = await this.invoiceRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.invoiceRepository.getTotal(find);
        const data = await this.invoiceService.mapListBatch(rows as any[]);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('invoice.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('customer_id') customerId?: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('status') status?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') searchRaw?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<any>> {
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.invoiceService.stats(
            companyId,
            {
                customer_id: customerId,
                purchase_order_id: purchaseOrderId,
                status: parseStatusParam(status),
                date_from: dateFrom,
                date_to: dateTo,
                search: searchRaw,
            },
            creatorValue
        );
        return { data };
    }

    @Response('invoice.leaderboard')
    @AuthJwtAccessProtected()
    @Get('/leaderboard')
    async leaderboard(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('limit') limit?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponse<any>> {
        const data = await this.invoiceService.salesLeaderboard(
            companyId,
            limit ? Number(limit) : 5,
            { date_from: dateFrom, date_to: dateTo }
        );
        return { data };
    }

    @Response('invoice.po-addable')
    @AuthJwtAccessProtected()
    @Get('/po-addable/:poId')
    async getAddablePoLines(
        @Param('poId') poId: string,
        @Query('exclude_invoice_id') excludeInvoiceId?: string
    ): Promise<IResponse<any[]>> {
        const data = await this.invoiceService.getAddablePoLines(
            poId,
            excludeInvoiceId
        );
        return { data };
    }

    @Response('invoice.customer-invoiceable')
    @AuthJwtAccessProtected()
    @Get('/customer-invoiceable/:customerId')
    async getCustomerInvoiceable(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('customerId') customerId: string
    ): Promise<IResponse<any[]>> {
        const data = await this.invoiceService.getCustomerInvoiceableSoGroups(
            companyId,
            customerId
        );
        return { data };
    }

    @Response('invoice.so-advance-remaining')
    @AuthJwtAccessProtected()
    @Get('/so-advance-remaining/:soId')
    async getSoAdvanceRemaining(
        @Param('soId') soId: string
    ): Promise<IResponse<any>> {
        const data = await this.invoiceService.getSoAdvanceRemaining(soId);
        return { data };
    }

    @Response('invoice.get')
    @AuthJwtAccessProtected()
    @Get('/get/:invoiceId')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        const data = await this.invoiceService.mapGet(row);
        return { data };
    }

    @Response('invoice.update')
    @AuthJwtAccessProtected()
    @Put('/update/:invoiceId')
    async update(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoiceUpdateRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        const { invoice, rateOverrides } = await this.invoiceService.update(
            row,
            body,
            userId
        );
        const data: any = await this.invoiceService.mapGet(invoice);
        if (rateOverrides.length) {
            // cost_exchange_rate is stored source→doc; the worksheet box shows
            // its inverse (doc→source, e.g. "1 USD = 95.09 INR") — invert back
            // here so the warning quotes the number the user actually typed.
            const { claimed, applied } = rateOverrides[0];
            const claimedDisplay =
                claimed > 0 ? (1 / claimed).toFixed(2) : claimed;
            const appliedDisplay =
                applied > 0 ? (1 / applied).toFixed(2) : applied;
            data.rate_override_warning = `Exchange rate ${claimedDisplay} is too far from the current market rate — kept at ${appliedDisplay}. Update the Currency Master if this is a genuine rate change.`;
        }
        return { data };
    }

    // Goods-Out preview for the issue confirmation dialog — per-product
    // required vs on-hand, so the UI can list what leaves stock and block
    // the Issue button when short.
    @Response('invoice.get')
    @AuthJwtAccessProtected()
    @Get('/issue-preview/:invoiceId')
    async issuePreview(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<any>> {
        const data = await this.invoiceService.issuePreview(invoiceId, companyId);
        return { data };
    }

    @Response('invoice.issue')
    @AuthJwtAccessProtected()
    @Post('/issue/:invoiceId')
    async issue(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        const updated = await this.invoiceService.issue(row, userId);
        const data = await this.invoiceService.mapGet(updated);
        return { data };
    }

    @Response('invoice.cancel')
    @AuthJwtAccessProtected()
    @Post('/cancel/:invoiceId')
    async cancel(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoiceCancelRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        const updated = await this.invoiceService.cancel(row, body.reason, userId);
        const data = await this.invoiceService.mapGet(updated);
        return { data };
    }

    @Response('invoice.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:invoiceId')
    async softDelete(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<void> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        await this.invoiceService.softDelete(row);
    }

    @Response('invoice.delete')
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: { ids: string[] }
    ): Promise<IResponse<{ deleted: string[]; skipped: any[] }>> {
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }
        const data = await this.invoiceService.deleteMany(ids, companyId, userId);
        return { data };
    }

    // ─── Payments ──────────────────────────────────────────────────────

    @Response('invoice.payment.list')
    @AuthJwtAccessProtected()
    @Get('/payments/:invoiceId')
    async listPayments(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<any[]>> {
        await this.invoiceService.findOneById(invoiceId, companyId); // 404 guard
        const data = await this.invoiceService.listPaymentsForInvoice(invoiceId);
        return { data };
    }

    @Response('invoice.payment.create')
    @AuthJwtAccessProtected()
    @Post('/payments/:invoiceId')
    async recordPayment(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoicePaymentCreateRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        await this.invoiceService.recordPayment(row, body, userId);
        const fresh = await this.invoiceService.findOneById(invoiceId, companyId);
        const data = await this.invoiceService.mapGet(fresh);
        return { data };
    }

    @Response('invoice.payment.void')
    @AuthJwtAccessProtected()
    @Post('/payments/:invoiceId/void/:paymentId')
    async voidPayment(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Param('paymentId') paymentId: string,
        @Body() body: InvoicePaymentVoidRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        await this.invoiceService.findOneById(invoiceId, companyId);
        await this.invoiceService.voidPayment(paymentId, userId, body.reason);
        const fresh = await this.invoiceService.findOneById(invoiceId, companyId);
        const data = await this.invoiceService.mapGet(fresh);
        return { data };
    }

    // ───────────────────────────────────────────────────────────────
    // Line items import / export (Step 3 power-user shortcut)
    //   - Export ALWAYS reflects the current draft (or, for a brand-new
    //     invoice, seeds the addable SO lines so a user has a real
    //     starting point).
    //   - Resolve validates every row against the same Add-from-SO rules
    //     (line must belong to this SO + dispatched stock must cover
    //     qty). The FE never round-trips product codes — the SO line is
    //     the source of truth.
    // ───────────────────────────────────────────────────────────────
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/lines/export')
    async exportLines(
        @AuthJwtPayload('companyId') companyId: string,
        @Body()
        body: {
            purchase_order_id: string;
            invoice_id?: string;
            // Optional in-memory line-items snapshot. Sent by the form
            // when the operator has unsaved edits so the workbook
            // reflects the screen rather than the persisted draft.
            lines?: Array<Record<string, any>>;
        },
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } =
            await this.invoiceLineImportService.exportWorkbook({
                companyId,
                purchaseOrderId: body.purchase_order_id,
                invoiceId: body.invoice_id,
                liveLines: body.lines,
            });
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
    }

    @Response('invoice.lines.resolve')
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/lines/resolve')
    async resolveLines(
        @AuthJwtPayload('companyId') companyId: string,
        @Body()
        body: {
            purchase_order_id: string;
            invoice_id?: string;
            rows: Array<Record<string, any>>;
            // Current (possibly unsaved) draft lines from the form.
            draft_lines?: Array<Record<string, any>>;
        }
    ): Promise<IResponse<any>> {
        const data = await this.invoiceLineImportService.resolveImport({
            companyId,
            purchaseOrderId: body.purchase_order_id,
            invoiceId: body.invoice_id,
            rows: body.rows || [],
            draftLines: Array.isArray(body.draft_lines)
                ? body.draft_lines
                : undefined,
        });
        return { data };
    }

    /**
     * Render the Invoice as a PDF. Flavors of the same record:
     *   ?doc=commercial   (default) → Commercial Invoice (STIPL119 layout)
     *   ?doc=export                 → Export Invoice (buyer-facing variant)
     *   ?doc=packing-list           → Packing List   (companion doc)
     *   ?doc=receipt&paymentId=…    → Receipt Voucher for one payment (§11)
     *
     * Returns a stream - browser displays inline. Add `?download=1` to force
     * a Content-Disposition: attachment header.
     */
    @AuthJwtAccessProtected()
    @Get('/:invoiceId/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Query('doc') docQuery: string | undefined,
        @Query('paymentId') paymentIdQuery: string | undefined,
        @Query('download') downloadQuery: string | undefined,
        @Res() res: ExpressResponse
    ): Promise<void> {
        let buffer: Buffer;
        let filename: string;
        if (docQuery === 'receipt') {
            if (!paymentIdQuery) {
                throw new BadRequestException(
                    'paymentId is required for a receipt.'
                );
            }
            ({ buffer, filename } = await this.invoicePdfService.renderReceipt(
                companyId,
                invoiceId,
                paymentIdQuery
            ));
        } else {
            const doc: InvoicePdfDocType =
                docQuery === 'packing-list'
                    ? 'packing-list'
                    : docQuery === 'export'
                    ? 'export'
                    : 'commercial';
            ({ buffer, filename } = await this.invoicePdfService.render(
                companyId,
                invoiceId,
                doc
            ));
        }

        const disposition =
            downloadQuery === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `${disposition}; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
    }

    /**
     * Styled single-document Excel mirroring the invoice PDF. Same `doc` switch
     * as /pdf: commercial (default) | export | packing-list | receipt.
     */
    @AuthJwtAccessProtected()
    @Get('/:invoiceId/excel')
    async excel(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string,
        @Query('doc') docQuery: string | undefined,
        @Query('paymentId') paymentIdQuery: string | undefined,
        @Res() res: ExpressResponse
    ): Promise<void> {
        let buffer: Buffer;
        let filename: string;
        if (docQuery === 'receipt') {
            if (!paymentIdQuery) {
                throw new BadRequestException(
                    'paymentId is required for a receipt.'
                );
            }
            ({ buffer, filename } =
                await this.invoicePdfService.renderReceiptExcel(
                    companyId,
                    invoiceId,
                    paymentIdQuery
                ));
        } else {
            const doc: InvoicePdfDocType =
                docQuery === 'packing-list'
                    ? 'packing-list'
                    : docQuery === 'export'
                    ? 'export'
                    : 'commercial';
            ({ buffer, filename } = await this.invoicePdfService.renderExcel(
                companyId,
                invoiceId,
                doc
            ));
        }
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length.toString());
        res.end(buffer);
    }

    // ─── Tracking events (SHIPPING_INVOICE_MERGE_PLAN §8) ───────────────

    @Response('invoice.event.list')
    @AuthJwtAccessProtected()
    @Get('/event/:invoiceId')
    async listEvents(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<any[]>> {
        await this.invoiceService.findOneById(invoiceId, companyId); // 404 guard
        const data = await this.invoiceEventService.listForInvoice(invoiceId);
        return { data };
    }

    @Response('invoice.event.create')
    @AuthJwtAccessProtected()
    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'attachment', fileSize: 15 * 1024 * 1024 })
    @Post('/event/:invoiceId')
    async addEvent(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoiceEventCreateRequestDto,
        @UploadedFile() file?: Express.Multer.File
    ): Promise<IResponse<any>> {
        const row = await this.invoiceService.findOneById(invoiceId, companyId);
        let attachmentUrl: string | undefined;
        if (file && file.buffer && file.originalname) {
            const ext = (file.originalname.split('.').pop() || '').toLowerCase();
            if (
                !InvoiceAdminController.ALLOWED_EVENT_ATTACHMENT_EXTS.has(ext)
            ) {
                throw new BadRequestException(
                    `Unsupported attachment type: .${ext}`
                );
            }
            attachmentUrl = await this.invoiceEventFileService.saveFile(
                file.buffer,
                file.originalname,
                companyId
            );
        }
        const ev = await this.invoiceEventService.addEvent(
            row,
            body,
            userId,
            attachmentUrl
        );
        return { data: ev };
    }

    @Response('invoice.event.retract')
    @AuthJwtAccessProtected()
    @Post('/event/:eventId/retract')
    async retractEvent(
        @AuthJwtPayload('user') userId: string,
        @Param('eventId') eventId: string,
        @Body() body: InvoiceEventDeleteRequestDto
    ): Promise<void> {
        await this.invoiceEventService.retractEvent(
            eventId,
            userId,
            body.reason
        );
    }
}

// Parse a `status` query param that may be a single value or a CSV
// (e.g. tile clicks send "issued,partially_paid") into the shape the
// service expects.
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
