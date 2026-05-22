import {
    Controller,
    Get,
    Param,
    NotFoundException,
    Res,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';

import { PurchaseOrderService } from '../services/purchase-order.service';
import { PoPdfService } from '../services/po-pdf.service';
import { ENUM_PURCHASE_ORDER_STATUS } from '../enums/purchase-order.enum';

/**
 * No-auth, view-only Purchase Order access by share token
 * (`/po/:token` on the client). A token is only honoured while the
 * PO is in a non-draft state.
 */
@ApiTags('public.purchaseOrder')
@Controller({ version: '1', path: '/public/purchase-order' })
export class PurchaseOrderPublicController {
    constructor(
        private readonly poService: PurchaseOrderService,
        private readonly poPdfService: PoPdfService
    ) {}

    @Response('purchaseOrder.public')
    @ApiOperation({ summary: 'View a shared PO by public token' })
    @Get('/:token')
    async getByToken(
        @Param('token') token: string
    ): Promise<IResponse<any>> {
        const row = await this.poService.findByPublicToken(token);
        if (!row) {
            throw new NotFoundException('Purchase Order not found');
        }
        if (row.status === ENUM_PURCHASE_ORDER_STATUS.DRAFT) {
            throw new NotFoundException(
                'This Purchase Order is no longer available'
            );
        }
        return { data: await this.poService.mapGet(row) };
    }

    /** Public PDF download — valid while a shareable token exists and the
     *  PO is not in draft. Streams the file directly. */
    @ApiOperation({ summary: 'Download a shared PO as PDF' })
    @Get('/:token/pdf')
    async pdfByToken(
        @Param('token') token: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.poService.findByPublicToken(token);
        if (!row) {
            throw new NotFoundException('Purchase Order not found');
        }
        if (row.status === ENUM_PURCHASE_ORDER_STATUS.DRAFT) {
            throw new NotFoundException(
                'This Purchase Order is no longer available'
            );
        }
        const companyId = row.company_id.toString();
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
}
