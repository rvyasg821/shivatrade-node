export enum ENUM_VENDOR_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

export enum ENUM_VENDOR_ADDRESS_TYPE {
    BILL_FROM = 'bill_from',
    SHIP_FROM = 'ship_from',
    OTHER = 'other',
}

export enum ENUM_VENDOR_BANK_ACCOUNT_TYPE {
    CURRENT = 'current',
    SAVINGS = 'savings',
    OTHER = 'other',
}

/**
 * Common payment terms used in international trade.
 * Stored as varchar; the FE uses these as a hardcoded dropdown.
 */
export enum ENUM_VENDOR_PAYMENT_TERMS {
    ADVANCE = 'Advance',
    NET_30 = 'Net 30',
    NET_45 = 'Net 45',
    NET_60 = 'Net 60',
    NET_90 = 'Net 90',
    LC = 'LC', // Letter of Credit
    TT = 'TT', // Telegraphic Transfer
    CAD = 'CAD', // Cash Against Documents
    DA = 'DA', // Documents Against Acceptance
    DP = 'DP', // Documents Against Payment
}

/**
 * Incoterms 2020 (subset commonly used).
 */
export enum ENUM_VENDOR_INCOTERMS {
    EXW = 'EXW',
    FCA = 'FCA',
    FAS = 'FAS',
    FOB = 'FOB',
    CFR = 'CFR',
    CIF = 'CIF',
    CPT = 'CPT',
    CIP = 'CIP',
    DAP = 'DAP',
    DPU = 'DPU',
    DDP = 'DDP',
}
