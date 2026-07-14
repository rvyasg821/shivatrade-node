import { Injectable } from '@nestjs/common';
import {
    AuditLogEntity,
    ENUM_AUDIT_ACTION,
} from '../repository/entities/audit-log.entity';

/**
 * Maps a TypeORM entity class name to the word a human uses for it.
 * `PurchaseOrderEntity` is the SALES ORDER in this codebase, and `PoVendorEntity`
 * is the vendor PO — printing the class name would read backwards to the team.
 */
const ENTITY_LABELS: Record<string, string> = {
    QuotationEntity: 'Quotation',
    PurchaseOrderEntity: 'Sales Order',
    PoVendorEntity: 'Vendor PO',
    GrnEntity: 'GRN',
    DebitNoteEntity: 'Debit Note',
    InvoiceEntity: 'Invoice',
    ProductEntity: 'Product',
    VendorEntity: 'Vendor',
    CustomerEntity: 'Customer',
    PriceListEntity: 'Price List',
    CompanyEntity: 'Company',
    UserEntity: 'User',
    RoleEntity: 'Role',
};

const ACTION_VERBS: Record<string, string> = {
    [ENUM_AUDIT_ACTION.CREATE]: 'created',
    [ENUM_AUDIT_ACTION.UPDATE]: 'updated',
    [ENUM_AUDIT_ACTION.DELETE]: 'deleted',
    [ENUM_AUDIT_ACTION.SOFT_DELETE]: 'deleted',
    [ENUM_AUDIT_ACTION.IMPORT]: 'imported',
};

/** How many field names to name before saying "and N more". */
const MAX_NAMED_FIELDS = 3;

/** `margin_pct` → `margin pct`. Good enough, and beats a hand-kept dictionary. */
const humanizeField = (field: string): string => field.replace(/_/g, ' ');

/**
 * Phase 3 (ERP_TRACKING_SYSTEM_PLAN §5.3).
 *
 * The activity feed is a PROJECTION of `audit_logs` — no new table, no new write
 * path. If it ever needs events the audit log doesn't record (logins, PDF
 * downloads, exports), those become audit rows with their own `action`, not a
 * parallel system.
 */
@Injectable()
export class ActivityPresenterService {
    /** "updated Quotation STIPL/QT/0001 — margin amount, grand total" */
    format(row: AuditLogEntity): string {
        const verb = ACTION_VERBS[row.action] ?? row.action;
        const kind = ENTITY_LABELS[row.entity_name] ?? row.entity_name;
        const label = row.entity_label ? ` ${row.entity_label}` : '';

        if (row.action === ENUM_AUDIT_ACTION.IMPORT) {
            // Summary rows put counts in `changes`, not {from,to} diffs.
            const counts = Object.entries(row.changes ?? {})
                .map(([k, v]) => `${v} ${k}`)
                .join(', ');
            return counts
                ? `${verb} ${kind} — ${counts}`
                : `${verb} ${kind}${label}`;
        }

        const fields = Object.keys(row.changes ?? {});
        if (!fields.length) return `${verb} ${kind}${label}`;

        const named = fields.slice(0, MAX_NAMED_FIELDS).map(humanizeField);
        const rest = fields.length - named.length;
        const suffix = rest > 0 ? `, and ${rest} more` : '';
        return `${verb} ${kind}${label} — ${named.join(', ')}${suffix}`;
    }

    /**
     * Field-level detail for the UI to render as struck-through old / green new.
     * Returned alongside the sentence rather than baked into it, so the frontend
     * decides how much to show.
     */
    diff(
        row: AuditLogEntity
    ): Array<{ field: string; from: unknown; to: unknown }> {
        if (row.action === ENUM_AUDIT_ACTION.IMPORT) return [];
        return Object.entries(row.changes ?? {}).map(([field, delta]) => ({
            field: humanizeField(field),
            from: delta?.from ?? null,
            to: delta?.to ?? null,
        }));
    }
}
