/**
 * Document types that draw from the central voucher_sequences table.
 * Add new entries here when introducing modules that need auto-numbered
 * vouchers (Invoice, GRN, POV, etc.).
 */
export enum ENUM_VOUCHER_DOC_TYPE {
    LEAD = 'LEAD',
    RFQ = 'RFQ',
    QUOTATION = 'QUOTATION',
    PFI = 'PFI',
    PURCHASE_ORDER = 'PURCHASE_ORDER',
    PO_VENDOR = 'PO_VENDOR',
    INVOICE_EXPORT = 'INVOICE_EXPORT',
    SHIPPING = 'SHIPPING',
}

/**
 *  glued     → COMPANY/TOKEN0001/FY     (e.g. STIPL/PI0001/2026-27)
 *  separated → COMPANY/TOKEN/0001/FY    (e.g. STIPL/OS/0001/2026-27)
 *  compact   → COMPANY{counter}/FY      (e.g. STIPL119/2025-26 - Invoice, no token)
 */
export type VoucherFormatStyle = 'glued' | 'separated' | 'compact';

export interface VoucherDocConfig {
    /** Short token shown in the voucher_no, e.g. 'QT', 'PI', 'OS'. Unused for 'compact'. */
    token: string;
    style: VoucherFormatStyle;
    /** Counter zero-pad width; defaults to 4. Invoice uses 3 to match template. */
    padDigits?: number;
}

/**
 * Per-doc-type display config. Matches ShivaTrades sample sheets:
 *   PFI     → STIPL/PI0001/2026-27       (token+counter glued)
 *   PO      → STIPL/OS/0001/2026-27      (token and counter separated)
 *   QT      → STIPL/QT0001/2026-27       (glued, our convention)
 *   POV     → STIPL/POV0001/2026-27      (glued)
 *   INVOICE → STIPL001/2025-26           (compact, no token, 3-digit per STIPL119 template)
 */
export const VOUCHER_DOC_CONFIG: Record<ENUM_VOUCHER_DOC_TYPE, VoucherDocConfig> = {
    // Lead / Customer Requirement → STIPL/RQ/0001/2026-27
    [ENUM_VOUCHER_DOC_TYPE.LEAD]: { token: 'RQ', style: 'separated' },
    // RFQ / Vendor Sourcing → STIPL/RFQ0001/2026-27
    [ENUM_VOUCHER_DOC_TYPE.RFQ]: { token: 'RFQ', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.QUOTATION]: { token: 'QT', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.PFI]: { token: 'PI', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.PURCHASE_ORDER]: { token: 'OS', style: 'separated' },
    [ENUM_VOUCHER_DOC_TYPE.PO_VENDOR]: { token: 'POV', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT]: { token: '', style: 'compact', padDigits: 3 },
    [ENUM_VOUCHER_DOC_TYPE.SHIPPING]: { token: 'SHP', style: 'glued' },
};
