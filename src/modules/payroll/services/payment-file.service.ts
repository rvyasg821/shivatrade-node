import { Injectable, BadRequestException } from '@nestjs/common';
import { PayslipRepository } from '../repository/repositories/payslip.repository';
import { PayRunRepository } from '../repository/repositories/pay-run.repository';
import { PayslipEntity } from '../repository/entities/payslip.entity';

interface BankFileResult {
    csv: string;
    filename: string;
    summary: {
        included: number;
        skipped: number;
        total_amount: number;
        warnings: string[];
    };
}

@Injectable()
export class PaymentFileService {
    constructor(
        private readonly payslipRepo: PayslipRepository,
        private readonly payRunRepo: PayRunRepository,
    ) {}

    /**
     * Export an approved (or paid) pay run as a plain CSV the company can
     * upload to their bank's bulk payment service.
     *
     * Format: Account Holder, Sort Code, Account Number, Amount, Reference
     * — accepted by every UK bank's online banking bulk-pay tool.
     */
    async generateBankCsv(payRunId: string): Promise<BankFileResult> {
        const payRun = (await this.payRunRepo.findOneById(payRunId)) as any;
        if (!payRun) throw new BadRequestException('Pay run not found');

        const slips = (await this.payslipRepo.findAll({
            pay_run_id: payRunId,
            soft_delete: false,
        })) as PayslipEntity[];

        const lines: string[] = [];
        lines.push('Account Holder,Sort Code,Account Number,Amount,Reference');

        let included = 0;
        let skipped = 0;
        let total = 0;
        const warnings: string[] = [];

        const periodLabel = payRun.period_end
            ? new Date(payRun.period_end).toISOString().slice(0, 7) // YYYY-MM
            : 'period';

        for (const s of slips) {
            const net = Number(s.net_pay) || 0;
            if (net <= 0) {
                skipped++;
                warnings.push(`${s.employee_name || s.user_id}: net pay is zero or negative`);
                continue;
            }
            if (!s.sort_code || !s.account_number) {
                skipped++;
                warnings.push(`${s.employee_name || s.user_id}: missing bank details`);
                continue;
            }
            const reference = `PAY ${periodLabel} ${s.employee_code || ''}`.trim().slice(0, 18);
            const row = [
                this.csvEscape(s.account_holder_name || s.employee_name || ''),
                this.csvEscape(s.sort_code),
                this.csvEscape(s.account_number),
                net.toFixed(2),
                this.csvEscape(reference),
            ].join(',');
            lines.push(row);
            included++;
            total += net;
        }

        const csv = lines.join('\n');
        const filename = `payroll-${periodLabel}-${payRunId.slice(0, 8)}.csv`;

        return {
            csv,
            filename,
            summary: {
                included,
                skipped,
                total_amount: Math.round(total * 100) / 100,
                warnings,
            },
        };
    }

    private csvEscape(val: string): string {
        if (val == null) return '';
        const s = String(val);
        if (/[",\n]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }
}
