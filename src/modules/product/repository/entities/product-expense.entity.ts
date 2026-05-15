import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { PRODUCT_EXPENSE_COLLECTION_NAME } from '../../constants/product.entity.constant';

@Entity(PRODUCT_EXPENSE_COLLECTION_NAME)
@Unique('uq_product_expense', ['product_id', 'expense_id'])
export class ProductExpenseEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    expense_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    /** Per-product override; null = use Expense master's type. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    type?: string;

    /** Per-product override; null = use Expense master's value. */
    @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
    value?: string;
}

export type ProductExpenseDoc = ProductExpenseEntity;
