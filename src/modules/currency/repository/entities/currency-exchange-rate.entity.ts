import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { CURRENCY_EXCHANGE_RATE_COLLECTION_NAME } from '../../constants/currency.entity.constant';

@Entity(CURRENCY_EXCHANGE_RATE_COLLECTION_NAME)
export class CurrencyExchangeRateEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    from_currency_id: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    to_currency_code: string;

    /**
     * 1 unit of `from_currency` equals `rate` units of `to_currency`.
     * Stored as numeric to preserve precision.
     */
    @Column({ type: 'numeric', precision: 18, scale: 8, nullable: false })
    rate: string;

    @Index()
    @Column({ type: 'date', nullable: false })
    effective_date: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;
}

export type CurrencyExchangeRateDoc = CurrencyExchangeRateEntity;
