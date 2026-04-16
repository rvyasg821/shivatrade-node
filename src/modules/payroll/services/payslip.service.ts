import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PayslipRepository } from '../repository/repositories/payslip.repository';
import { PayslipLineItemRepository } from '../repository/repositories/payslip-line-item.repository';
import { PayRunRepository } from '../repository/repositories/pay-run.repository';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { PayslipEntity } from '../repository/entities/payslip.entity';
import { PayslipLineItemEntity } from '../repository/entities/payslip-line-item.entity';
import { PayRunEntity } from '../repository/entities/pay-run.entity';
import {
    ENUM_LINE_ITEM_TYPE,
    ENUM_LINE_ITEM_CATEGORY,
    ENUM_PAY_RUN_STATUS,
} from '../enums/payroll.enum';

@Injectable()
export class PayslipService {
    constructor(
        private readonly payslipRepo: PayslipRepository,
        private readonly lineItemRepo: PayslipLineItemRepository,
        private readonly payRunRepo: PayRunRepository,
        private readonly userRepo: UserRepository,
    ) {}

    /**
     * List payslips for a pay run.
     *
     * If the pay run is NOT in 'paid' status, payslips whose user has been
     * deleted since the calculation are filtered out — those represent stale
     * rows from an earlier calculation that no longer reflect the current
     * roster. Paid runs always show everything as a historical record of
     * what was actually paid out on payday.
     */
    async listByPayRun(payRunId: string): Promise<PayslipEntity[]> {
        const payslips = (await this.payslipRepo.findAll(
            { pay_run_id: payRunId, soft_delete: false },
            { order: { employee_name: 'ASC' as any } },
        )) as PayslipEntity[];

        if (payslips.length === 0) return payslips;

        // Check the run status
        const run = (await this.payRunRepo.findOneById(payRunId)) as PayRunEntity;
        if (!run || run.status === ENUM_PAY_RUN_STATUS.PAID) {
            return payslips;
        }

        // Non-paid run → exclude payslips whose user has been deleted
        const userIds = [...new Set(payslips.map(p => p.user_id))];
        const users = (await this.userRepo.findAll({
            _id: { $in: userIds },
            deleted: false,
        } as any)) as any[];

        const liveUserIds = new Set(users.map(u => String(u._id)));
        return payslips.filter(p => liveUserIds.has(String(p.user_id)));
    }

    async listByUser(
        userId: string,
        limit = 50,
        offset = 0,
    ): Promise<{ items: PayslipEntity[]; total: number }> {
        const find: any = { user_id: userId, soft_delete: false };
        const [items, total] = await Promise.all([
            this.payslipRepo.findAll(find, {
                paging: { limit, offset },
                order: { createdAt: 'DESC' as any },
            }) as Promise<PayslipEntity[]>,
            this.payslipRepo.getTotal(find),
        ]);
        return { items, total };
    }

    async findOneById(id: string): Promise<PayslipEntity> {
        const item = (await this.payslipRepo.findOneById(id)) as PayslipEntity;
        if (!item) throw new NotFoundException('Payslip not found');
        return item;
    }

    async getLineItems(payslipId: string): Promise<PayslipLineItemEntity[]> {
        return (await this.lineItemRepo.findAll(
            { payslip_id: payslipId, soft_delete: false },
            { order: { type: 'ASC' as any, sort_order: 'ASC' as any } },
        )) as PayslipLineItemEntity[];
    }

    async findLineItemById(id: string): Promise<PayslipLineItemEntity> {
        const item = (await this.lineItemRepo.findOneById(id)) as PayslipLineItemEntity;
        if (!item) throw new NotFoundException('Line item not found');
        return item;
    }

    /**
     * Add a manual line item to a payslip (e.g. admin entering tax/NI/student loan).
     * Triggers a recompute of the payslip totals.
     */
    async addLineItem(
        payslipId: string,
        data: Partial<PayslipLineItemEntity>,
        actionBy?: string,
    ): Promise<PayslipLineItemEntity> {
        const slip = await this.findOneById(payslipId);
        await this.assertEditable(slip);

        const created = await this.lineItemRepo.create(
            {
                ...data,
                payslip_id: payslipId,
                is_auto: false,
                soft_delete: false,
            } as any,
            { actionBy },
        );
        await this.recomputePayslipTotals(payslipId);
        return created;
    }

    async updateLineItem(
        lineItemId: string,
        data: Partial<PayslipLineItemEntity>,
        actionBy?: string,
    ): Promise<PayslipLineItemEntity> {
        const item = (await this.lineItemRepo.findOneById(lineItemId)) as PayslipLineItemEntity;
        if (!item) throw new NotFoundException('Line item not found');

        const slip = await this.findOneById(item.payslip_id);
        await this.assertEditable(slip);

        const updated = (await this.lineItemRepo.update(
            { _id: lineItemId },
            data as any,
            { actionBy },
        )) as PayslipLineItemEntity;

        await this.recomputePayslipTotals(item.payslip_id);
        return updated;
    }

    async deleteLineItem(lineItemId: string, actionBy?: string): Promise<void> {
        const item = (await this.lineItemRepo.findOneById(lineItemId)) as PayslipLineItemEntity;
        if (!item) throw new NotFoundException('Line item not found');

        const slip = await this.findOneById(item.payslip_id);
        await this.assertEditable(slip);

        await this.lineItemRepo.update(
            { _id: lineItemId },
            { soft_delete: true } as any,
            { actionBy },
        );
        await this.recomputePayslipTotals(item.payslip_id);
    }

    /**
     * Recompute all monetary fields on a payslip from its line items.
     * Categorises by line item category to populate the snapshot fields.
     */
    async recomputePayslipTotals(payslipId: string): Promise<PayslipEntity> {
        const slip = await this.findOneById(payslipId);
        const items = await this.getLineItems(payslipId);

        const earnings = items.filter(i => i.type === ENUM_LINE_ITEM_TYPE.EARNING);
        const deductions = items.filter(i => i.type === ENUM_LINE_ITEM_TYPE.DEDUCTION);

        const sumByCat = (list: PayslipLineItemEntity[], cat: string) =>
            list.filter(i => i.category === cat).reduce((s, i) => s + Number(i.amount), 0);

        const base_pay = sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.BASE);
        const overtime_pay = sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.OVERTIME);
        const bonuses_total = sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.BONUS);
        const allowances_total = sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.ALLOWANCE) +
                                  sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.HOLIDAY_PAY);
        const other_earnings_total = sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.COMMISSION) +
                                      sumByCat(earnings, ENUM_LINE_ITEM_CATEGORY.OTHER_EARNING);
        const gross_pay = earnings.reduce((s, i) => s + Number(i.amount), 0);

        const pension_employee = sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.PENSION_EMPLOYEE);
        const taxable_gross = Math.max(0, gross_pay - pension_employee);

        const tax = sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.TAX);
        const ni = sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.NI);
        const student_loan = sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.STUDENT_LOAN);
        const other_deductions = sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.COURT_ORDER) +
                                  sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.OTHER_DEDUCTION) +
                                  sumByCat(deductions, ENUM_LINE_ITEM_CATEGORY.UNPAID_LEAVE);

        const total_deductions = pension_employee + tax + ni + student_loan + other_deductions;
        const net_pay = gross_pay - total_deductions;

        const round = (n: number) => Math.round(n * 100) / 100;

        const updated = (await this.payslipRepo.update(
            { _id: payslipId },
            {
                base_pay: round(base_pay),
                overtime_pay: round(overtime_pay),
                bonuses_total: round(bonuses_total),
                allowances_total: round(allowances_total),
                other_earnings_total: round(other_earnings_total),
                gross_pay: round(gross_pay),
                pension_employee: round(pension_employee),
                taxable_gross: round(taxable_gross),
                tax: round(tax),
                ni: round(ni),
                student_loan: round(student_loan),
                other_deductions: round(other_deductions),
                total_deductions: round(total_deductions),
                net_pay: round(net_pay),
            } as any,
        )) as PayslipEntity;

        return updated;
    }

    /**
     * Compute and persist YTD totals for a payslip by summing prior payslips
     * for the same user in the current tax year. Called by the calculator
     * after the payslip is fully populated.
     *
     * UK tax year runs Apr 6 → Apr 5. We use the calendar year of the
     * pay_date for simplicity in v1; can be configured per company later.
     */
    async recomputeYearToDate(payslipId: string): Promise<PayslipEntity> {
        const slip = await this.findOneById(payslipId);
        const taxYearStart = this.getUkTaxYearStart(new Date());

        // All previously-paid payslips for this user since tax year start (excluding this one)
        const priorSlips = (await this.payslipRepo.findAll({
            user_id: slip.user_id,
            soft_delete: false,
            createdAt: { $gte: taxYearStart },
        })) as PayslipEntity[];

        const ytd = priorSlips.reduce(
            (acc, p) => {
                if (p._id === slip._id) return acc;
                acc.gross += Number(p.gross_pay) || 0;
                acc.taxable += Number(p.taxable_gross) || 0;
                acc.tax += Number(p.tax) || 0;
                acc.ni += Number(p.ni) || 0;
                acc.pension += Number(p.pension_employee) || 0;
                acc.net += Number(p.net_pay) || 0;
                return acc;
            },
            { gross: 0, taxable: 0, tax: 0, ni: 0, pension: 0, net: 0 },
        );

        const round = (n: number) => Math.round(n * 100) / 100;

        return (await this.payslipRepo.update(
            { _id: payslipId },
            {
                ytd_gross: round(ytd.gross + Number(slip.gross_pay)),
                ytd_taxable_gross: round(ytd.taxable + Number(slip.taxable_gross)),
                ytd_tax: round(ytd.tax + Number(slip.tax)),
                ytd_ni: round(ytd.ni + Number(slip.ni)),
                ytd_pension_employee: round(ytd.pension + Number(slip.pension_employee)),
                ytd_net: round(ytd.net + Number(slip.net_pay)),
            } as any,
        )) as PayslipEntity;
    }

    private getUkTaxYearStart(ref: Date): Date {
        const year = ref.getFullYear();
        const aprilSixth = new Date(year, 3, 6); // April is month index 3
        if (ref.getTime() >= aprilSixth.getTime()) return aprilSixth;
        return new Date(year - 1, 3, 6);
    }

    private async assertEditable(slip: PayslipEntity): Promise<void> {
        const run = (await this.payRunRepo.findOneById(slip.pay_run_id)) as PayRunEntity;
        if (run?.status === ENUM_PAY_RUN_STATUS.PAID) {
            throw new BadRequestException('Cannot edit a payslip on a paid pay run.');
        }
    }
}
