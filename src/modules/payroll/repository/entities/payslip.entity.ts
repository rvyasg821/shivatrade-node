import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PAYSLIPS_TABLE } from '../../constants/payroll.entity.constant';

@Entity(PAYSLIPS_TABLE)
@Index(['pay_run_id', 'user_id'], { unique: true, where: '"soft_delete" = false' })
@Index(['company_id', 'user_id'])
export class PayslipEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    pay_run_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    user_id: string;

    // Snapshots taken at calculation time so historic payslips don't change
    // when employee data is later edited.
    @Column({ type: 'varchar', length: 200, nullable: true })
    employee_name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    employee_code: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    pay_type: string; // 'hourly' | 'salaried' at the time of calculation

    // Hours worked / overtime — pulled from attendance during calculation
    @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
    hours_worked: number;

    @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
    overtime_hours: number;

    @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
    unpaid_leave_days: number;

    // Money — line item totals are stored here for fast list rendering;
    // the breakdown lives in payslip_line_items.
    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    base_pay: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    overtime_pay: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    bonuses_total: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    allowances_total: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    other_earnings_total: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    gross_pay: number; // Sum of all earnings (before any deductions)

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    pension_employee: number; // Pre-tax pension deduction

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    pension_employer: number; // Informational only

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    taxable_gross: number; // gross_pay - pre-tax deductions (Path B stops auto-calc here)

    // Manually entered by admin (or imported from accountant)
    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    tax: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    ni: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    student_loan: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    other_deductions: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    total_deductions: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    net_pay: number;

    // Year-to-date snapshots — sum of this payslip + all previous payslips in the same tax year
    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_gross: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_taxable_gross: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_tax: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_ni: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_pension_employee: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ytd_net: number;

    @Column({ type: 'varchar', length: 10, nullable: false, default: 'GBP' })
    currency: string;

    // Bank details snapshot at the time of calculation
    @Column({ type: 'varchar', length: 100, nullable: true })
    account_holder_name: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    sort_code: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    account_number: string;

    // Tax / NI metadata
    @Column({ type: 'varchar', length: 20, nullable: true })
    tax_code: string;

    @Column({ type: 'varchar', length: 5, nullable: true })
    ni_category: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PayslipDoc = PayslipEntity;
