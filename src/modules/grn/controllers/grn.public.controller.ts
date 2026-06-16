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

import { GrnService } from '../services/grn.service';

/**
 * No-auth GRN PDF access via a short-lived signed ticket — lets the browser
 * open the PDF inline in a new tab (with the proper filename). The ticket is
 * minted by the authed `/:id/pdf-ticket` admin route.
 */
@ApiTags('public.grn')
@Controller({ version: '1', path: '/public/grn' })
export class GrnPublicController {
    constructor(private readonly grnService: GrnService) {}

    @ApiOperation({ summary: 'GRN PDF by short-lived ticket' })
    @Get('/pdf')
    async pdf(
        @Query('t') ticket: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const id = verifyPdfTicket(ticket, 'grn');
        if (!id) throw new NotFoundException('Invalid or expired link');
        const { buffer, filename } = await this.grnService.generatePdfById(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }
}
