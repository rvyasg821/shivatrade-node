/**
 * Number → words for invoice / PO footers.
 *
 * Uses the Indian numbering system (lakhs / crores) for INR; falls back to
 * Western numbering for other currencies.
 *
 * Examples (INR):
 *   123456.78 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six
 *               Rupees and Seventy Eight Paise Only"
 *   1000      → "One Thousand Rupees Only"
 *
 * Examples (USD):
 *   1500.50   → "One Thousand Five Hundred Dollars and Fifty Cents Only"
 */

const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigitsToWords(n: number): string {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

function threeDigitsToWords(n: number): string {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const parts: string[] = [];
    if (h > 0) parts.push(`${ONES[h]} Hundred`);
    if (rest > 0) parts.push(twoDigitsToWords(rest));
    return parts.join(' ');
}

/** Indian numbering: …, thousand, lakh (1e5), crore (1e7). */
function integerToIndianWords(num: number): string {
    if (num === 0) return 'Zero';
    const parts: string[] = [];

    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    if (crore > 0) parts.push(`${integerToIndianWords(crore)} Crore`);

    const lakh = Math.floor(num / 100000);
    num %= 100000;
    if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} Lakh`);

    const thousand = Math.floor(num / 1000);
    num %= 1000;
    if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} Thousand`);

    if (num > 0) parts.push(threeDigitsToWords(num));

    return parts.join(' ');
}

/** Western numbering: thousand, million, billion. */
function integerToWesternWords(num: number): string {
    if (num === 0) return 'Zero';
    const groups = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
    const parts: string[] = [];
    let i = 0;
    while (num > 0) {
        const chunk = num % 1000;
        if (chunk > 0) {
            const chunkWords = threeDigitsToWords(chunk);
            parts.unshift(groups[i] ? `${chunkWords} ${groups[i]}` : chunkWords);
        }
        num = Math.floor(num / 1000);
        i++;
    }
    return parts.join(' ');
}

interface CurrencyVocab {
    main: string;       // e.g. 'Rupees'
    fraction: string;   // e.g. 'Paise'
    indian: boolean;
}

const CURRENCY_VOCAB: Record<string, CurrencyVocab> = {
    INR: { main: 'Rupees', fraction: 'Paise', indian: true },
    USD: { main: 'Dollars', fraction: 'Cents', indian: false },
    EUR: { main: 'Euros', fraction: 'Cents', indian: false },
    GBP: { main: 'Pounds', fraction: 'Pence', indian: false },
    AED: { main: 'Dirhams', fraction: 'Fils', indian: false },
};

export function numberToIndianWords(amount: number, currencyCode = 'INR'): string {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return '';

    const code = (currencyCode || 'INR').toUpperCase();
    const vocab = CURRENCY_VOCAB[code] || {
        main: code,
        fraction: 'Cents',
        indian: false,
    };

    const isNegative = amount < 0;
    const abs = Math.abs(Number(amount));
    const integerPart = Math.floor(abs);
    const fractionPart = Math.round((abs - integerPart) * 100);

    const intWords = vocab.indian
        ? integerToIndianWords(integerPart)
        : integerToWesternWords(integerPart);

    const parts: string[] = [];
    if (isNegative) parts.push('Minus');
    parts.push(intWords, vocab.main);
    if (fractionPart > 0) {
        parts.push('and', twoDigitsToWords(fractionPart), vocab.fraction);
    }
    parts.push('Only');

    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
