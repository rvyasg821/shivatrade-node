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
    LeadEntity: 'Lead',
    RfqEntity: 'RFQ',
    QuotationEntity: 'Quotation',
    PurchaseOrderEntity: 'Sales Order',
    PoVendorEntity: 'Vendor PO',
    GrnEntity: 'GRN',
    DebitNoteEntity: 'Debit Note',
    InvoiceEntity: 'Invoice',
    ProductEntity: 'Product',
    VendorEntity: 'Vendor',
    CustomerEntity: 'Customer',
    StockMovementEntity: 'Inventory',
    PriceListEntity: 'Price List',
    CompanyEntity: 'Company',
    UserEntity: 'User',
    RoleEntity: 'Role',
    CountryEntity: 'Country',
    StateEntity: 'State',
    CityEntity: 'City',
    LocationEntity: 'Location',
    PayRunEntity: 'Pay Run',
    PayslipEntity: 'Payslip',
    PayScheduleEntity: 'Pay Schedule',
    PayElementEntity: 'Pay Element',
    EmployeeEntity: 'Employee',
    CategoryEntity: 'Category',
    CurrencyEntity: 'Currency',
    UomEntity: 'UOM',
    RebateEntity: 'Rebate',
    ExpenseEntity: 'Expense',
    CompanySettingsEntity: 'Company Settings',
    LeaveRequestEntity: 'Leave Request',
    AttendanceRecordEntity: 'Attendance',
    HolidayCalendarEntity: 'Holiday Calendar',
    HolidayEntity: 'Holiday',
    CompanyLookupEntity: 'Designation / Department',
    LeaveTypeEntity: 'Leave Type',
    LeavePolicyEntity: 'Leave Policy',
    LeaveEntitlementEntity: 'Leave Entitlement',
    ShiftTemplateEntity: 'Shift Template',
    ShiftAssignmentEntity: 'Shift Assignment',
    ShiftSwapRequestEntity: 'Shift Swap Request',
    AttendanceSettingsEntity: 'Attendance Settings',
    ContractTemplateEntity: 'Contract Template',
    EmployeeContractEntity: 'Employee Contract',
    EmployeeLocationAssignmentEntity: 'Employee Location',
    InvoicePaymentEntity: 'Customer Payment',
    PoVendorPaymentEntity: 'Supplier Payment',
    PoVendorTrackingEventEntity: 'Shipment Tracking',
    PortMasterEntity: 'Port Master',
    DocumentEntity: 'Document',
    DocumentCategoryEntity: 'Document Category',
};

const ACTION_VERBS: Record<string, string> = {
    [ENUM_AUDIT_ACTION.CREATE]: 'created',
    [ENUM_AUDIT_ACTION.UPDATE]: 'updated',
    [ENUM_AUDIT_ACTION.DELETE]: 'deleted',
    [ENUM_AUDIT_ACTION.SOFT_DELETE]: 'deleted',
    [ENUM_AUDIT_ACTION.IMPORT]: 'imported',
};

/**
 * Authentication events don't fit the "verb Entity — fields" grammar, so they
 * get their own plain-English sentences instead of "login User …". The actor's
 * name comes from the "Who" column; the email is only appended when there is no
 * user to attribute to (a failed login against a non-existent account).
 */
const AUTH_SENTENCES: Partial<Record<ENUM_AUDIT_ACTION, string>> = {
    [ENUM_AUDIT_ACTION.LOGIN]: 'Signed in',
    [ENUM_AUDIT_ACTION.LOGOUT]: 'Signed out',
    [ENUM_AUDIT_ACTION.PASSWORD_RESET_REQUEST]: 'Requested a password reset',
    [ENUM_AUDIT_ACTION.PASSWORD_RESET]: 'Reset the account password',
};

/** Reason code (stored in `changes.reason`) → phrase, for failed logins. */
const LOGIN_FAILED_REASONS: Record<string, string> = {
    wrong_password: 'wrong password',
    no_account: 'no such account',
    role_blocked: 'login not allowed for this account',
};

const AUTH_ACTIONS: ReadonlySet<ENUM_AUDIT_ACTION> = new Set([
    ENUM_AUDIT_ACTION.LOGIN,
    ENUM_AUDIT_ACTION.LOGOUT,
    ENUM_AUDIT_ACTION.LOGIN_FAILED,
    ENUM_AUDIT_ACTION.PASSWORD_RESET_REQUEST,
    ENUM_AUDIT_ACTION.PASSWORD_RESET,
]);

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
        if (AUTH_ACTIONS.has(row.action)) return this.formatAuth(row);

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

    /** Plain-English sentence for an authentication event. */
    private formatAuth(row: AuditLogEntity): string {
        const email = (row.changes as any)?.email as string | undefined;

        if (row.action === ENUM_AUDIT_ACTION.LOGIN_FAILED) {
            const reason =
                LOGIN_FAILED_REASONS[(row.changes as any)?.reason] || '';
            // A failed login often has no user_id (unknown account), so the
            // email is the only thing that names the attempt — always show it.
            const who = email ? ` — ${email}` : '';
            return reason
                ? `Failed login (${reason})${who}`
                : `Failed login attempt${who}`;
        }

        const base = AUTH_SENTENCES[row.action] ?? String(row.action);
        // For attributed events the "Who" column already names the user; only
        // spell out the email when there is no actor to show there.
        const who = !row.user_id && email ? ` — ${email}` : '';
        return `${base}${who}`;
    }

    /**
     * Field-level detail for the UI to render as struck-through old / green new.
     * Returned alongside the sentence rather than baked into it, so the frontend
     * decides how much to show.
     */
    diff(
        row: AuditLogEntity
    ): Array<{ field: string; from: unknown; to: unknown }> {
        // Auth events and summaries store flat payloads in `changes`, not
        // {from,to} diffs — there is nothing to render as a before/after.
        if (AUTH_ACTIONS.has(row.action)) return [];
        if (row.action === ENUM_AUDIT_ACTION.IMPORT) return [];
        return Object.entries(row.changes ?? {}).map(([field, delta]) => ({
            field: humanizeField(field),
            from: delta?.from ?? null,
            to: delta?.to ?? null,
        }));
    }
}
