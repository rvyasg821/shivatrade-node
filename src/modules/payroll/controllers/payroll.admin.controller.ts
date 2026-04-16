import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    UseGuards,
    Res,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

import { PayScheduleService } from '../services/pay-schedule.service';
import { PayElementService } from '../services/pay-element.service';
import { PayRunService } from '../services/pay-run.service';
import { PayslipService } from '../services/payslip.service';
import { PayrollCalculationService } from '../services/payroll-calculation.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { PaymentFileService } from '../services/payment-file.service';

@ApiTags('admin.payroll')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-payroll'])
@Controller({ version: '1', path: '/payroll' })
export class PayrollAdminController {
    private readonly logger = new Logger(PayrollAdminController.name);
    constructor(
        private readonly scheduleService: PayScheduleService,
        private readonly elementService: PayElementService,
        private readonly payRunService: PayRunService,
        private readonly payslipService: PayslipService,
        private readonly calcService: PayrollCalculationService,
        private readonly pdfService: PayslipPdfService,
        private readonly paymentFileService: PaymentFileService,
    ) {}

    // ============ PAY SCHEDULES ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/schedules')
    async listSchedules(@AuthJwtPayload('companyId') companyId: string) {
        const items = await this.scheduleService.list(companyId);
        return { statusCode: 200, message: 'Success', data: items };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/schedules')
    async createSchedule(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const item = await this.scheduleService.create(companyId, body, userId);
        return { statusCode: 200, message: 'Pay schedule created', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/schedules/:id')
    async updateSchedule(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const item = await this.scheduleService.update(id, body, userId);
        return { statusCode: 200, message: 'Pay schedule updated', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/schedules/:id')
    async deleteSchedule(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        await this.scheduleService.softDelete(id, userId);
        return { statusCode: 200, message: 'Pay schedule deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/schedules/:id/next-period')
    async getNextPeriod(@Param('id') id: string) {
        const schedule = await this.scheduleService.findOneById(id);
        const period = this.scheduleService.computeNextPeriod(schedule);
        return { statusCode: 200, message: 'Success', data: period };
    }

    // ============ PAY ELEMENTS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/elements')
    async listElements(@AuthJwtPayload('companyId') companyId: string) {
        const items = await this.elementService.list(companyId);
        return { statusCode: 200, message: 'Success', data: items };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/elements')
    async createElement(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const item = await this.elementService.create(companyId, body, userId);
        return { statusCode: 200, message: 'Pay element created', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/elements/:id')
    async updateElement(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const item = await this.elementService.update(id, body, userId);
        return { statusCode: 200, message: 'Pay element updated', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/elements/:id')
    async deleteElement(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        await this.elementService.softDelete(id, userId);
        return { statusCode: 200, message: 'Pay element deleted' };
    }

    // ============ PAY RUNS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/runs')
    async listRuns(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Query('status') status?: string,
        @Query('location_id') locationIdFilter?: string,
        @Query('_limit') limit?: string,
        @Query('_offset') offset?: string,
    ) {
        const isLocationAdmin = roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN;
        const effectiveLocationId = isLocationAdmin
            ? jwtLocationId
            : locationIdFilter || undefined;

        const { items, total } = await this.payRunService.list(companyId, {
            status,
            locationId: effectiveLocationId,
            limit: limit ? parseInt(limit, 10) : 25,
            offset: offset ? parseInt(offset, 10) : 0,
        });
        return {
            statusCode: 200,
            message: 'Success',
            data: items,
            _pagination: { total, totalPage: Math.ceil(total / (limit ? parseInt(limit, 10) : 25)) },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/runs/:id')
    async getRun(@Param('id') id: string) {
        const run = await this.payRunService.findOneById(id);
        const payslips = await this.payslipService.listByPayRun(id);
        return { statusCode: 200, message: 'Success', data: { ...run, payslips } };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/runs')
    async createRun(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') jwtLocationId: string,
        @Body() body: any,
    ) {
        // Location Admin: always scope to their assigned location.
        // Company Admin: use the location_id from the request body
        // (set by the top-header location selector).
        const isLocationAdmin = roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN;
        if (isLocationAdmin && jwtLocationId) {
            body.location_id = jwtLocationId;
        }
        this.logger.log(
            `[CREATE RUN] role=${roleName} | body.location_id=${body.location_id} | jwtLocationId=${jwtLocationId} | companyId=${companyId}`,
        );
        const run = await this.payRunService.create(companyId, body, userId);
        return { statusCode: 200, message: 'Pay run created', data: run };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/runs/:id')
    async updateRun(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const run = await this.payRunService.update(id, body, userId);
        return { statusCode: 200, message: 'Pay run updated', data: run };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/runs/:id')
    async deleteRun(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        await this.payRunService.softDelete(id, userId);
        return { statusCode: 200, message: 'Pay run deleted' };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/runs/:id/calculate')
    async calculateRun(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const result = await this.calcService.calculatePayRun(id, userId);
        return {
            statusCode: 200,
            message: `Calculated ${result.employee_count} payslip(s), skipped ${result.skipped_count}`,
            data: result,
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/runs/:id/approve')
    async approveRun(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const run = await this.payRunService.approve(id, userId);
        return { statusCode: 200, message: 'Pay run approved', data: run };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/runs/:id/mark-paid')
    async markRunPaid(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const run = await this.payRunService.markPaid(id, userId);
        return { statusCode: 200, message: 'Pay run marked as paid', data: run };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/runs/:id/revert')
    async revertRun(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const run = await this.payRunService.revertToDraft(id, userId);
        return { statusCode: 200, message: 'Pay run reverted to draft', data: run };
    }

    @AuthJwtAccessProtected()
    @Get('/runs/:id/bank-csv')
    async exportBankCsv(
        @Param('id') id: string,
        @Res() res: ExpressResponse,
    ) {
        const result = await this.paymentFileService.generateBankCsv(id);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.setHeader('X-Payroll-Included', String(result.summary.included));
        res.setHeader('X-Payroll-Skipped', String(result.summary.skipped));
        res.setHeader('X-Payroll-Total', String(result.summary.total_amount));
        res.end(result.csv);
    }

    // ============ PAYSLIPS ============

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/payslips/:id')
    async getPayslip(@Param('id') id: string) {
        const payslip = await this.payslipService.findOneById(id);
        const lineItems = await this.payslipService.getLineItems(id);
        return { statusCode: 200, message: 'Success', data: { ...payslip, line_items: lineItems } };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/payslips/:id/line-items')
    async addLineItem(
        @Param('id') payslipId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        if (!body?.label || !body?.type || !body?.category) {
            throw new BadRequestException('label, type and category are required');
        }
        const item = await this.payslipService.addLineItem(payslipId, body, userId);
        // Refresh the run totals after the payslip changes
        const slip = await this.payslipService.findOneById(payslipId);
        await this.payRunService.recomputeTotals(slip.pay_run_id);
        return { statusCode: 200, message: 'Line item added', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/payslips/line-items/:itemId')
    async updateLineItem(
        @Param('itemId') itemId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: any,
    ) {
        const item = await this.payslipService.updateLineItem(itemId, body, userId);
        const slip = await this.payslipService.findOneById(item.payslip_id);
        await this.payRunService.recomputeTotals(slip.pay_run_id);
        return { statusCode: 200, message: 'Line item updated', data: item };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/payslips/line-items/:itemId')
    async deleteLineItem(
        @Param('itemId') itemId: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const lineItem = await this.payslipService.findLineItemById(itemId);
        await this.payslipService.deleteLineItem(itemId, userId);
        const slip = await this.payslipService.findOneById(lineItem.payslip_id);
        await this.payRunService.recomputeTotals(slip.pay_run_id);
        return { statusCode: 200, message: 'Line item deleted' };
    }

    @AuthJwtAccessProtected()
    @Get('/payslips/:id/pdf')
    async downloadPayslipPdf(
        @Param('id') id: string,
        @Res() res: ExpressResponse,
    ) {
        const result = await this.pdfService.generate(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.end(result.buffer);
    }
}
