import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_CURRENCY_STATUS } from '@modules/currency/enums/currency.enum';
import { CURRENCY_COLLECTION_NAME } from '../../constants/currency.entity.constant';

@Entity(CURRENCY_COLLECTION_NAME)
export class CurrencyEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** ISO 4217 code, e.g. INR, USD, EUR, AED. Stored uppercase. */
    @Index()
    @Column({ type: 'varchar', length: 3, nullable: false })
    code: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    symbol?: string;

    @Index()
    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: false, default: ENUM_CURRENCY_STATUS.ACTIVE })
    status: ENUM_CURRENCY_STATUS;

    /** Marks the company's home/base currency. Used as the `from` side of
     *  exchange rate lookups on Quotation/PFI/PO forms. Exactly one row per
     *  company should be `true` (not enforced at DB level - service layer). */
    @Index()
    @Column({ type: 'boolean', default: false })
    is_default: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type CurrencyDoc = CurrencyEntity;
