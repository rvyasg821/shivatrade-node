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
     * Most-recent effective rate for the given from→toCode pair as of `asOfDate`
     * (defaults to today). Future-dated rates are ignored.
     */
    async findCurrentRate(
        companyId: string,
        fromCurrencyId: string,
        toCurrencyCode: string,
        asOfDate?: string
    ): Promise<CurrencyExchangeRateDoc | null> {
        const today =
            asOfDate || new Date().toISOString().slice(0, 10);
        const row = await this._repository.findOne({
            where: {
                company_id: companyId,
                from_currency_id: fromCurrencyId,
                to_currency_code: toCurrencyCode,
                effective_date: LessThanOrEqual(today),
            } as any,
            order: { effective_date: 'DESC', createdAt: 'DESC' },
        });
        return row || null;
    }

    /**
     * Latest rate per distinct to_currency_code for the given from currency
     * (rate options surfaced to Lead / Quotation / PFI / PO pickers).
     */
    async findLatestRatePerCode(
        companyId: string,
        fromCurrencyId: string,
        asOfDate?: string
    ): Promise<CurrencyExchangeRateDoc[]> {
        const today = asOfDate || new Date().toISOString().slice(0, 10);
        const rows = await this._repository
            .createQueryBuilder('r')
            .where('r.company_id = :companyId', { companyId })
            .andWhere('r.from_currency_id = :fromCurrencyId', { fromCurrencyId })
            .andWhere('r.effective_date <= :today', { today })
            .orderBy('r.effective_date', 'DESC')
            .addOrderBy('r."createdAt"', 'DESC')
            .getMany();

        const seen = new Set<string>();
        const out: CurrencyExchangeRateDoc[] = [];
        for (const r of rows) {
            if (seen.has(r.to_currency_code)) continue;
            seen.add(r.to_currency_code);
            out.push(r);
        }
        return out;
    }

    async deleteByCurrencyId(currencyId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('from_currency_id = :id', { id: currencyId })
            .execute();
    }
}
