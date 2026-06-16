import {
    Controller,
    Get,
    Param,
    Query,
    Res,
    NotFoundException,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { verifyPdfTicket } from '@common/pdf/pdf-ticket.util';

import { QuotationService } from '../services/quotation.service';
import { QuotationPublicResponseDto } from '../dtos/response/quotation.public.response.dto';
import { ENUM_QUOTATION_STATUS } from '../enums/quotation.enum';

/**
 * No-auth, view-only quotation access by share token (`/q/:token` on the
 * client). Returns the sanitized projection only — no internal costing.
 * A token is only honoured while the quotation is sent / approved.
 */
@ApiTags('public.quotation')
@Controller({ version: '1', path: '/public/quotation' })
export class QuotationPublicController {
    constructor(private readonly quotationService: QuotationService) {}

    /** Stream the quotation PDF inline (new-tab open) for a valid short-lived
     *  ticket. Declared before `/:token` so the literal path wins. */
    @ApiOperation({ summary: 'Quotation PDF by short-lived ticket' })
    @Get('/pdf')
    async pdf(
        @Query('t') ticket: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const id = verifyPdfTicket(ticket, 'quotation');
        if (!id) throw new NotFoundException('Invalid or expired link');
        const { buffer, filename } =
            await this.quotationService.generatePdf(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${filename}"`
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }

    @Response('quotation.public')
    @ApiOperation({ summary: 'View a shared quotation by public token' })
    @Get('/:token')
    async getByToken(
        @Param('token') token: string
    ): Promise<IResponse<QuotationPublicResponseDto>> {
        const row = await this.quotationService.findByPublicToken(token);
        if (!row) {
            throw new NotFoundException('Quotation not found');
        }
        // A token issued while sent/approved must stop working if the
        // quotation later moved back to draft / was rejected.
        if (
            row.status !== ENUM_QUOTATION_STATUS.SENT &&
            row.status !== ENUM_QUOTATION_STATUS.APPROVED
        ) {
            throw new NotFoundException(
                'This quotation is no longer available'
            );
        }
        return { data: await this.quotationService.mapPublic(row) };
    }
}
