import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { ConfigService } from '@nestjs/config';

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€',
    INR: '₹',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    NZD: 'NZ$',
    SGD: 'S$',
    HKD: 'HK$',
    KRW: '₩',
    MXN: 'MX$',
    BRL: 'R$',
    ZAR: 'R',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    PLN: 'zł',
    THB: '฿',
    MYR: 'RM',
    PHP: '₱',
    IDR: 'Rp',
    AED: 'د.إ',
    SAR: '﷼',
};

export interface CurrencyConfigResponseDto {
    code: string;
    symbol: string;
    name: string;
}

@ApiTags('modules.public.setting')
@Controller({
    version: '1',
    path: '/setting',
})
export class SettingPublicController {
    constructor(private readonly configService: ConfigService) {}

    @Response('setting.currency')
    @Get('/currency')
    async getCurrencyConfig(): Promise<IResponse<CurrencyConfigResponseDto>> {
        const currencyCode = this.configService.get<string>('stripe.currency') || 'USD';
        const currencySymbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;

        return {
            data: {
                code: currencyCode.toUpperCase(),
                symbol: currencySymbol,
                name: this.getCurrencyName(currencyCode.toUpperCase()),
            },
        };
    }

    private getCurrencyName(code: string): string {
        const currencyNames: Record<string, string> = {
            USD: 'US Dollar',
            GBP: 'British Pound',
            EUR: 'Euro',
            INR: 'Indian Rupee',
            JPY: 'Japanese Yen',
            CNY: 'Chinese Yuan',
            AUD: 'Australian Dollar',
            CAD: 'Canadian Dollar',
            CHF: 'Swiss Franc',
            NZD: 'New Zealand Dollar',
            SGD: 'Singapore Dollar',
            HKD: 'Hong Kong Dollar',
            KRW: 'South Korean Won',
            MXN: 'Mexican Peso',
            BRL: 'Brazilian Real',
            ZAR: 'South African Rand',
            SEK: 'Swedish Krona',
            NOK: 'Norwegian Krone',
            DKK: 'Danish Krone',
            PLN: 'Polish Zloty',
            THB: 'Thai Baht',
            MYR: 'Malaysian Ringgit',
            PHP: 'Philippine Peso',
            IDR: 'Indonesian Rupiah',
            AED: 'UAE Dirham',
            SAR: 'Saudi Riyal',
        };

        return currencyNames[code] || code;
    }
}
