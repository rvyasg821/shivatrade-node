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
import {
    HsnSummaryResponseDto,
    HsnSummaryBreakdownResponseDto,
} from '../dtos/response/hsn-summary.response.dto';
import {
    GstBalanceResponseDto,
    GstBalanceBreakdownResponseDto,
} from '../dtos/response/gst-balance.response.dto';
import { PurchaseTurnoverResponseDto } from '../dtos/response/purchase-turnover.response.dto';
import { SalesTurnoverResponseDto } from '../dtos/response/sales-turnover.response.dto';
import { SoInvoiceReconciliationResponseDto } from '../dtos/response/so-invoice-reconciliation.response.dto';
import { LeadToInvoiceDurationResponseDto } from '../dtos/response/lead-to-invoice-duration.response.dto';
import { AdvanceVsInvoiceResponseDto } from '../dtos/response/advance-vs-invoice.response.dto';
import { ExchangeGainLossResponseDto } from '../dtos/response/exchange-gain-loss.response.dto';
import { DocStatusResponseDto } from '../dtos/response/doc-status.response.dto';
import { StockTurnoverResponseDto } from '../dtos/response/stock-turnover.response.dto';
import { InventoryHoldingDaysResponseDto } from '../dtos/response/inventory-holding-days.response.dto';
import { InventoryAgingResponseDto } from '../dtos/response/inventory-aging.response.dto';

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

    /**
     * Drill-down for one HSN row — the invoice lines behind it, in Tally's
     * GSTR-1 Voucher Register shape. Declared before `/hsn-summary/export` and
     * after `/hsn-summary`; all three are literal paths, so order is cosmetic.
     *
     * `hsn_code` and `uqc_code` are optional on purpose: omitting one means
     * "the rows with no HSN / no UQC", which is the "—" group on screen.
     */
    @Response('reports.hsnSummaryBreakdown')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'hsn_code', required: false })
    @ApiQuery({ name: 'uqc_code', required: false })
    @ApiQuery({ name: 'rate', required: true })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'gst_route', required: false })
    @Get('/hsn-summary/breakdown')
    async hsnSummaryBreakdown(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<HsnSummaryBreakdownResponseDto>> {
        const data = await this.reportsService.hsnSummaryBreakdown(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            gst_route: query.gst_route,
            hsn_code: query.hsn_code,
            uqc_code: query.uqc_code,
            rate: query.rate,
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
    @ApiQuery({ name: 'currency', required: false, description: 'narrow to one currency' })
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
            currency: query.currency,
            payment_status: query.payment_status,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'group_by', required: false })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'vendor_id', required: false })
    @ApiQuery({ name: 'currency', required: false })
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
                currency: query.currency,
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

    /** SO vs Invoice — per-line price reconciliation (final selling price). */
    @Response('reports.soInvoiceReconciliation')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'invoice_id', required: false })
    @ApiQuery({ name: 'purchase_order_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/so-invoice-reconciliation')
    async soInvoiceReconciliation(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<SoInvoiceReconciliationResponseDto>> {
        const data = await this.reportsService.soInvoiceReconciliation(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                invoice_id: query.invoice_id,
                purchase_order_id: query.purchase_order_id,
                search: query.search,
                page: Number(query.page) || 1,
                perPage: Number(query.perPage) || 25,
            }
        );
        return { data };
    }

    /** Excel export of the same reconciliation (whole filtered set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'invoice_id', required: false })
    @ApiQuery({ name: 'purchase_order_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/so-invoice-reconciliation/export')
    async soInvoiceReconciliationExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer =
            await this.reportsService.soInvoiceReconciliationExcel(companyId, {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                invoice_id: query.invoice_id,
                purchase_order_id: query.purchase_order_id,
                search: query.search,
            });
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="so-invoice-reconciliation_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Lead → Invoice Duration ──────────────────────────────────────────
    /** Conversion cycle time Lead → Quotation → SO → Invoice, per invoice. */
    @Response('reports.leadToInvoiceDuration')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({
        name: 'invoice_type',
        required: false,
        description: 'export (default) | commercial | all',
    })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/lead-to-invoice-duration')
    async leadToInvoiceDuration(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<LeadToInvoiceDurationResponseDto>> {
        const data = await this.reportsService.leadToInvoiceDuration(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            invoice_type: query.invoice_type,
            search: query.search,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + AVERAGE row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'invoice_type', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/lead-to-invoice-duration/export')
    async leadToInvoiceDurationExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.leadToInvoiceDurationExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                invoice_type: query.invoice_type,
                search: query.search,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="lead-to-invoice-duration_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Advance vs Invoice ───────────────────────────────────────────────
    /** Advances taken on Sales Orders vs invoices raised against them. */
    @Response('reports.advanceVsInvoice')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({
        name: 'status',
        required: false,
        description:
            'all | advance_unbilled | partly_adjusted | fully_adjusted | no_advance',
    })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/advance-vs-invoice')
    async advanceVsInvoice(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<AdvanceVsInvoiceResponseDto>> {
        const data = await this.reportsService.advanceVsInvoice(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            status: query.status,
            search: query.search,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/advance-vs-invoice/export')
    async advanceVsInvoiceExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.advanceVsInvoiceExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                status: query.status,
                search: query.search,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="advance-vs-invoice_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Exchange Gain/Loss ───────────────────────────────────────────────
    /** Realized forex gain/loss per customer receipt on foreign invoices. */
    @Response('reports.exchangeGainLoss')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'result', required: false, description: 'all | gain | loss' })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/exchange-gain-loss')
    async exchangeGainLoss(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<ExchangeGainLossResponseDto>> {
        const data = await this.reportsService.exchangeGainLoss(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            result: query.result,
            search: query.search,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the same report (whole filtered set + TOTAL row). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'result', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/exchange-gain-loss/export')
    async exchangeGainLossExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.exchangeGainLossExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                result: query.result,
                search: query.search,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="exchange-gain-loss_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Sales Order Status ───────────────────────────────────────────────
    /** Open / Partially Closed / Closed Sales Orders vs their invoiced qty. */
    @Response('reports.salesOrderStatus')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'invoice_type', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/sales-order-status')
    async salesOrderStatus(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<DocStatusResponseDto>> {
        const data = await this.reportsService.salesOrderStatus(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            customer_id: query.customer_id,
            status: query.status,
            invoice_type: query.invoice_type,
            search: query.search,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Drill-down: the invoice lines billed against one Sales Order. */
    @Response('reports.salesOrderStatusBreakdown')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'so_id', required: true })
    @ApiQuery({ name: 'invoice_type', required: false })
    @Get('/sales-order-status/breakdown')
    async salesOrderStatusBreakdown(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        const data = await this.reportsService.salesOrderStatusBreakdown(
            companyId,
            query.so_id,
            query.invoice_type
        );
        return { data };
    }

    /** Excel export of the Sales Order Status list (whole set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'customer_id', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'invoice_type', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/sales-order-status/export')
    async salesOrderStatusExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.salesOrderStatusExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                customer_id: query.customer_id,
                status: query.status,
                invoice_type: query.invoice_type,
                search: query.search,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="sales-order-status_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Purchase Order (Vendor PO) Status ────────────────────────────────
    /** Open / Partially Closed / Closed Vendor POs vs their GRN-received qty. */
    @Response('reports.purchaseOrderStatus')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'vendor_id', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'grn_scope', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/purchase-order-status')
    async purchaseOrderStatus(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<DocStatusResponseDto>> {
        const data = await this.reportsService.purchaseOrderStatus(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            vendor_id: query.vendor_id,
            status: query.status,
            grn_scope: query.grn_scope,
            search: query.search,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Drill-down: the GRN lines received against one Vendor PO. */
    @Response('reports.purchaseOrderStatusBreakdown')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'pov_id', required: true })
    @ApiQuery({ name: 'grn_scope', required: false })
    @Get('/purchase-order-status/breakdown')
    async purchaseOrderStatusBreakdown(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        const data = await this.reportsService.purchaseOrderStatusBreakdown(
            companyId,
            query.pov_id,
            query.grn_scope
        );
        return { data };
    }

    /** Excel export of the Purchase Order Status list (whole set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'vendor_id', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'grn_scope', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/purchase-order-status/export')
    async purchaseOrderStatusExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.purchaseOrderStatusExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                vendor_id: query.vendor_id,
                status: query.status,
                grn_scope: query.grn_scope,
                search: query.search,
            }
        );
        const stamp = (s?: string) => (s || '').slice(0, 10);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="purchase-order-status_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Stock Turnover Ratio ─────────────────────────────────────────────
    @Response('reports.stockTurnover')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/stock-turnover')
    async stockTurnover(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<StockTurnoverResponseDto>> {
        const data = await this.reportsService.stockTurnover(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            category_id: query.category_id,
            product_id: query.product_id,
            search: query.search,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the stock-turnover report (whole filtered set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @Get('/stock-turnover/export')
    async stockTurnoverExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.stockTurnoverExcel(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            category_id: query.category_id,
            product_id: query.product_id,
            search: query.search,
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
            `attachment; filename="stock-turnover_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Inventory Holding Days ───────────────────────────────────────────
    @Response('reports.inventoryHoldingDays')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/inventory-holding-days')
    async inventoryHoldingDays(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<InventoryHoldingDaysResponseDto>> {
        const data = await this.reportsService.inventoryHoldingDays(companyId, {
            date_from: query.date_from,
            date_to: query.date_to,
            category_id: query.category_id,
            product_id: query.product_id,
            search: query.search,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Excel export of the inventory-holding-days report (whole set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @Get('/inventory-holding-days/export')
    async inventoryHoldingDaysExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.inventoryHoldingDaysExcel(
            companyId,
            {
                date_from: query.date_from,
                date_to: query.date_to,
                category_id: query.category_id,
                product_id: query.product_id,
                search: query.search,
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
            `attachment; filename="inventory-holding-days_${stamp(
                query.date_from
            )}_${stamp(query.date_to)}.xlsx"`
        );
        res.end(buffer);
    }

    // ── Inventory Aging ──────────────────────────────────────────────────
    @Response('reports.inventoryAging')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'as_of', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'perPage', required: false })
    @Get('/inventory-aging')
    async inventoryAging(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<InventoryAgingResponseDto>> {
        const data = await this.reportsService.inventoryAging(companyId, {
            as_of: query.as_of,
            category_id: query.category_id,
            product_id: query.product_id,
            search: query.search,
            order_by: query.order_by as any,
            order_direction: query.order_direction as any,
            page: Number(query.page) || 1,
            perPage: Number(query.perPage) || 25,
        });
        return { data };
    }

    /** Drill-down behind one product's closing inventory: purchases + sales. */
    @Response('reports.inventoryAging')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'product_id', required: true })
    @ApiQuery({ name: 'as_of', required: false })
    @Get('/inventory-aging/breakdown')
    async inventoryAgingBreakdown(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>
    ): Promise<IResponse<any>> {
        const data = await this.reportsService.inventoryAgingBreakdown(
            companyId,
            query.product_id,
            query.as_of
        );
        return { data };
    }

    /** Excel export of the inventory-aging report (whole set + TOTAL). */
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'as_of', required: false })
    @ApiQuery({ name: 'category_id', required: false })
    @ApiQuery({ name: 'product_id', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'order_by', required: false })
    @ApiQuery({ name: 'order_direction', required: false })
    @Get('/inventory-aging/export')
    async inventoryAgingExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Query() query: Record<string, string>,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const buffer = await this.reportsService.inventoryAgingExcel(companyId, {
            as_of: query.as_of,
            category_id: query.category_id,
            product_id: query.product_id,
            search: query.search,
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
            `attachment; filename="inventory-aging_${stamp(query.as_of)}.xlsx"`
        );
        res.end(buffer);
    }
}
