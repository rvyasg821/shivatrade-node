import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { CurrencyService } from '../services/currency.service';
import { CurrencyRepository } from '../repository/repositories/currency.repository';
import { CurrencyCreateRequestDto } from '../dtos/request/currency.create.request.dto';
import { CurrencyUpdateRequestDto } from '../dtos/request/currency.update.request.dto';
import { ExchangeRateCreateRequestDto } from '../dtos/request/exchange-rate.create.request.dto';
import {
    CurrencyGetResponseDto,
    ExchangeRateResponseDto,
} from '../dtos/response/currency.get.response.dto';
import { CurrencyListResponseDto } from '../dtos/response/currency.list.response.dto';

@ApiTags('admin.currency')
@Controller({ version: '1', path: '/admin/currency' })
export class CurrencyAdminController {
    constructor(
        private readonly currencyService: CurrencyService,
        private readonly currencyRepository: CurrencyRepository
    ) {}

    @Response('currency.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: CurrencyCreateRequestDto
    ): Promise<IResponse<CurrencyGetResponseDto>> {
        const currency = await this.currencyService.create(companyId, body, userId);
        return { data: this.currencyService.mapGet(currency) };
    }

    @ResponsePaging('currency.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string
    ): Promise<IResponsePaging<CurrencyListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        if (_search) {
            find.$or = [
                { code: { $regex: _search, $options: 'i' } },
                { name: { $regex: _search, $options: 'i' } },
                { symbol: { $regex: _search, $options: 'i' } },
            ];
        }

        const currencies = await this.currencyRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.currencyRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: this.currencyService.mapList(currencies),
        };
    }

    @Response('currency.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; code: string; name: string; symbol?: string; is_default?: boolean }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const currencies = await this.currencyRepository.findAll(find, {
            order: { code: 'asc' as any },
        });
        return {
            data: currencies.map((c) => ({
                _id: c._id.toString(),
                code: c.code,
                name: c.name,
                symbol: c.symbol,
                is_default: !!c.is_default,
            })),
        };
    }

    /**
     * Returns the latest exchange rate for default-currency → `to` (code).
     * If `to` matches the company's default currency code, returns rate '1'.
     */
    @Response('currency.currentRate')
    @AuthJwtAccessProtected()
    @Get('/exchange-rate/current')
    async currentExchangeRate(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('to') toCurrencyCode: string
    ): Promise<
        IResponse<{
            to_currency_code?: string;
            rate: string;
            effective_date?: string;
            same?: boolean;
        } | null>
    > {
        if (!toCurrencyCode) return { data: null };
        const toCode = toCurrencyCode.toUpperCase();
        const def = await this.currencyService.getDefaultCurrency(companyId);
        if (!def) return { data: null };
        if (def.code === toCode) {
            return {
                data: { to_currency_code: toCode, rate: '1', same: true },
            };
        }
        const row = await this.currencyService.getCurrentRate(
            companyId,
            def._id.toString(),
            toCode
        );
        if (!row) return { data: null };
        return {
            data: {
                to_currency_code: row.to_currency_code,
                rate: row.rate,
                effective_date: row.effective_date,
            },
        };
    }

    /**
     * Latest rate per to_currency_code (from default currency) + default
     * currency itself with rate '1'. Sales-doc currency pickers consume this.
     */
    @Response('currency.exchangeRateOptions')
    @AuthJwtAccessProtected()
    @Get('/exchange-rate/options')
    async exchangeRateOptions(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<
        IResponse<
            Array<{
                code: string;
                name?: string;
                symbol?: string;
                rate: string;
                effective_date?: string;
                is_default?: boolean;
            }>
        >
    > {
        const data = await this.currencyService.getExchangeRateOptions(companyId);
        return { data };
    }

    @Response('currency.get')
    @AuthJwtAccessProtected()
    @Get('/get/:currencyId')
    async get(
        @Param('currencyId') currencyId: string
    ): Promise<IResponse<CurrencyGetResponseDto>> {
        const currency = await this.currencyService.findOneById(currencyId);
        return { data: this.currencyService.mapGet(currency) };
    }

    @Response('currency.update')
    @AuthJwtAccessProtected()
    @Put('/update/:currencyId')
    async update(
        @Param('currencyId') currencyId: string,
        @Body() body: CurrencyUpdateRequestDto
    ): Promise<IResponse<CurrencyGetResponseDto>> {
        const currency = await this.currencyService.findOneById(currencyId);
        const updated = await this.currencyService.update(currency, body);
        return { data: this.currencyService.mapGet(updated) };
    }

    @Response('currency.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:currencyId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('currencyId') currencyId: string
    ): Promise<void> {
        const currency = await this.currencyService.findOneById(currencyId);
        await this.currencyService.softDelete(currency, userId);
    }

    // ─── Exchange Rates ─────────────────────────────────────────────────

    @Response('currency.rateList')
    @AuthJwtAccessProtected()
    @Get('/:currencyId/rates')
    async listRates(
        @Param('currencyId') currencyId: string
    ): Promise<IResponse<ExchangeRateResponseDto[]>> {
        // Validate ownership
        await this.currencyService.findOneById(currencyId);
        const rates = await this.currencyService.listRatesForCurrency(currencyId);
        const data = await this.currencyService.mapRates(rates);
        return { data };
    }

    @Response('currency.rateCreate')
    @AuthJwtAccessProtected()
    @Post('/:currencyId/rates')
    async addRate(
        @AuthJwtPayload('user') userId: string,
        @Param('currencyId') currencyId: string,
        @Body() body: ExchangeRateCreateRequestDto
    ): Promise<IResponse<ExchangeRateResponseDto>> {
        const currency = await this.currencyService.findOneById(currencyId);
        const rate = await this.currencyService.addRate(currency, body, userId);
        const [mapped] = await this.currencyService.mapRates([rate]);
        return { data: mapped };
    }
}
