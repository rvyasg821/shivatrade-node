import {
    Controller,
    Get,
    Query,
    Res,
    NotFoundException,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { verifyPdfTicket } from '@common/pdf/pdf-ticket.util';

import { PoVendorService } from '../services/po-vendor.service';
import { PoVendorPdfService } from '../services/po-vendor-pdf.service';

/**
 * No-auth Vendor PO (dispatch-advice) PDF access via a short-lived signed
 * ticket — lets the browser open the PDF inline in a new tab (with the proper
 * filename). The ticket is minted by the authed `/:id/pdf-ticket` admin route.
 */
@ApiTags('public.poVendor')
@Controller({ version: '1', path: '/public/po-vendor' })
export class PoVendorPublicController {
    constructor(
        private readonly povService: PoVendorService,
        private readonly povPdfService: PoVendorPdfService
    ) {}

    @ApiOperation({ summary: 'Vendor PO dispatch-advice PDF by short-lived ticket' })
    @Get('/pdf')
    async pdf(
        @Query('t') ticket: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const id = verifyPdfTicket(ticket, 'po-vendor');
        if (!id) throw new NotFoundException('Invalid or expired link');
        const row = await this.povService.findOneById(id);
        const dto = await this.povService.mapGet(row);
        const buf = await this.povPdfService.render(
            dto,
            row.company_id.toString()
        );
        const filename = this.povPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }

    @ApiOperation({ summary: 'Vendor payment voucher PDF by short-lived ticket' })
    @Get('/payment-pdf')
    async paymentPdf(
        @Query('t') ticket: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const combined = verifyPdfTicket(ticket, 'po-vendor-payment');
        if (!combined) throw new NotFoundException('Invalid or expired link');
        const [id, paymentId] = combined.split('~');
        if (!id || !paymentId) throw new NotFoundException('Invalid link');
        const row = await this.povService.findOneById(id);
        const dto = await this.povService.mapGet(row);
        const payment = (dto.payments || []).find((p) => p._id === paymentId);
        if (!payment) throw new NotFoundException('Payment not found');
        const buf = await this.povPdfService.renderPayment(
            dto,
            payment,
            row.company_id.toString()
        );
        const filename = this.povPdfService.buildPaymentFilename(payment);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }
}
