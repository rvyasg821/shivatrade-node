// DocType drives column variations (PFI adds export-fields, PO adds vendor
// column hardening) and the filename prefix for exports.
export enum ENUM_SALES_DOC_TYPE {
    QUOTATION = 'quotation',
    PFI = 'pfi',
    PO = 'po',
    // Lead requirement lines reuse the quotation line shape + export fields.
    LEAD = 'lead',
}

// Row status mirrors the price-list import flow (see
// price-list.import-export.service.ts) but adapted to line-item context:
//   - new      → product/vendor not already in current form lines
//   - updated  → product/vendor already in current form lines (overwrite)
//   - skipped  → duplicate of an earlier row in the same sheet
//   - error    → cannot import (unknown code, invalid qty, vendor mismatch)
// Warnings are non-blocking notices attached to new/updated rows.
export enum ENUM_SALES_DOC_IMPORT_ROW_STATUS {
    NEW = 'new',
    UPDATED = 'updated',
    SKIPPED = 'skipped',
    ERROR = 'error',
}
