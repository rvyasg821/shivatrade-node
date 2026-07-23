import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';

import { SalesDocImportService } from '../services/sales-doc-import.service';
import {
    SalesDocExportRequestDto,
    SalesDocResolveRequestDto,
} from '../dtos/sales-doc-import.dto';
import { ENUM_SALES_DOC_TYPE } from '../enums/sales-doc-import.enum';

@ApiTags('admin.salesDocImport')
@Controller({ version: '1', path: '/admin/sales-doc/import' })
export class SalesDocImportAdminController {
    constructor(
        private readonly importService: SalesDocImportService,
    ) {}

    @AuthJwtAccessProtected()
    @Post('/resolve')
    @ApiOperation({
        summary:
            'Preview & validate parsed sheet rows for a sales-doc line-item import',
    })
    async resolve(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: SalesDocResolveRequestDto,
    ) {
        if (!body?.rows?.length) {
            throw new BadRequestException('No rows provided');
        }
        const result = await this.importService.resolveRows(
            companyId,
            body.docType,
            body.rows,
            body.existingKeys || [],
        );
        return { statusCode: 200, message: 'Preview', data: result };
    }

    @AuthJwtAccessProtected()
    @Post('/sample')
    @ApiOperation({
        summary:
            'Download sample Excel for sales-doc line-item import — pre-filled with example rows',
    })
    async sample(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: SalesDocExportRequestDto,
        @Res() res: ExpressResponse,
    ) {
        // Always pre-fill with example rows so users see exactly what to type
        // in each column. If the caller passes their current lines we honor
        // those; otherwise we generate examples from real products in their
        // catalogue (or fall back to placeholder rows).
        const hasCallerLines = (body.lines || []).length > 0;
        const lines = hasCallerLines
            ? body.lines!
            : await this.importService.buildExampleLines(
                  companyId,
                  body.docType,
              );
        const buffer = await this.importService.buildWorkbook(companyId, {
            docType: body.docType,
            lines,
            currencyCode: body.currencyCode,
            exchangeRate: body.exchangeRate,
            freightTotal: body.freightTotal,
            includeComputed: false,
            includeReadme: true,
        });
        const fname = `${this.filenamePrefix(body.docType)}-import-sample.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fname}"`,
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Post('/export')
    @ApiOperation({
        summary:
            'Export current sales-doc line items as Excel (with computed columns + Totals sheet)',
    })
    async export(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: SalesDocExportRequestDto,
        @Res() res: ExpressResponse,
    ) {
        // Quotation & Sales Order export as a costing report (computed columns +
        // Totals); other docs keep the round-trip schema (no derived columns).
        const isCosting =
            body.docType === ENUM_SALES_DOC_TYPE.QUOTATION ||
            body.docType === ENUM_SALES_DOC_TYPE.PO;

        // `formatted` → the presentation "costing report" (grouped header bands,
        // pretty currency labels, computed amounts, TOTAL row). NOT re-importable
        // and only offered for the costing docs; everything else falls through to
        // the normal round-trip export below.
        const datePart = new Date().toISOString().slice(0, 10);
        const prefix = this.filenamePrefix(body.docType);
        const id = body.docNumber || 'draft';

        if (body.formatted && isCosting) {
            const report = await this.importService.buildCostingReportWorkbook(
                companyId,
                {
                    docType: body.docType,
                    lines: body.lines || [],
                    currencyCode: body.currencyCode,
                    exchangeRate: body.exchangeRate,
                    freightTotal: body.freightTotal,
                },
            );
            const reportName = `${prefix}-costing-report-${id}-${datePart}.xlsx`;
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${reportName}"`,
            );
            res.end(report);
            return;
        }

        const buffer = await this.importService.buildWorkbook(companyId, {
            docType: body.docType,
            lines: body.lines || [],
            currencyCode: body.currencyCode,
            exchangeRate: body.exchangeRate,
            freightTotal: body.freightTotal,
            includeComputed: isCosting,
            includeReadme: false,
        });
        const fname = `${prefix}-lines-${id}-${datePart}.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fname}"`,
        );
        res.end(buffer);
    }

    private filenamePrefix(docType: ENUM_SALES_DOC_TYPE): string {
        switch (docType) {
            case ENUM_SALES_DOC_TYPE.QUOTATION:
                return 'quotation';
            case ENUM_SALES_DOC_TYPE.PFI:
                return 'pfi';
            // The "po" doc type is the Sales Order module — name its files "so".
            case ENUM_SALES_DOC_TYPE.PO:
                return 'so';
            default:
                return 'sales-doc';
        }
    }
}
