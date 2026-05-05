import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { QUOTATION_REBATE_COLLECTION_NAME } from '../../constants/quotation.entity.constant';

/**
 * Rebate line attached to a quotation (DBK, RoDTEP, etc.). `rebate_id`
 * links to the Rebate master when picked from there; null for ad-hoc.
 * Rebates are subtractive in the costing formula:
 *   ((subtotal + expenses) − rebates) + margin = net total.
 */
@Entity(QUOTATION_REBATE_COLLECTION_NAME)
export class QuotationRebateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    quotation_id: string;

    @Column({ type: 'uuid', nullable: true })
    rebate_id?: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    name: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    amount: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type QuotationRebateDoc = QuotationRebateEntity;
