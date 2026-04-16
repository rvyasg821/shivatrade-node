import { Injectable, NotFoundException } from '@nestjs/common';
import { PayScheduleRepository } from '../repository/repositories/pay-schedule.repository';
import { PayScheduleEntity } from '../repository/entities/pay-schedule.entity';

@Injectable()
export class PayScheduleService {
    constructor(private readonly repo: PayScheduleRepository) {}

    async list(companyId: string): Promise<PayScheduleEntity[]> {
        return (await this.repo.findAll(
            { company_id: companyId, soft_delete: false },
            { order: { is_default: 'DESC' as any, name: 'ASC' as any } },
        )) as PayScheduleEntity[];
    }

    async findOneById(id: string): Promise<PayScheduleEntity> {
        const item = (await this.repo.findOneById(id)) as PayScheduleEntity;
        if (!item) throw new NotFoundException('Pay schedule not found');
        return item;
    }

    async create(companyId: string, data: Partial<PayScheduleEntity>, actionBy?: string): Promise<PayScheduleEntity> {
        // If this one is marked default, clear other defaults
        if (data.is_default) {
            await this.clearOtherDefaults(companyId);
        }
        return this.repo.create({ ...data, company_id: companyId, soft_delete: false } as any, { actionBy });
    }

    async update(id: string, data: Partial<PayScheduleEntity>, actionBy?: string): Promise<PayScheduleEntity> {
        const item = await this.findOneById(id);
        if (data.is_default && !item.is_default) {
            await this.clearOtherDefaults(item.company_id);
        }
        return (await this.repo.update({ _id: id }, data as any, { actionBy })) as PayScheduleEntity;
    }

    async softDelete(id: string, actionBy?: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.repo.update({ _id: item._id }, { soft_delete: true } as any, { actionBy });
    }

    private async clearOtherDefaults(companyId: string): Promise<void> {
        const items = (await this.repo.findAll({
            company_id: companyId,
            is_default: true,
            soft_delete: false,
        })) as PayScheduleEntity[];
        for (const it of items) {
            await this.repo.update({ _id: it._id }, { is_default: false } as any);
        }
    }

    /**
     * Returns the next default pay period dates given a schedule and a reference date.
     * Used by the "Create Pay Run" UI to pre-fill period_start / period_end / pay_date.
     */
    computeNextPeriod(schedule: PayScheduleEntity, ref: Date = new Date()): {
        period_start: Date;
        period_end: Date;
        pay_date: Date;
    } {
        const refDate = new Date(ref);
        let periodStart: Date;
        let periodEnd: Date;

        switch (schedule.frequency) {
            case 'weekly': {
                // Period = the most recently completed week starting on schedule.period_start_day
                const startDay = schedule.period_start_day ?? 1;
                const day = refDate.getDay();
                const diff = (day - startDay + 7) % 7;
                periodEnd = new Date(refDate);
                periodEnd.setDate(refDate.getDate() - diff - 1);
                periodStart = new Date(periodEnd);
                periodStart.setDate(periodEnd.getDate() - 6);
                break;
            }
            case 'biweekly': {
                const startDay = schedule.period_start_day ?? 1;
                const day = refDate.getDay();
                const diff = (day - startDay + 7) % 7;
                periodEnd = new Date(refDate);
                periodEnd.setDate(refDate.getDate() - diff - 1);
                periodStart = new Date(periodEnd);
                periodStart.setDate(periodEnd.getDate() - 13);
                break;
            }
            case 'semi_monthly': {
                // 1st-15th and 16th-end-of-month
                const day = refDate.getDate();
                if (day <= 15) {
                    // Pay run for previous month's 16th-end
                    const prev = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 16);
                    periodStart = prev;
                    periodEnd = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
                } else {
                    periodStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
                    periodEnd = new Date(refDate.getFullYear(), refDate.getMonth(), 15);
                }
                break;
            }
            case 'monthly':
            default: {
                // Previous calendar month
                periodStart = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
                periodEnd = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
                break;
            }
        }

        const payDate = new Date(periodEnd);
        payDate.setDate(periodEnd.getDate() + (schedule.pay_date_offset_days ?? 0));

        return { period_start: periodStart, period_end: periodEnd, pay_date: payDate };
    }
}
