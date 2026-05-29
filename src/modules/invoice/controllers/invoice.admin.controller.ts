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
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
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

import { InvoiceService } from '../services/invoice.service';
import { InvoiceLineImportService } from '../services/invoice-line-import.service';
import {
    InvoicePdfService,
    InvoicePdfDocType,
} from '../services/invoice-pdf.service';
import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceCreateRequestDto } from '../dtos/request/invoice.create.request.dto';
import { InvoiceUpdateRequestDto } from '../dtos/request/invoice.update.request.dto';
import { InvoiceCancelRequestDto } from '../dtos/request/invoice.cancel.request.dto';
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
        private readonly invoiceLineImportService: InvoiceLineImportService
    ) {}

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
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('customer_id') customerId?: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<InvoiceListResponseDto>> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (status) find.status = status;
        if (customerId) find.customer_id = customerId;
        if (purchaseOrderId) find.purchase_order_id = purchaseOrderId;
        if (dateFrom || dateTo) {
            find.invoice_date = {};
            if (dateFrom) (find.invoice_date as any).$gte = dateFrom;
            if (dateTo) (find.invoice_date as any).$lte = dateTo;
        }
        if (_search) {
            find.$or = [
                { voucher_no: { $regex: _search, $options: 'i' } },
                { purchase_order_voucher_no: { $regex: _search, $options: 'i' } },
            ];
        }

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

    @Response('invoice.get')
    @AuthJwtAccessProtected()
    @Get('/get/:invoiceId')
    async get(
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId);
        const data = await this.invoiceService.mapGet(row);
        return { data };
    }

    @Response('invoice.update')
    @AuthJwtAccessProtected()
    @Put('/update/:invoiceId')
    async update(
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoiceUpdateRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId);
        const updated = await this.invoiceService.update(row, body);
        const data = await this.invoiceService.mapGet(updated);
        return { data };
    }

    @Response('invoice.issue')
    @AuthJwtAccessProtected()
    @Post('/issue/:invoiceId')
    async issue(
        @AuthJwtPayload('user') userId: string,
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId);
        const updated = await this.invoiceService.issue(row, userId);
        const data = await this.invoiceService.mapGet(updated);
        return { data };
    }

    @Response('invoice.cancel')
    @AuthJwtAccessProtected()
    @Post('/cancel/:invoiceId')
    async cancel(
        @AuthJwtPayload('user') userId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoiceCancelRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId);
        const updated = await this.invoiceService.cancel(row, body.reason, userId);
        const data = await this.invoiceService.mapGet(updated);
        return { data };
    }

    @Response('invoice.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:invoiceId')
    async softDelete(@Param('invoiceId') invoiceId: string): Promise<void> {
        const row = await this.invoiceService.findOneById(invoiceId);
        await this.invoiceService.softDelete(row);
    }

    // ─── Payments ──────────────────────────────────────────────────────

    @Response('invoice.payment.list')
    @AuthJwtAccessProtected()
    @Get('/payments/:invoiceId')
    async listPayments(
        @Param('invoiceId') invoiceId: string
    ): Promise<IResponse<any[]>> {
        await this.invoiceService.findOneById(invoiceId); // 404 guard
        const data = await this.invoiceService.listPaymentsForInvoice(invoiceId);
        return { data };
    }

    @Response('invoice.payment.create')
    @AuthJwtAccessProtected()
    @Post('/payments/:invoiceId')
    async recordPayment(
        @AuthJwtPayload('user') userId: string,
        @Param('invoiceId') invoiceId: string,
        @Body() body: InvoicePaymentCreateRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        const row = await this.invoiceService.findOneById(invoiceId);
        await this.invoiceService.recordPayment(row, body, userId);
        const fresh = await this.invoiceService.findOneById(invoiceId);
        const data = await this.invoiceService.mapGet(fresh);
        return { data };
    }

    @Response('invoice.payment.void')
    @AuthJwtAccessProtected()
    @Post('/payments/:invoiceId/void/:paymentId')
    async voidPayment(
        @AuthJwtPayload('user') userId: string,
        @Param('invoiceId') invoiceId: string,
        @Param('paymentId') paymentId: string,
        @Body() body: InvoicePaymentVoidRequestDto
    ): Promise<IResponse<InvoiceGetResponseDto>> {
        await this.invoiceService.findOneById(invoiceId);
        await this.invoiceService.voidPayment(paymentId, userId, body.reason);
        const fresh = await this.invoiceService.findOneById(invoiceId);
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
        }
    ): Promise<IResponse<any>> {
        const data = await this.invoiceLineImportService.resolveImport({
            companyId,
            purchaseOrderId: body.purchase_order_id,
            invoiceId: body.invoice_id,
            rows: body.rows || [],
        });
        return { data };
    }

    /**
     * Render the Invoice as a PDF. Three flavors of the same record:
     *   ?doc=commercial   (default) → Commercial Invoice (STIPL119 layout)
     *   ?doc=export                 → Export Invoice (buyer-facing variant)
     *   ?doc=packing-list           → Packing List   (companion doc)
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
        @Query('download') downloadQuery: string | undefined,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const doc: InvoicePdfDocType =
            docQuery === 'packing-list'
                ? 'packing-list'
                : docQuery === 'export'
                ? 'export'
                : 'commercial';
        const { buffer, filename } = await this.invoicePdfService.render(
            companyId,
            invoiceId,
            doc
        );

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
}
