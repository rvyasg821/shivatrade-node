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

import { DebitNoteService } from '../services/debit-note.service';

/**
 * No-auth Debit Note PDF access via a short-lived signed ticket — lets the
 * browser open the PDF inline in a new tab (with the proper filename). The
 * ticket is minted by the authed `/:id/pdf-ticket` admin route.
 */
@ApiTags('public.debitNote')
@Controller({ version: '1', path: '/public/debit-note' })
export class DebitNotePublicController {
    constructor(private readonly debitNoteService: DebitNoteService) {}

    @ApiOperation({ summary: 'Debit Note PDF by short-lived ticket' })
    @Get('/pdf')
    async pdf(
        @Query('t') ticket: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const id = verifyPdfTicket(ticket, 'debit-note');
        if (!id) throw new NotFoundException('Invalid or expired link');
        const { buffer, filename } =
            await this.debitNoteService.generatePdfById(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }
}
