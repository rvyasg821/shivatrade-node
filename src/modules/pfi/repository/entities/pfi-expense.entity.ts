import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PFI_EXPENSE_COLLECTION_NAME } from '../../constants/pfi.entity.constant';

@Entity(PFI_EXPENSE_COLLECTION_NAME)
export class PfiExpenseEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    pfi_id: string;

    @Column({ type: 'uuid', nullable: true })
    expense_id?: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    amount: string;

    @Column({ type: 'boolean', nullable: false, default: false })
    is_overridden: boolean;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type PfiExpenseDoc = PfiExpenseEntity;
