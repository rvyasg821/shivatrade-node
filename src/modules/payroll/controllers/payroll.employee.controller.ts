import {
    Controller,
    Get,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    UseGuards,
    Res,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { RequireToolAccess } from '@modules/subscription/decorators/tool-access.decorator';
import { PayslipService } from '../services/payslip.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { PayRunService } from '../services/pay-run.service';
import { ENUM_PAY_RUN_STATUS } from '../enums/payroll.enum';

@ApiTags('employee.payroll')
@UseGuards(ToolAccessGuard)
@RequireToolAccess(['hrm-payroll'])
@Controller({ version: '1', path: '/employee/payroll' })
export class PayrollEmployeeController {
    constructor(
        private readonly payslipService: PayslipService,
        private readonly pdfService: PayslipPdfService,
        private readonly payRunService: PayRunService,
    ) {}

    /**
     * List the current employee's own payslips. Only payslips on
     * approved or paid pay runs are visible — drafts/calculated runs
     * are work-in-progress and shouldn't leak to employees.
     */
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-payslips')
    async myPayslips(
        @AuthJwtPayload('user') userId: string,
        @Query('_limit') limit?: string,
        @Query('_offset') offset?: string,
    ) {
        const { items, total } = await this.payslipService.listByUser(
            userId,
            limit ? parseInt(limit, 10) : 50,
            offset ? parseInt(offset, 10) : 0,
        );

        // Filter to only payslips on approved/paid runs
        const visible: typeof items = [];
        for (const slip of items) {
            try {
                const run = await this.payRunService.findOneById(slip.pay_run_id);
                if (
                    run.status === ENUM_PAY_RUN_STATUS.APPROVED ||
                    run.status === ENUM_PAY_RUN_STATUS.PAID
                ) {
                    visible.push({ ...slip, pay_run_status: run.status, pay_date: run.pay_date } as any);
                }
            } catch { /* ignore */ }
        }

        return {
            statusCode: 200,
            message: 'Success',
            data: visible,
            _pagination: { total: visible.length, totalPage: 1 },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/my-payslips/:id')
    async getMyPayslip(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
    ) {
        const slip = await this.payslipService.findOneById(id);
        if (slip.user_id !== userId) {
            throw new ForbiddenException('You can only view your own payslips');
        }
        const run = await this.payRunService.findOneById(slip.pay_run_id);
        if (
            run.status !== ENUM_PAY_RUN_STATUS.APPROVED &&
            run.status !== ENUM_PAY_RUN_STATUS.PAID
        ) {
            throw new ForbiddenException('Payslip is not yet released');
        }
        const lineItems = await this.payslipService.getLineItems(id);
        return {
            statusCode: 200,
            message: 'Success',
            data: { ...slip, line_items: lineItems, pay_run_status: run.status, pay_date: run.pay_date },
        };
    }

    @AuthJwtAccessProtected()
    @Get('/my-payslips/:id/pdf')
    async downloadMyPayslipPdf(
        @Param('id') id: string,
        @AuthJwtPayload('user') userId: string,
        @Res() res: ExpressResponse,
    ) {
        const slip = await this.payslipService.findOneById(id);
        if (slip.user_id !== userId) {
            throw new ForbiddenException('You can only download your own payslips');
        }
        const run = await this.payRunService.findOneById(slip.pay_run_id);
        if (
            run.status !== ENUM_PAY_RUN_STATUS.APPROVED &&
            run.status !== ENUM_PAY_RUN_STATUS.PAID
        ) {
            throw new ForbiddenException('Payslip is not yet released');
        }
        const result = await this.pdfService.generate(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.end(result.buffer);
    }
}
