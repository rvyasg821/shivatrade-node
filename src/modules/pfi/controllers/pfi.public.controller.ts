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

import { PfiService } from '../services/pfi.service';
import { PfiPdfService } from '../services/pfi-pdf.service';
import { PfiPublicResponseDto } from '../dtos/response/pfi.public.response.dto';
import { ENUM_PFI_STATUS } from '../enums/pfi.enum';

/**
 * No-auth, view-only PFI access by share token (`/p/:token` on the
 * client). Returns the sanitized projection only — no internal costing.
 * A token is only honoured while the PFI is sent / approved.
 */
@ApiTags('public.pfi')
@Controller({ version: '1', path: '/public/pfi' })
export class PfiPublicController {
    constructor(
        private readonly pfiService: PfiService,
        private readonly pfiPdfService: PfiPdfService
    ) {}

    @Response('pfi.public')
    @ApiOperation({ summary: 'View a shared PFI by public token' })
    @Get('/:token')
    async getByToken(
        @Param('token') token: string
    ): Promise<IResponse<PfiPublicResponseDto>> {
        const row = await this.pfiService.findByPublicToken(token);
        if (!row) {
            throw new NotFoundException('PFI not found');
        }
        // A token issued while sent/approved must stop working if the
        // PFI later moved back to draft / was rejected.
        if (
            row.status !== ENUM_PFI_STATUS.SENT &&
            row.status !== ENUM_PFI_STATUS.APPROVED
        ) {
            throw new NotFoundException('This PFI is no longer available');
        }
        return { data: await this.pfiService.mapPublic(row) };
    }

    /** Public PDF download — only valid while a shareable token exists and
     *  the PFI is in sent / approved. Streams the file directly. */
    @ApiOperation({ summary: 'Download a shared PFI as PDF' })
    @Get('/:token/pdf')
    async pdfByToken(
        @Param('token') token: string,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const row = await this.pfiService.findByPublicToken(token);
        if (!row) {
            throw new NotFoundException('PFI not found');
        }
        if (
            row.status !== ENUM_PFI_STATUS.SENT &&
            row.status !== ENUM_PFI_STATUS.APPROVED
        ) {
            throw new NotFoundException('This PFI is no longer available');
        }
        const dto = await this.pfiService.mapPublic(row);
        const buf = await this.pfiPdfService.render(dto);
        const filename = this.pfiPdfService.buildFilename(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buf.length);
        res.end(buf);
    }
}
