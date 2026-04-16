import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PAYSLIP_LINE_ITEMS_TABLE } from '../../constants/payroll.entity.constant';
import { ENUM_LINE_ITEM_TYPE } from '../../enums/payroll.enum';

@Entity(PAYSLIP_LINE_ITEMS_TABLE)
export class PayslipLineItemEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    payslip_id: string;

    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_LINE_ITEM_TYPE.EARNING })
    type: string; // 'earning' | 'deduction'

    @Column({ type: 'varchar', length: 30, nullable: false })
    category: string; // ENUM_LINE_ITEM_CATEGORY

    @Column({ type: 'varchar', length: 200, nullable: false })
    label: string; // Display label, e.g. "Base Pay", "Christmas Bonus", "Income Tax"

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    amount: number;

    // For pre-tax deductions like pension. Only applies to deductions; ignored on earnings.
    @Column({ type: 'boolean', default: false })
    is_pre_tax: boolean;

    // For non-taxable earnings (rare — e.g. expense reimbursement). Default true (taxable).
    @Column({ type: 'boolean', default: true })
    is_taxable: boolean;

    // True for line items the calculation engine generated automatically.
    // False for items the admin added by hand. Used so we don't wipe manual
    // additions when re-running the calculator.
    @Column({ type: 'boolean', default: false })
    is_auto: boolean;

    @Column({ type: 'int', default: 0 })
    sort_order: number;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PayslipLineItemDoc = PayslipLineItemEntity;
