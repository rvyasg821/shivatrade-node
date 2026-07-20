/**
 * Import-mode context threaded into the six document create paths (Lead,
 * Customer, Quotation, Sales Order, VPO, Invoice) ONLY by the bulk-import
 * services. Never exposed on the public create DTOs — the normal API create
 * path never receives one, so all import-only relaxations stay import-scoped.
 *
 * See Docs/Build-Plans/BULK_HISTORICAL_DATA_IMPORT_PLAN.md §6.1.
 */
export interface ImportContext {
    /** Preserve the original printed voucher number instead of auto-numbering. */
    voucher_no?: string;

    /** Land the document in its real historical status (Issued/Paid/…) not Draft. */
    status?: string;

    /**
     * Suppress side-effects a live create fires: welcome emails, customer
     * login-user provisioning, uniqueness emails, notification hooks.
     */
    silent?: boolean;
}

/** Convenience guard — true when a create call is running in import mode. */
export function isImportMode(ctx?: ImportContext): boolean {
    return !!ctx && (ctx.voucher_no != null || ctx.silent === true);
}
