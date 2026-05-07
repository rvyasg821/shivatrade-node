import { Injectable } from '@nestjs/common';
import { Repository, LessThanOrEqual } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CurrencyExchangeRateDoc,
    CurrencyExchangeRateEntity,
} from '../entities/currency-exchange-rate.entity';

@Injectable()
export class CurrencyExchangeRateRepository extends DatabaseObjectIdRepositoryBase<CurrencyExchangeRateEntity> {
    constructor(
        @InjectDatabaseModel(CurrencyExchangeRateEntity)
        private readonly rateRepository: Repository<CurrencyExchangeRateEntity>
    ) {
        super(rateRepository);
    }

    /**
     * All rates where this currency is the FROM side (history of how this
     * currency converts into others). Ordered newest-effective first.
     */
    async findByFromCurrencyId(
        fromCurrencyId: string
    ): Promise<CurrencyExchangeRateDoc[]> {
        return this._repository.find({
            where: { from_currency_id: fromCurrencyId } as any,
            order: { effective_date: 'DESC', createdAt: 'DESC' },
        });
    }

    /**
     * Most-recent effective rate for the given from→to pair as of `asOfDate`
     * (defaults to today). Future-dated rates are ignored — they only become
     * "current" once their `effective_date` has arrived.
     */
    async findCurrentRate(
        companyId: string,
        fromCurrencyId: string,
        toCurrencyId: string,
        asOfDate?: string
    ): Promise<CurrencyExchangeRateDoc | null> {
        const today =
            asOfDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const row = await this._repository.findOne({
            where: {
                company_id: companyId,
                from_currency_id: fromCurrencyId,
                to_currency_id: toCurrencyId,
                effective_date: LessThanOrEqual(today),
            } as any,
            order: { effective_date: 'DESC', createdAt: 'DESC' },
        });
        return row || null;
    }

    async deleteByCurrencyId(currencyId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('from_currency_id = :id OR to_currency_id = :id', { id: currencyId })
            .execute();
    }
}
