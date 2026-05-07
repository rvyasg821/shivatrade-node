import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_EXPENSE_BASE,
    ENUM_EXPENSE_STATUS,
    ENUM_EXPENSE_TYPE,
} from '@modules/expense/enums/expense.enum';
import { EXPENSE_COLLECTION_NAME } from '../../constants/expense.entity.constant';

@Entity(EXPENSE_COLLECTION_NAME)
export class ExpenseEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'varchar', length: 150, nullable: false })
    name: string;

    @Index()
    @Column({ type: 'varchar', length: 30, nullable: false })
    code: string;

    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_EXPENSE_TYPE.PERCENT,
    })
    type: ENUM_EXPENSE_TYPE;

    @Column({ type: 'numeric', precision: 14, scale: 4, nullable: false })
    value: string;

    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_EXPENSE_BASE.VALUE,
    })
    base: ENUM_EXPENSE_BASE;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_EXPENSE_STATUS.ACTIVE,
    })
    status: ENUM_EXPENSE_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type ExpenseDoc = ExpenseEntity;
