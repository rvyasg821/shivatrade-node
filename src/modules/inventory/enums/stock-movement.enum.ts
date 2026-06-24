/**
 * Stock ledger movement types. On-hand = SUM(qty) over active rows, where qty
 * is signed (+ for IN, − for OUT). Reversals are NEW opposite-sign rows posted
 * on cancel — the original row is kept for audit.
 */
export enum ENUM_STOCK_MOVEMENT_TYPE {
    GRN_IN = 'grn_in', // + GRN confirmed (accepted qty per line)
    GRN_REVERSAL = 'grn_reversal', // − GRN cancelled / deleted / accepted-qty reduced
    SALE_OUT = 'sale_out', // − Invoice issued (qty per line)
    SALE_REVERSAL = 'sale_reversal', // + Issued invoice cancelled
    ADJUSTMENT = 'adjustment', // ± Manual correction (enum reserved; no UI yet)
}

export enum ENUM_STOCK_MOVEMENT_SOURCE {
    GRN = 'grn',
    INVOICE = 'invoice',
    MANUAL = 'manual',
}

// The original (non-reversal) movement types — used when reversing a source doc.
export const ORIGINAL_MOVEMENT_TYPES: ENUM_STOCK_MOVEMENT_TYPE[] = [
    ENUM_STOCK_MOVEMENT_TYPE.GRN_IN,
    ENUM_STOCK_MOVEMENT_TYPE.SALE_OUT,
];
