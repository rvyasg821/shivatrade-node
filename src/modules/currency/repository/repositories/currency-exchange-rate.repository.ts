import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
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
     * Most-recent rate for the given from→to pair (or null).
     */
    async findCurrentRate(
        companyId: string,
        fromCurrencyId: string,
        toCurrencyId: string
    ): Promise<CurrencyExchangeRateDoc | null> {
        const row = await this._repository.findOne({
            where: {
                company_id: companyId,
                from_currency_id: fromCurrencyId,
                to_currency_id: toCurrencyId,
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
