import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PAY_SCHEDULES_TABLE } from '../../constants/payroll.entity.constant';
import { ENUM_PAY_FREQUENCY } from '../../enums/payroll.enum';

@Entity(PAY_SCHEDULES_TABLE)
export class PayScheduleEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_PAY_FREQUENCY.MONTHLY })
    frequency: string;

    // For weekly: 0=Sun, 1=Mon, ... 6=Sat. The day of the week the period starts on.
    // For monthly: ignored (period = full calendar month).
    @Column({ type: 'int', nullable: true, default: 1 })
    period_start_day: number;

    // Days after period end when employees are paid (e.g. period ends 31st, paid offset 5 → paid on 5th)
    @Column({ type: 'int', nullable: false, default: 0 })
    pay_date_offset_days: number;

    @Column({ type: 'varchar', length: 10, nullable: false, default: 'GBP' })
    currency: string;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PayScheduleDoc = PayScheduleEntity;
