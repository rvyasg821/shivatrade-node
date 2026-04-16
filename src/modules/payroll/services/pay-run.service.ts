import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PayRunRepository } from '../repository/repositories/pay-run.repository';
import { PayslipRepository } from '../repository/repositories/payslip.repository';
import { PayslipLineItemRepository } from '../repository/repositories/payslip-line-item.repository';
import { PayRunEntity } from '../repository/entities/pay-run.entity';
import { PayslipEntity } from '../repository/entities/payslip.entity';
import { ENUM_PAY_RUN_STATUS } from '../enums/payroll.enum';

@Injectable()
export class PayRunService {
    constructor(
        private readonly repo: PayRunRepository,
        private readonly payslipRepo: PayslipRepository,
        private readonly lineItemRepo: PayslipLineItemRepository,
    ) {}

    async list(
        companyId: string,
        filter: { status?: string; locationId?: string; limit?: number; offset?: number } = {},
    ): Promise<{ items: PayRunEntity[]; total: number }> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (filter.status) find.status = filter.status;
        if (filter.locationId) find.location_id = filter.locationId;

        const [items, total] = await Promise.all([
            this.repo.findAll(find, {
                paging: { limit: filter.limit ?? 25, offset: filter.offset ?? 0 },
                order: { period_start: 'DESC' as any },
            }) as Promise<PayRunEntity[]>,
            this.repo.getTotal(find),
        ]);
        return { items, total };
    }

    async findOneById(id: string): Promise<PayRunEntity> {
        const item = (await this.repo.findOneById(id)) as PayRunEntity;
        if (!item) throw new NotFoundException('Pay run not found');
        return item;
    }

    async create(
        companyId: string,
        data: Partial<PayRunEntity>,
        actionBy?: string,
    ): Promise<PayRunEntity> {
        // Defensive: don't allow overlapping runs for the same schedule + period + location.
        // location_id is ALWAYS part of the uniqueness check — a company-wide run
        // (null) and a location-scoped run are treated as different.
        const overlapFilter: any = {
            company_id: companyId,
            schedule_id: data.schedule_id,
            period_start: data.period_start,
            period_end: data.period_end,
            soft_delete: false,
            location_id: data.location_id || null,
        };
        const overlap = (await this.repo.findOne(overlapFilter)) as PayRunEntity | null;
        if (overlap) {
            throw new ConflictException(
                'A pay run already exists for this schedule and period. Open the existing run instead.',
            );
        }

        return this.repo.create(
            {
                ...data,
                company_id: companyId,
                status: ENUM_PAY_RUN_STATUS.DRAFT,
                soft_delete: false,
            } as any,
            { actionBy },
        );
    }

    async update(id: string, data: Partial<PayRunEntity>, actionBy?: string): Promise<PayRunEntity> {
        const run = await this.findOneById(id);
        if (run.status === ENUM_PAY_RUN_STATUS.PAID || run.status === ENUM_PAY_RUN_STATUS.APPROVED) {
            throw new BadRequestException(
                `Cannot edit a pay run in '${run.status}' status. Revert to draft first.`,
            );
        }
        return (await this.repo.update({ _id: id }, data as any, { actionBy })) as PayRunEntity;
    }

    /**
     * Mark a calculated pay run as approved. Locks the line items.
     */
    async approve(id: string, actionBy?: string): Promise<PayRunEntity> {
        const run = await this.findOneById(id);
        if (run.status !== ENUM_PAY_RUN_STATUS.CALCULATED) {
            throw new BadRequestException(
                `Cannot approve a pay run in '${run.status}' status. It must be calculated first.`,
            );
        }
        return (await this.repo.update(
            { _id: id },
            {
                status: ENUM_PAY_RUN_STATUS.APPROVED,
                approved_at: new Date(),
                approved_by: actionBy,
            } as any,
            { actionBy },
        )) as PayRunEntity;
    }

    /**
     * Mark an approved pay run as paid. This is the final lifecycle state.
     */
    async markPaid(id: string, actionBy?: string): Promise<PayRunEntity> {
        const run = await this.findOneById(id);
        if (run.status !== ENUM_PAY_RUN_STATUS.APPROVED) {
            throw new BadRequestException(
                `Cannot mark a pay run as paid in '${run.status}' status. It must be approved first.`,
            );
        }
        return (await this.repo.update(
            { _id: id },
            {
                status: ENUM_PAY_RUN_STATUS.PAID,
                paid_at: new Date(),
                paid_by: actionBy,
            } as any,
            { actionBy },
        )) as PayRunEntity;
    }

    /**
     * Move an approved pay run back to draft. Used when admin needs to make changes.
     */
    async revertToDraft(id: string, actionBy?: string): Promise<PayRunEntity> {
        const run = await this.findOneById(id);
        if (run.status === ENUM_PAY_RUN_STATUS.PAID) {
            throw new BadRequestException(
                'Cannot revert a paid pay run. Create a correction run instead.',
            );
        }
        return (await this.repo.update(
            { _id: id },
            {
                status: ENUM_PAY_RUN_STATUS.DRAFT,
                approved_at: null,
                approved_by: null,
            } as any,
            { actionBy },
        )) as PayRunEntity;
    }

    async softDelete(id: string, actionBy?: string): Promise<void> {
        const run = await this.findOneById(id);
        if (run.status === ENUM_PAY_RUN_STATUS.PAID) {
            throw new BadRequestException('Cannot delete a paid pay run.');
        }
        await this.repo.update({ _id: id }, { soft_delete: true } as any, { actionBy });
    }

    /**
     * Recompute total_gross / total_net / employee_count from the run's payslips.
     * Called after calculation and after any line item edit on a payslip.
     */
    async recomputeTotals(payRunId: string): Promise<PayRunEntity> {
        const payslips = (await this.payslipRepo.findAll({
            pay_run_id: payRunId,
            soft_delete: false,
        })) as PayslipEntity[];

        const totals = payslips.reduce(
            (acc, p) => {
                acc.total_gross += Number(p.gross_pay) || 0;
                acc.total_taxable_gross += Number(p.taxable_gross) || 0;
                acc.total_deductions += Number(p.total_deductions) || 0;
                acc.total_net += Number(p.net_pay) || 0;
                return acc;
            },
            { total_gross: 0, total_taxable_gross: 0, total_deductions: 0, total_net: 0 },
        );

        return (await this.repo.update(
            { _id: payRunId },
            {
                employee_count: payslips.length,
                total_gross: Math.round(totals.total_gross * 100) / 100,
                total_taxable_gross: Math.round(totals.total_taxable_gross * 100) / 100,
                total_deductions: Math.round(totals.total_deductions * 100) / 100,
                total_net: Math.round(totals.total_net * 100) / 100,
            } as any,
        )) as PayRunEntity;
    }
}
