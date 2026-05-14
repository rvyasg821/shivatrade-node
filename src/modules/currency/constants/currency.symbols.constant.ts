/**
 * Single source of truth for ISO currency-code → display symbol.
 * Used wherever a non-INR sales doc needs to render its grand total / unit
 * price next to a symbol. Extend or trim freely - every consumer reads from
 * here.
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'د.إ',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    SGD: 'S$',
    CHF: 'CHF',
    HKD: 'HK$',
    SAR: '﷼',
    KWD: 'د.ك',
    QAR: '﷼',
};

/** Returns the symbol for `code`, falling back to the code itself if unknown. */
export const getCurrencySymbol = (code?: string | null): string => {
    if (!code) return '';
    return CURRENCY_SYMBOLS[code] || code;
};
