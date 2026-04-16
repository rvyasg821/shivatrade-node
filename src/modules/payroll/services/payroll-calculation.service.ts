import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PayRunRepository } from '../repository/repositories/pay-run.repository';
import { PayslipRepository } from '../repository/repositories/payslip.repository';
import { PayslipLineItemRepository } from '../repository/repositories/payslip-line-item.repository';
import { PayScheduleRepository } from '../repository/repositories/pay-schedule.repository';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { EmployeeLocationAssignmentRepository } from '@modules/employee/repository/repositories/employee-location-assignment.repository';
import { LeaveRequestRepository } from '@modules/leave/repository/repositories/leave-request.repository';
import { LeaveTypeRepository } from '@modules/leave/repository/repositories/leave-type.repository';
import { AttendanceRecordRepository } from '@modules/attendance/repository/repositories/attendance-record.repository';
import { PayslipService } from './payslip.service';
import { PayRunService } from './pay-run.service';
import { PayRunEntity } from '../repository/entities/pay-run.entity';
import { PayslipEntity } from '../repository/entities/payslip.entity';
import { PayScheduleEntity } from '../repository/entities/pay-schedule.entity';
import {
    ENUM_PAY_RUN_STATUS,
    ENUM_LINE_ITEM_TYPE,
    ENUM_LINE_ITEM_CATEGORY,
    ENUM_PAY_FREQUENCY,
} from '../enums/payroll.enum';
import { ENUM_LEAVE_REQUEST_STATUS } from '@modules/leave/enums/leave.enum';

interface CalcContext {
    payRun: PayRunEntity;
    schedule: PayScheduleEntity;
    periodStart: Date;
    periodEnd: Date;
    payPeriodsPerYear: number;
}

@Injectable()
export class PayrollCalculationService {
    private readonly logger = new Logger(PayrollCalculationService.name);

    constructor(
        private readonly payRunRepo: PayRunRepository,
        private readonly payRunService: PayRunService,
        private readonly payslipRepo: PayslipRepository,
        private readonly payslipService: PayslipService,
        private readonly lineItemRepo: PayslipLineItemRepository,
        private readonly scheduleRepo: PayScheduleRepository,
        private readonly userRepo: UserRepository,
        private readonly empLocationRepo: EmployeeLocationAssignmentRepository,
        private readonly leaveRepo: LeaveRequestRepository,
        private readonly leaveTypeRepo: LeaveTypeRepository,
        private readonly attendanceRepo: AttendanceRecordRepository,
    ) {}

    /**
     * Run the calculation engine for an entire pay run.
     * Iterates over all active employees scoped to the company (and location
     * if the run is location-scoped), creates / refreshes a payslip for each,
     * and recomputes the run's totals.
     */
    async calculatePayRun(payRunId: string, actionBy?: string): Promise<{
        run: PayRunEntity;
        employee_count: number;
        skipped_count: number;
    }> {
        const payRun = (await this.payRunRepo.findOneById(payRunId)) as PayRunEntity;
        if (!payRun) throw new BadRequestException('Pay run not found');
        if (
            payRun.status === ENUM_PAY_RUN_STATUS.PAID ||
            payRun.status === ENUM_PAY_RUN_STATUS.APPROVED
        ) {
            throw new BadRequestException(
                `Cannot recalculate a pay run in '${payRun.status}' status. Revert to draft first.`,
            );
        }

        const schedule = (await this.scheduleRepo.findOneById(
            payRun.schedule_id,
        )) as PayScheduleEntity;
        if (!schedule) throw new BadRequestException('Pay schedule not found');

        const ctx: CalcContext = {
            payRun,
            schedule,
            periodStart: new Date(payRun.period_start),
            periodEnd: new Date(payRun.period_end),
            payPeriodsPerYear: this.payPeriodsPerYear(schedule.frequency),
        };

        // Fetch eligible employees (active, in this company, scoped to location).
        // Mirrors the employee list logic: check BOTH primary location_id AND
        // additional location assignments so employees assigned to multiple
        // locations are included.
        const baseFindEmployees: any = {
            companyId: payRun.company_id,
            deleted: false,
            is_active: true,
        };

        let employees: any[];
        if (payRun.location_id) {
            // Get employees with additional location assignments
            let additionalEmployeeIds: string[] = [];
            try {
                const assignments = await this.empLocationRepo.findByLocationId(payRun.location_id);
                additionalEmployeeIds = assignments.map(a => a.employee_id);
            } catch {
                // Table may not exist yet
            }

            if (additionalEmployeeIds.length > 0) {
                // Primary location match
                const primaryUsers = (await this.userRepo.findAll({
                    ...baseFindEmployees,
                    location_id: payRun.location_id,
                })) as any[];
                const primaryIds = new Set(primaryUsers.map((u: any) => String(u._id)));

                // Additional assignment match (fetch those not already found)
                const extraIds = additionalEmployeeIds.filter(id => !primaryIds.has(id));
                let extraUsers: any[] = [];
                if (extraIds.length > 0) {
                    extraUsers = (await this.userRepo.findAll({
                        ...baseFindEmployees,
                        _id: { $in: extraIds },
                    })) as any[];
                }

                employees = [...primaryUsers, ...extraUsers];
            } else {
                employees = (await this.userRepo.findAll({
                    ...baseFindEmployees,
                    location_id: payRun.location_id,
                })) as any[];
            }
        } else {
            employees = (await this.userRepo.findAll(baseFindEmployees)) as any[];
        }

        // ── Diagnostic: dump what the DB actually has for this company + location ──
        try {
            const manager: any = (this.userRepo as any)._repository.manager;
            const diagRows: any[] = await manager.query(
                `SELECT _id, first_name, last_name, employee_code, location_id, "companyId", status, is_active, deleted, annual_salary, pay_type
                 FROM public.users
                 WHERE "companyId" = $1 AND deleted = false
                 ORDER BY first_name
                 LIMIT 20`,
                [payRun.company_id],
            );
            this.logger.log(
                `[PAYROLL CALC][DIAG] All users in company ${payRun.company_id}: ${diagRows.length} rows`,
            );
            for (const r of diagRows) {
                this.logger.log(
                    `[PAYROLL CALC][DIAG]   ${String(r._id).slice(0, 8)} ${r.first_name} ${r.last_name} | ` +
                    `location_id=${r.location_id} | status=${r.status} | is_active=${r.is_active} | salary=${r.annual_salary} | pay_type=${r.pay_type}`,
                );
            }

            if (payRun.location_id) {
                const assignRows: any[] = await manager.query(
                    `SELECT employee_id, location_id, is_active
                     FROM public.employee_location_assignments
                     WHERE location_id = $1 AND is_active = true AND deleted = false
                     LIMIT 20`,
                    [payRun.location_id],
                );
                this.logger.log(
                    `[PAYROLL CALC][DIAG] Location assignments for ${payRun.location_id}: ${assignRows.length} rows`,
                );
                for (const a of assignRows) {
                    this.logger.log(
                        `[PAYROLL CALC][DIAG]   employee_id=${String(a.employee_id).slice(0, 8)} | location=${a.location_id} | active=${a.is_active}`,
                    );
                }
            }
        } catch (diagErr: any) {
            this.logger.error(`[PAYROLL CALC][DIAG] failed: ${diagErr?.message}`);
        }

        this.logger.log(
            `[PAYROLL CALC] Run ${payRunId} | companyId=${payRun.company_id} | ` +
            `locationId=${payRun.location_id || 'ANY'} | found ${employees.length} eligible employee(s)`,
        );

        let calculated = 0;
        let skipped = 0;

        // Track which users are eligible for this run (used later to clean
        // up orphaned payslips from deleted/inactive users).
        const eligibleUserIds = new Set<string>(employees.map((e: any) => String(e._id)));

        for (const emp of employees) {
            const empLabel =
                `${emp._id?.toString()?.slice(0, 8) || '??'} ` +
                `(${[emp.first_name, emp.last_name].filter(Boolean).join(' ') || emp.name || 'unnamed'})`;

            // Skip employees with no salary configuration
            const annualNum = Number(emp.annual_salary);
            const rateNum = Number(emp.hourly_rate);
            const hasSalary =
                (emp.annual_salary != null && annualNum > 0) ||
                (emp.hourly_rate != null && rateNum > 0);
            if (!hasSalary) {
                this.logger.warn(
                    `[PAYROLL CALC] SKIP ${empLabel} — no salary configured ` +
                    `(annual_salary=${emp.annual_salary}, hourly_rate=${emp.hourly_rate}, ` +
                    `pay_type=${emp.pay_type || 'default'})`,
                );
                skipped++;
                continue;
            }

            this.logger.log(
                `[PAYROLL CALC] Processing ${empLabel} | pay_type=${emp.pay_type || 'hourly(default)'} | ` +
                `annual=${emp.annual_salary} | hourly=${emp.hourly_rate} | weekly_hours=${emp.weekly_working_hours}`,
            );

            try {
                await this.calculateOneEmployee(emp, ctx, actionBy);
                calculated++;
                this.logger.log(`[PAYROLL CALC] ✓ Calculated ${empLabel}`);
            } catch (err: any) {
                this.logger.error(
                    `[PAYROLL CALC] ✗ FAILED ${empLabel} — ${err?.message}`,
                );
                if (err?.stack) {
                    this.logger.error(err.stack);
                }
                skipped++;
            }
        }

        this.logger.log(
            `[PAYROLL CALC] Run ${payRunId} complete | calculated=${calculated} | skipped=${skipped}`,
        );

        // Clean up orphaned payslips: any payslip in this run whose user has
        // been DELETED from the system (not just inactive) is soft-deleted so
        // it disappears from the UI. Inactive employees' existing payslips
        // are PRESERVED because they represent real months the employee
        // worked — per user requirement, "data should be available till they
        // worked month". Inactive employees are just excluded from NEW
        // calculations via the eligibility filter above.
        //
        // We only do this for non-paid runs — paid runs are historical
        // records and must never change.
        try {
            const existingPayslips = (await this.payslipRepo.findAll({
                pay_run_id: payRunId,
                soft_delete: false,
            })) as PayslipEntity[];

            if (existingPayslips.length > 0) {
                // Collect all user_ids referenced by existing payslips
                const existingUserIds = [
                    ...new Set(existingPayslips.map(p => String(p.user_id))),
                ];

                // Look up those users including soft-deleted ones so we can
                // tell "deleted" from "just inactive" / "moved location".
                const usersInPayslips = (await this.userRepo.findAll<any>(
                    { _id: { $in: existingUserIds } },
                    { withDeleted: true },
                )) as any[];

                // Build the set of users that are still live (deleted = false).
                // Inactive employees pass this check because deleted stays false
                // when an admin just flips their status to INACTIVE.
                const liveUserIds = new Set<string>(
                    usersInPayslips
                        .filter((u: any) => u && u.deleted === false)
                        .map((u: any) => String(u._id)),
                );

                // A payslip is orphaned when its user is either DELETED or
                // has disappeared from the users table entirely.
                const orphanedPayslipIds: string[] = [];
                for (const slip of existingPayslips) {
                    if (!liveUserIds.has(String(slip.user_id))) {
                        orphanedPayslipIds.push(slip._id);
                    }
                }

                if (orphanedPayslipIds.length > 0) {
                    // Single bulk update each — much faster than the loop we had before
                    const slipsAffected = await this.payslipRepo.bulkSoftDelete(orphanedPayslipIds);
                    const itemsAffected = await this.lineItemRepo.bulkSoftDeleteByPayslipIds(orphanedPayslipIds);
                    this.logger.log(
                        `Cleaned up ${slipsAffected} orphaned payslip(s) + ${itemsAffected} line item(s) ` +
                        `for deleted users on pay run ${payRunId}`,
                    );
                }
            }
        } catch (cleanupErr: any) {
            this.logger.error(`Orphaned payslip cleanup failed: ${cleanupErr?.message}`);
            // Non-fatal — calculation still succeeds
        }

        // Mark run as calculated and refresh totals
        await this.payRunRepo.update(
            { _id: payRunId },
            {
                status: ENUM_PAY_RUN_STATUS.CALCULATED,
                calculated_at: new Date(),
                calculated_by: actionBy,
            } as any,
        );
        const updatedRun = await this.payRunService.recomputeTotals(payRunId);

        return {
            run: updatedRun,
            employee_count: calculated,
            skipped_count: skipped,
        };
    }

    /**
     * Calculate (or recalculate) a single employee's payslip for the given pay run.
     * Preserves any manually-added line items (is_auto = false).
     */
    private async calculateOneEmployee(
        employee: any,
        ctx: CalcContext,
        actionBy?: string,
    ): Promise<PayslipEntity> {
        // Find or create the payslip row
        let payslip = (await this.payslipRepo.findOne({
            pay_run_id: ctx.payRun._id,
            user_id: employee._id,
            soft_delete: false,
        })) as PayslipEntity | null;

        const employeeName =
            [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
            employee.name ||
            'Employee';

        if (!payslip) {
            payslip = (await this.payslipRepo.create(
                {
                    pay_run_id: ctx.payRun._id,
                    company_id: ctx.payRun.company_id,
                    location_id: employee.location_id || ctx.payRun.location_id || null,
                    user_id: employee._id,
                    employee_name: employeeName,
                    employee_code: employee.employee_code || null,
                    pay_type: employee.pay_type || 'hourly',
                    currency: ctx.payRun.currency,
                    account_holder_name: employee.account_holder_name || null,
                    sort_code: employee.sort_code || null,
                    account_number: employee.account_number || null,
                    tax_code: employee.tax_code || null,
                    ni_category: employee.ni_category || null,
                    soft_delete: false,
                } as any,
                { actionBy },
            )) as PayslipEntity;
        } else {
            // Refresh snapshot fields in case the employee record changed
            await this.payslipRepo.update(
                { _id: payslip._id },
                {
                    employee_name: employeeName,
                    employee_code: employee.employee_code || null,
                    pay_type: employee.pay_type || 'hourly',
                    account_holder_name: employee.account_holder_name || null,
                    sort_code: employee.sort_code || null,
                    account_number: employee.account_number || null,
                    tax_code: employee.tax_code || null,
                    ni_category: employee.ni_category || null,
                } as any,
            );
        }

        // Wipe previous auto line items so we don't double-count after recalculation
        await this.lineItemRepo.deleteAutoItems(payslip._id);

        // ── 1. Pull attendance hours ────────────────────────────────────────
        const periodStartIso = ctx.periodStart.toISOString().slice(0, 10);
        const periodEndIso = ctx.periodEnd.toISOString().slice(0, 10);

        const attendanceRecords = (await this.attendanceRepo.findAll({
            user_id: employee._id,
            date: { $gte: periodStartIso, $lte: periodEndIso },
            soft_delete: false,
        })) as any[];

        const hoursWorked = attendanceRecords.reduce(
            (sum, r) => sum + (Number(r.regular_hours) || 0),
            0,
        );
        const overtimeHours = attendanceRecords.reduce(
            (sum, r) => sum + (Number(r.overtime_hours) || 0),
            0,
        );

        // ── 2. Pull leave records to find unpaid leave days ─────────────────
        const leaveRequests = (await this.leaveRepo.findAll({
            user_id: employee._id,
            status: ENUM_LEAVE_REQUEST_STATUS.APPROVED,
            soft_delete: false,
            // Overlap with the pay period
            start_date: { $lte: periodEndIso },
            end_date: { $gte: periodStartIso },
        })) as any[];

        let unpaidLeaveDays = 0;
        for (const lr of leaveRequests) {
            const leaveType = (await this.leaveTypeRepo.findOneById(lr.leave_type_id)) as any;
            if (leaveType && leaveType.is_paid === false) {
                unpaidLeaveDays += Number(lr.total_days) || 0;
            }
        }

        // ── 3. Compute base pay (hourly vs salaried) ────────────────────────
        const hourlyRate = Number(employee.hourly_rate) || 0;
        const annualSalary = Number(employee.annual_salary) || 0;
        const weeklyHours = Number(employee.weekly_working_hours) || 0;
        const payType = employee.pay_type || 'hourly';

        let basePay = 0;
        let basePayLabel = '';

        if (payType === 'salaried') {
            // Pro-rated annual salary across pay periods, minus unpaid days
            const periodSalary = annualSalary / ctx.payPeriodsPerYear;
            // Unpaid leave deduction: divide period salary by working days in period (~21 for monthly, 5 for weekly)
            const workingDaysInPeriod = this.workingDaysInPeriod(ctx);
            const unpaidDeduction =
                workingDaysInPeriod > 0
                    ? (periodSalary / workingDaysInPeriod) * unpaidLeaveDays
                    : 0;
            basePay = Math.max(0, periodSalary - unpaidDeduction);
            basePayLabel = `Salary (${ctx.schedule.frequency})`;
        } else {
            // Hourly: pay based on actual hours worked from attendance
            basePay = hoursWorked * hourlyRate;
            basePayLabel = `Hours @ ${hourlyRate.toFixed(2)} × ${hoursWorked.toFixed(2)}h`;
        }

        // ── 4. Build line items ─────────────────────────────────────────────
        let sortOrder = 1;

        // Base pay
        if (basePay > 0) {
            await this.lineItemRepo.create({
                payslip_id: payslip._id,
                type: ENUM_LINE_ITEM_TYPE.EARNING,
                category: ENUM_LINE_ITEM_CATEGORY.BASE,
                label: basePayLabel,
                amount: Math.round(basePay * 100) / 100,
                is_taxable: true,
                is_pre_tax: false,
                is_auto: true,
                sort_order: sortOrder++,
                soft_delete: false,
            } as any);
        }

        // Overtime (1.5x rate by default for v1)
        if (overtimeHours > 0 && hourlyRate > 0) {
            const overtimeRate = hourlyRate * 1.5;
            const overtimePay = overtimeHours * overtimeRate;
            await this.lineItemRepo.create({
                payslip_id: payslip._id,
                type: ENUM_LINE_ITEM_TYPE.EARNING,
                category: ENUM_LINE_ITEM_CATEGORY.OVERTIME,
                label: `Overtime ${overtimeHours.toFixed(2)}h @ ${overtimeRate.toFixed(2)}`,
                amount: Math.round(overtimePay * 100) / 100,
                is_taxable: true,
                is_pre_tax: false,
                is_auto: true,
                sort_order: sortOrder++,
                soft_delete: false,
            } as any);
        }

        // Pension employee contribution (pre-tax deduction)
        const pensionPct = Number(employee.pension_employee_contribution) || 0;
        if (pensionPct > 0 && employee.pension_opt_in !== false) {
            // Compute against base pay only (taxable earnings before pension)
            const pensionAmount = (basePay * pensionPct) / 100;
            await this.lineItemRepo.create({
                payslip_id: payslip._id,
                type: ENUM_LINE_ITEM_TYPE.DEDUCTION,
                category: ENUM_LINE_ITEM_CATEGORY.PENSION_EMPLOYEE,
                label: `Pension contribution (${pensionPct}%)`,
                amount: Math.round(pensionAmount * 100) / 100,
                is_pre_tax: true,
                is_taxable: false,
                is_auto: true,
                sort_order: sortOrder++,
                soft_delete: false,
            } as any);
        }

        // Update hours / unpaid leave snapshot fields
        await this.payslipRepo.update(
            { _id: payslip._id },
            {
                hours_worked: Math.round(hoursWorked * 100) / 100,
                overtime_hours: Math.round(overtimeHours * 100) / 100,
                unpaid_leave_days: Math.round(unpaidLeaveDays * 100) / 100,
            } as any,
        );

        // Recompute totals from line items + YTD snapshot
        await this.payslipService.recomputePayslipTotals(payslip._id);
        const finalSlip = await this.payslipService.recomputeYearToDate(payslip._id);

        return finalSlip;
    }

    private payPeriodsPerYear(frequency: string): number {
        switch (frequency) {
            case ENUM_PAY_FREQUENCY.WEEKLY:
                return 52;
            case ENUM_PAY_FREQUENCY.BIWEEKLY:
                return 26;
            case ENUM_PAY_FREQUENCY.SEMI_MONTHLY:
                return 24;
            case ENUM_PAY_FREQUENCY.MONTHLY:
            default:
                return 12;
        }
    }

    private workingDaysInPeriod(ctx: CalcContext): number {
        // Count Mon-Fri days in the period. v1 doesn't subtract bank holidays.
        const start = new Date(ctx.periodStart);
        const end = new Date(ctx.periodEnd);
        let count = 0;
        const cursor = new Date(start);
        while (cursor.getTime() <= end.getTime()) {
            const d = cursor.getDay();
            if (d !== 0 && d !== 6) count++;
            cursor.setDate(cursor.getDate() + 1);
        }
        return count;
    }
}
