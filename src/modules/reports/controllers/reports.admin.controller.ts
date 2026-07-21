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
import {
    GstBalanceResponseDto,
    GstBalanceBreakdownResponseDto,
} from '../dtos/response/gst-balance.response.dto';
import { PurchaseTurnoverResponseDto } from '../dtos/response/purchase-turnover.response.dto';
import { SalesTurnoverResponseDto } from '../dtos/response/sales-turnover.response.dto';

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

    /**
     * Drill-down for one month — the Vendor POs and invoices the month's
     * figures are actually made of (client #6: "show how these values are
     * derived").
     */
    @Response('reports.gstBalanceBreakdown')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'month', required: true, description: 'YYYY-MM' })
    @Get('/gst-balance/breakdown')
    async gstBalanceBreakdown(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('month') month: string
    ): Promise<IResponse<GstBalanceBreakdownResponseDto>> {
        const data = await this.reportsService.gstBalanceBreakdown(
            companyId,
            month
        );
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

    /** Sales Turnover — by month or by customer, sectioned per currency. */
    @Response('reports.salesTurnover')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'group_by', required: false, description: 'month | customer' })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'currency', required: false, description: 'narrow to one currency' })
    @ApiQuery({
        name: 'payment_status',
        required: false,
        description: 'unpaid | partially_paid | paid | overpaid',
    })
    @ApiQuery({
        name: 'order_by',
        required: false,
        description: 'value | received | outstanding | count (customer mode)',
    })
    @ApiQuery({ name: 'order_direction', required: false, description: 'asc | desc' })
    @ApiQuery({
        name: 'currency_mode',
        required: false,
        description:
            'native (default, a section per currency) | inr (all converted to ₹ at each invoice\'s own rate, one section + one grand total)',
    })
    @Get('/sales-turnover')
    async salesTurnover(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<SalesTurnoverResponseDto>> {
        const data = await this.reportsService.salesTurnover(companyId, {
            group_by: query.group_by as any,
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            currency: query.currency,
            currency_mode: query.currency_mode as any,
            payment_status: query.payment_status,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
        });
        return { data };
    }

    /** Excel export of the same report (one sheet, a section per currency). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'group_by', required: false })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'currency', required: false })
    @ApiQuery({ name: 'currency_mode', required: false, description: 'native | inr' })
    @ApiQuery({ name: 'payment_status', required: false })
    @Get('/sales-turnover/export')
    async salesTurnoverExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.salesTurnoverExcel(companyId, {
            group_by: query.group_by as any,
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            currency: query.currency,
            currency_mode: query.currency_mode as any,
            payment_status: query.payment_status,
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
            `attachment; filename="sales-turnover_${
                query.group_by || 'month'
            }_${stamp(query.date_from)}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    /** Purchase Turnover (VPO) — by month or by vendor. */
    @Response('reports.purchaseTurnover')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'group_by', required: false, description: 'month | vendor' })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'vendor_id', required: false })
    @ApiQuery({
        name: 'payment_status',
        required: false,
        description: 'unpaid | partially_paid | paid | overpaid',
    })
    @ApiQuery({
        name: 'order_by',
        required: false,
        description: 'value | paid | outstanding | count (vendor mode)',
    })
    @ApiQuery({ name: 'order_direction', required: false, description: 'asc | desc' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/purchase-turnover')
    async purchaseTurnover(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<PurchaseTurnoverResponseDto>> {
        const data = await this.reportsService.purchaseTurnover(companyId, {
            group_by: query.group_by as any,
            date_from: query.date_from,
            date_to: query.date_to,
            vendor_id: query.vendor_id,
            payment_status: query.payment_status,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'group_by', required: false })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'vendor_id', required: false })
    @ApiQuery({ name: 'payment_status', required: false })
    @Get('/purchase-turnover/export')
    async purchaseTurnoverExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.purchaseTurnoverExcel(
            companyId,
            {
                group_by: query.group_by as any,
                date_from: query.date_from,
                date_to: query.date_to,
                vendor_id: query.vendor_id,
                payment_status: query.payment_status,
                order_by: query.order_by as any,
                order_direction: query.order_direction as any,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="purchase-turnover_${
                query.group_by || 'month'
            }_${stamp(query.date_from)}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }
}
