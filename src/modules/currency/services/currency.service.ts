import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CurrencyRepository } from '../repository/repositories/currency.repository';
import { CurrencyExchangeRateRepository } from '../repository/repositories/currency-exchange-rate.repository';
import { CurrencyDoc } from '../repository/entities/currency.entity';
import { CurrencyExchangeRateDoc } from '../repository/entities/currency-exchange-rate.entity';
import { CurrencyCreateRequestDto } from '../dtos/request/currency.create.request.dto';
import { CurrencyUpdateRequestDto } from '../dtos/request/currency.update.request.dto';
import { ExchangeRateCreateRequestDto } from '../dtos/request/exchange-rate.create.request.dto';
import {
    CurrencyGetResponseDto,
    ExchangeRateResponseDto,
} from '../dtos/response/currency.get.response.dto';
import { CurrencyListResponseDto } from '../dtos/response/currency.list.response.dto';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class CurrencyService {
    private readonly logger = new Logger(CurrencyService.name);

    constructor(
        private readonly currencyRepository: CurrencyRepository,
        private readonly rateRepository: CurrencyExchangeRateRepository
    ) {}

    async create(
        companyId: string,
        data: CurrencyCreateRequestDto,
        createdBy: string
    ): Promise<CurrencyDoc> {
        const code = data.code.trim().toUpperCase();
        const name = data.name.trim();

        const exists = await this.currencyRepository.isCodeExists(companyId, code);
        if (exists) {
            throw new BadRequestException(
                `Currency code '${code}' already exists for this company`
            );
        }

        const currency = await this.currencyRepository.create({
            ...data,
            code,
            name,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        if (data.is_default) {
            await this.unsetOtherDefaults(companyId, currency._id.toString());
        }

        this.logger.log(`Currency created: ${currency._id} (${code}) for company: ${companyId}`);
        return currency;
    }

    async findOneById(
        currencyId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CurrencyDoc> {
        const currency = await this.currencyRepository.findOneById(currencyId, options);
        if (!currency) {
            throw new NotFoundException('Currency not found');
        }
        return currency;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CurrencyDoc[]> {
        return this.currencyRepository.findByCompanyId(companyId, options);
    }

    async update(
        currency: CurrencyDoc,
        data: CurrencyUpdateRequestDto
    ): Promise<CurrencyDoc> {
        const companyId = currency.company_id.toString();

        if (data.code && data.code.trim().toUpperCase() !== currency.code) {
            const code = data.code.trim().toUpperCase();
            const exists = await this.currencyRepository.isCodeExists(
                companyId,
                code,
                currency._id.toString()
            );
            if (exists) {
                throw new BadRequestException(
                    `Currency code '${code}' already exists for this company`
                );
            }
            data.code = code;
        }

        if (data.name) data.name = data.name.trim();

        Object.assign(currency, data);
        const updated = await this.currencyRepository.save(currency);

        if (data.is_default) {
            await this.unsetOtherDefaults(companyId, currency._id.toString());
        }

        this.logger.log(`Currency updated: ${currency._id}`);
        return updated;
    }

    /**
     * Ensures only one currency per company is marked is_default=true.
     * Single UPDATE query - flips all sibling rows off in one round-trip.
     */
    private async unsetOtherDefaults(
        companyId: string,
        keepId: string
    ): Promise<void> {
        await this.currencyRepository.updateMany(
            {
                company_id: companyId,
                is_default: true,
                _id: { $ne: keepId },
            } as any,
            { is_default: false } as any
        );
    }

    async softDelete(
        currency: CurrencyDoc,
        deletedBy?: string
    ): Promise<CurrencyDoc> {
        currency.soft_delete = true;
        currency.is_active = false;
        (currency as any).deleted = true;
        (currency as any).deletedAt = new Date();
        if (deletedBy) (currency as any).deletedBy = deletedBy;
        const updated = await this.currencyRepository.save(currency);

        // Hard-delete rate history rows for this currency.
        await this.rateRepository.deleteByCurrencyId(currency._id.toString());

        this.logger.log(`Currency soft deleted: ${currency._id}`);
        return updated;
    }

    // ─── Exchange Rates ─────────────────────────────────────────────────

    async addRate(
        fromCurrency: CurrencyDoc,
        data: ExchangeRateCreateRequestDto,
        createdBy: string
    ): Promise<CurrencyExchangeRateDoc> {
        const toCode = data.to_currency_code.trim().toUpperCase();
        if (toCode === fromCurrency.code) {
            throw new BadRequestException(
                'From and To currencies must be different'
            );
        }

        const rate = await this.rateRepository.create({
            company_id: fromCurrency.company_id.toString(),
            from_currency_id: fromCurrency._id.toString(),
            to_currency_code: toCode,
            rate: data.rate,
            effective_date: data.effective_date,
            created_by: createdBy,
        } as any);

        return rate;
    }

    async listRatesForCurrency(
        currencyId: string
    ): Promise<CurrencyExchangeRateDoc[]> {
        return this.rateRepository.findByFromCurrencyId(currencyId);
    }

    async findRateById(rateId: string): Promise<CurrencyExchangeRateDoc | null> {
        return this.rateRepository.findOneById(rateId);
    }

    async updateRate(
        rate: CurrencyExchangeRateDoc,
        data: { rate?: string | number; effective_date?: string; to_currency_code?: string }
    ): Promise<CurrencyExchangeRateDoc> {
        const update: any = {};
        if (data.rate !== undefined) update.rate = data.rate;
        if (data.effective_date !== undefined)
            update.effective_date = data.effective_date;
        if (data.to_currency_code !== undefined) {
            update.to_currency_code = data.to_currency_code
                .trim()
                .toUpperCase();
        }
        if (Object.keys(update).length === 0) return rate;
        return this.rateRepository.update(
            { _id: rate._id.toString() } as any,
            update
        );
    }

    async deleteRate(rate: CurrencyExchangeRateDoc): Promise<void> {
        await this.rateRepository.delete({ _id: rate._id.toString() } as any);
    }

    async getCurrentRate(
        companyId: string,
        fromCurrencyId: string,
        toCurrencyCode: string
    ): Promise<CurrencyExchangeRateDoc | null> {
        return this.rateRepository.findCurrentRate(
            companyId,
            fromCurrencyId,
            toCurrencyCode.toUpperCase()
        );
    }

    /**
     * Returns the company's default currency row (the one flagged is_default).
     * Used as the implicit FROM side of every exchange-rate row + as the
     * fallback option (rate=1) for sales-doc currency pickers.
     */
    async getDefaultCurrency(companyId: string): Promise<CurrencyDoc | null> {
        const rows = await this.currencyRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            is_default: true,
        } as any);
        return rows[0] || null;
    }

    /**
     * Latest rate per to_currency_code from default-currency for this company,
     * augmented with the default currency itself (rate='1').
     * Powers the Lead/Quotation/PFI/PO currency picker.
     */
    async getExchangeRateOptions(companyId: string): Promise<
        Array<{
            code: string;
            name?: string;
            symbol?: string;
            rate: string;
            effective_date?: string;
            is_default?: boolean;
        }>
    > {
        const def = await this.getDefaultCurrency(companyId);
        if (!def) return [];

        const rates = await this.rateRepository.findLatestRatePerCode(
            companyId,
            def._id.toString()
        );

        // Export-deal picker: only foreign target currencies (USD/EUR/GBP/AED…),
        // never the home currency itself. An Indian export quotation is never
        // priced in INR.
        return rates.map((r) => ({
            code: r.to_currency_code,
            rate: r.rate,
            effective_date: r.effective_date,
        }));
    }

    // ─── Mappers ────────────────────────────────────────────────────────

    mapGet(currency: CurrencyDoc): CurrencyGetResponseDto {
        return plainToInstance(CurrencyGetResponseDto, currency);
    }

    mapList(currencies: CurrencyDoc[]): CurrencyListResponseDto[] {
        return currencies.map((c) => plainToInstance(CurrencyListResponseDto, c));
    }

    async mapRates(
        rates: CurrencyExchangeRateDoc[]
    ): Promise<ExchangeRateResponseDto[]> {
        const fromIds = Array.from(
            new Set(rates.map((r) => r.from_currency_id.toString()))
        );
        const codeByFromId: Record<string, string> = {};
        if (fromIds.length) {
            const currencies = await this.currencyRepository.findAll({
                _id: { $in: fromIds },
                soft_delete: false,
            } as any);
            for (const c of currencies) codeByFromId[c._id.toString()] = c.code;
        }

        return rates.map((r) => {
            const dto = plainToInstance(ExchangeRateResponseDto, r);
            dto.from_currency_code = codeByFromId[r.from_currency_id.toString()];
            dto.to_currency_code = r.to_currency_code;
            return dto;
        });
    }
}
