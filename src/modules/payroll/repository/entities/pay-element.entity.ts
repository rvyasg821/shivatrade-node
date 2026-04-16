import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PAY_ELEMENTS_TABLE } from '../../constants/payroll.entity.constant';
import { ENUM_LINE_ITEM_TYPE, ENUM_PAY_ELEMENT_CALCULATION } from '../../enums/payroll.enum';

@Entity(PAY_ELEMENTS_TABLE)
export class PayElementEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_LINE_ITEM_TYPE.EARNING })
    type: string;

    @Column({ type: 'varchar', length: 30, nullable: false })
    category: string;

    @Column({ type: 'varchar', length: 20, nullable: false, default: ENUM_PAY_ELEMENT_CALCULATION.FIXED })
    calculation_method: string;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    default_amount: number;

    @Column({ type: 'boolean', default: true })
    is_taxable: boolean;

    @Column({ type: 'boolean', default: false })
    is_pre_tax: boolean;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PayElementDoc = PayElementEntity;
