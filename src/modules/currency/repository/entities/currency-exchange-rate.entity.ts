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
     * 12 decimal places — wide enough that reversing a small rate (e.g.
     * 1 INR = 0.010515… USD) round-trips back to the big side (95.09) without
     * the precision loss a shorter scale would cause.
     */
    @Column({ type: 'numeric', precision: 24, scale: 12, nullable: false })
    rate: string;

    @Index()
    @Column({ type: 'date', nullable: false })
    effective_date: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;
}

export type CurrencyExchangeRateDoc = CurrencyExchangeRateEntity;
