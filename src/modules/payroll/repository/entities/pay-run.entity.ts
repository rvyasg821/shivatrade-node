import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PAY_RUNS_TABLE } from '../../constants/payroll.entity.constant';
import { ENUM_PAY_RUN_STATUS } from '../../enums/payroll.enum';

@Entity(PAY_RUNS_TABLE)
@Index(['company_id', 'period_start', 'period_end'])
export class PayRunEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id: string; // null = company-wide

    @Index()
    @Column({ type: 'uuid', nullable: false })
    schedule_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string; // e.g. "January 2026 Monthly"

    @Column({ type: 'date', nullable: false })
    period_start: Date;

    @Column({ type: 'date', nullable: false })
    period_end: Date;

    @Column({ type: 'date', nullable: false })
    pay_date: Date;

    @Index()
    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_PAY_RUN_STATUS.DRAFT })
    status: string;

    @Column({ type: 'varchar', length: 10, nullable: false, default: 'GBP' })
    currency: string;

    // Aggregate totals — recomputed every time the run is calculated
    @Column({ type: 'int', default: 0 })
    employee_count: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    total_gross: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    total_taxable_gross: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    total_deductions: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    total_net: number;

    // Lifecycle audit
    @Column({ type: 'timestamptz', nullable: true })
    calculated_at: Date;

    @Column({ type: 'uuid', nullable: true })
    calculated_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    approved_at: Date;

    @Column({ type: 'uuid', nullable: true })
    approved_by: string;

    @Column({ type: 'timestamptz', nullable: true })
    paid_at: Date;

    @Column({ type: 'uuid', nullable: true })
    paid_by: string;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PayRunDoc = PayRunEntity;
