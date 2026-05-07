/**
 * Document types that draw from the central voucher_sequences table.
 * Add new entries here when introducing modules that need auto-numbered
 * vouchers (Invoice, GRN, POV, etc.).
 */
export enum ENUM_VOUCHER_DOC_TYPE {
    QUOTATION = 'QUOTATION',
    PFI = 'PFI',
    PURCHASE_ORDER = 'PURCHASE_ORDER',
}

export type VoucherFormatStyle = 'glued' | 'separated';

export interface VoucherDocConfig {
    /** Short token shown in the voucher_no, e.g. 'QT', 'PI', 'OS'. */
    token: string;
    /** 'glued' = `PI0001`, 'separated' = `OS/0001`. Per ShivaTrades sheet. */
    style: VoucherFormatStyle;
}

/**
 * Per-doc-type display config. Matches ShivaTrades sample sheet exactly:
 *   PFI → STIPL/PI0001/2026-27   (token+counter glued)
 *   PO  → STIPL/OS/0001/2026-27  (token and counter separated)
 *   QT  → STIPL/QT0001/2026-27   (glued, our convention)
 */
export const VOUCHER_DOC_CONFIG: Record<ENUM_VOUCHER_DOC_TYPE, VoucherDocConfig> = {
    [ENUM_VOUCHER_DOC_TYPE.QUOTATION]: { token: 'QT', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.PFI]: { token: 'PI', style: 'glued' },
    [ENUM_VOUCHER_DOC_TYPE.PURCHASE_ORDER]: { token: 'OS', style: 'separated' },
};
