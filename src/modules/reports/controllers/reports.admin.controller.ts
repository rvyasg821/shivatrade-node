import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { ReportsService } from '../services/reports.service';
import { ProductProfitabilityResponseDto } from '../dtos/response/product-profitability.response.dto';
import { HsnSummaryResponseDto } from '../dtos/response/hsn-summary.response.dto';
import { GstBalanceResponseDto } from '../dtos/response/gst-balance.response.dto';

/**
 * Read-only aggregation reports, company-scoped by the caller's JWT `companyId`
 * (same scoping as the invoice/quotation stats endpoints). Menu visibility is
 * gated by the `reports` permission slug; the data is always the caller's own
 * company.
 */
@ApiTags('admin.reports')
@Controller({ version: '1', path: '/admin/reports' })
export class ReportsAdminController {
    constructor(private readonly reportsService: ReportsService) {}

    /** Product-wise profitability — revenue vs fully-loaded cost per product. */
    @Response('reports.productProfitability')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({
        name: 'order_by',
        required: false,
        description: 'profit | revenue | cost | qty | margin',
    })
    @ApiQuery({ name: 'order_direction', required: false, description: 'asc | desc' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/product-profitability')
    async productProfitability(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<ProductProfitabilityResponseDto>> {
        const data = await this.reportsService.productProfitability(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            category_id: query.category_id,
            search: query.search,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/product-profitability/export')
    async productProfitabilityExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.productProfitabilityExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                category_id: query.category_id,
                search: query.search,
                order_by: query.order_by as any,
                order_direction: query.order_direction as any,
            }
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="product-profitability-${
                new Date().toISOString().split('T')[0]
            }.xlsx"`
        );
        res.end(buffer);
    }

    /** HSN Summary — GSTR-1 Table 12, one row per HSN × rate × UQC. */
    @Response('reports.hsnSummary')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'search', required: false, description: 'HSN code' })
    @ApiQuery({
        name: 'gst_route',
        required: false,
        description: 'igst_paid | lut_zero_rated',
    })
    @ApiQuery({
        name: 'order_by',
        required: false,
        description: 'hsn | taxable | igst | qty',
    })
    @ApiQuery({ name: 'order_direction', required: false, description: 'asc | desc' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/hsn-summary')
    async hsnSummary(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<HsnSummaryResponseDto>> {
        const data = await this.reportsService.hsnSummary(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            search: query.search,
            gst_route: query.gst_route,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'gst_route', required: false })
    @Get('/hsn-summary/export')
    async hsnSummaryExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.hsnSummaryExcel(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            search: query.search,
            gst_route: query.gst_route,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
        });
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="hsn-summary-gstr1_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    /** Input-Output GST Balance — month-wise output GST vs input ITC. */
    @Response('reports.gstBalance')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @Get('/gst-balance')
    async gstBalance(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<GstBalanceResponseDto>> {
        const data = await this.reportsService.gstBalance(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
        });
        return { data };
    }

    /** Excel export of the same report (+ TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @Get('/gst-balance/export')
    async gstBalanceExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.gstBalanceExcel(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
        });
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="gst-balance_${stamp(query.date_from)}_${stamp(
                query.date_to
            )}.xlsx"`
        );
        res.end(buffer);
    }
}
