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

        this.logger.log(`Currency updated: ${currency._id}`);
        return updated;
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
        if (data.to_currency_id === fromCurrency._id.toString()) {
            throw new BadRequestException(
                'From and To currencies must be different'
            );
        }

        // Ensure target currency exists in the same company.
        const target = await this.currencyRepository.findOne({
            _id: data.to_currency_id,
            company_id: fromCurrency.company_id.toString(),
            soft_delete: false,
        });
        if (!target) {
            throw new BadRequestException('Target currency not found');
        }

        const rate = await this.rateRepository.create({
            company_id: fromCurrency.company_id.toString(),
            from_currency_id: fromCurrency._id.toString(),
            to_currency_id: data.to_currency_id,
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

    async getCurrentRate(
        companyId: string,
        fromCurrencyId: string,
        toCurrencyId: string
    ): Promise<CurrencyExchangeRateDoc | null> {
        if (fromCurrencyId === toCurrencyId) return null;
        return this.rateRepository.findCurrentRate(
            companyId,
            fromCurrencyId,
            toCurrencyId
        );
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
        const ids = Array.from(
            new Set(
                rates.flatMap((r) => [
                    r.from_currency_id.toString(),
                    r.to_currency_id.toString(),
                ])
            )
        );
        const lookup: Record<string, string> = {};
        if (ids.length) {
            const currencies = await this.currencyRepository.findAll({
                _id: { $in: ids },
                soft_delete: false,
            } as any);
            for (const c of currencies) lookup[c._id.toString()] = c.code;
        }

        return rates.map((r) => {
            const dto = plainToInstance(ExchangeRateResponseDto, r);
            dto.from_currency_code = lookup[r.from_currency_id.toString()];
            dto.to_currency_code = lookup[r.to_currency_id.toString()];
            return dto;
        });
    }
}
