/**
 * ERP Tracking — Phase 1 constants (ERP_TRACKING_SYSTEM_PLAN §5.1, §11, §14).
 *
 * Everything tunable about telemetry lives here so the behaviour can be read in
 * one place rather than reverse-engineered from the middleware.
 */

export const API_CALL_LOG_COLLECTION_NAME = 'api_call_logs';
export const AUDIT_LOG_COLLECTION_NAME = 'audit_logs';
export const USAGE_DAILY_ROLLUP_COLLECTION_NAME = 'usage_daily_rollups';

const TRUTHY = new Set(['true', '1', 'yes', 'on']);
const FALSEY = new Set(['false', '0', 'no', 'off']);

/** Warn once, not once per request. */
let warnedAboutBadValue = false;

/**
 * Master kill-switch (plan §13.4). `TRACKING_ENABLED=false` short-circuits the
 * middleware, the subscriber and the cron at their first statement, so tracking
 * can be disabled in production with a restart and no code deploy. Defaults ON.
 *
 * Accepts false/0/no/off (any case) and the truthy equivalents. Anything else is
 * a typo — `flase`, `FLASE`, `disabled` — and a kill switch that silently ignores
 * a typo is worse than no kill switch: you think it is off, it is on, and nothing
 * tells you. So an unrecognised value logs a loud warning and leaves tracking ON
 * (fail-safe: keep collecting rather than silently stop auditing).
 */
export const isTrackingEnabled = (): boolean => {
    const raw = process.env.TRACKING_ENABLED;
    if (raw === undefined || raw === '') return true;

    const value = raw.trim().toLowerCase();
    if (FALSEY.has(value)) return false;
    if (TRUTHY.has(value)) return true;

    if (!warnedAboutBadValue) {
        warnedAboutBadValue = true;
        // eslint-disable-next-line no-console
        console.warn(
            `[tracking] TRACKING_ENABLED="${raw}" is not recognised — did you mean "false"? ` +
                `Tracking remains ENABLED. Valid values: ${[...FALSEY].join('/')} or ${[...TRUTHY].join('/')}.`
        );
    }
    return true;
};

/**
 * Routes never recorded.
 *
 * `/admin/tracking/*` is excluded because the Phase-5 console reads it — a
 * console that polls its own list endpoint would otherwise fill the table with
 * rows about reading the table (plan §5.1.4).
 *
 * Matched against the resolved route pattern AND the raw path, prefix-wise.
 */
export const TRACKING_EXCLUDED_ROUTE_PREFIXES: readonly string[] = [
    '/health',
    '/admin/tracking',
    '/assets',
    '/favicon.ico',
];

/**
 * Retention, per table. Rows older than this are hard-deleted by the nightly
 * cron. `usage_daily_rollups` is exempt — it is the durable aggregate.
 *
 * The two differ on purpose:
 *
 *  - Telemetry answers "is the system healthy right now". It writes one row per
 *    HTTP request, so it is the big table. Nobody asks about last quarter's p95.
 *
 *  - The audit trail answers "who changed this margin". That question gets asked
 *    months later, during a dispute. It only writes when something actually
 *    changes, so 90 days costs a rounding error next to telemetry.
 */
/**
 * `api_call_logs`: **cleared daily**. The 04:00 cron rolls yesterday into
 * `usage_daily_rollups`, then deletes everything before today's midnight.
 *
 * `0` means "keep only today". Raising it to N keeps the last N whole days.
 * The cutoff is a MIDNIGHT boundary, not `now − 24h`, so the table holds whole
 * days and never a ragged half-day.
 *
 * Consequence: the console's API Calls tab and its p95/p99 tiles only ever show
 * today. Anything older survives only as the daily rollup, which keeps
 * per-company counts, error rates, active users and a p95 — but not individual
 * requests. You can no longer ask "what did user X call last Tuesday".
 */
export const TRACKING_RETENTION_DAYS = 0; // api_call_logs — cleared every night
export const AUDIT_RETENTION_DAYS = 90; // audit_logs

/**
 * Buffer/flush tuning (plan §14.2).
 *
 * The datasource sets no pool options, so node-postgres defaults to 10
 * connections. One INSERT per request would contend with real user queries for
 * that pool — the ERP would get slower under load. Instead rows accumulate in
 * memory and are written as a single multi-row INSERT.
 */
export const TRACKING_FLUSH_INTERVAL_MS = 2000;
export const TRACKING_FLUSH_ROWS = 200;

/**
 * Hard ceiling on the in-memory buffer. If the database is unreachable and the
 * buffer fills, we SHED rows rather than grow until the heap dies. Losing
 * telemetry is correct; OOM-killing the ERP is not.
 */
export const TRACKING_MAX_BUFFER = 10_000;

/** Chunk size for the prune loop — keeps each DELETE a short transaction. */
export const TRACKING_PRUNE_CHUNK = 10_000;

// ─── Phase 2: audit trail ───────────────────────────────────────────────

/**
 * RECURSION GUARD (plan §5.2, invariant 1).
 *
 * Writing an audit row is itself an INSERT, which fires `afterInsert`, which
 * would write an audit row… The allowlist below already excludes these, but this
 * check runs FIRST and unconditionally, so a careless allowlist edit can never
 * hang the process.
 */
export const TRACKING_OWN_ENTITIES: ReadonlySet<string> = new Set([
    'AuditLogEntity',
    'ApiCallLogEntity',
]);

/**
 * Only these entities are audited. Everything else returns early, so the vast
 * majority of writes in the app never enter the subscriber's body.
 *
 * Line entities (`*LineEntity`) are deliberately ABSENT: a 40-line Sales Order
 * edit would otherwise write 40 audit rows (plan §11.5). Headers only.
 *
 * `PriceListEntity` is ABSENT for the same reason: one row per vendor-product
 * price means a 500-row Excel import would write 500 audit rows. Bulk operations
 * record ONE summary event instead — see `AuditLogService.recordSummary()`.
 */
export const AUDIT_ENTITY_ALLOWLIST: ReadonlySet<string> = new Set([
    'LeadEntity',
    'RfqEntity', // headers only — RfqVendor/RfqVendorPrice lines stay off
    'QuotationEntity',
    'PurchaseOrderEntity', // = Sales Order
    'PoVendorEntity', // = Vendor PO
    'GrnEntity',
    'DebitNoteEntity',
    'InvoiceEntity',
    'ProductEntity',
    'VendorEntity',
    'CustomerEntity',
    'StockMovementEntity', // inventory ledger — MANUAL adjustments only (the
    // subscriber skips grn/invoice-sourced movements; those are covered by their
    // audited GRN / Invoice headers)
    'CompanyEntity',
    'UserEntity',
    'RoleEntity',
    // Geo masters (Country/State/City).
    'CountryEntity',
    'StateEntity',
    'CityEntity',
    'LocationEntity',
    // Payroll — headers only; PayslipLineItem lines stay off.
    'PayRunEntity',
    'PayslipEntity',
    'PayScheduleEntity',
    'PayElementEntity',
    // Masters / config.
    'EmployeeEntity',
    'CategoryEntity',
    'CurrencyEntity',
    'UomEntity',
    'RebateEntity',
    'ExpenseEntity',
    'CompanySettingsEntity',
    // HR. Assigning a designation/department to a person is a field on
    // EmployeeEntity (covered by the Employee audit); the MASTER list of
    // available designations/departments lives in CompanyLookupEntity below.
    'LeaveRequestEntity',
    'AttendanceRecordEntity', // high volume — one record per employee per day
    'HolidayCalendarEntity',
    'HolidayEntity',
    'CompanyLookupEntity', // designation / department master values
    // HR setup.
    'LeaveTypeEntity',
    'LeavePolicyEntity',
    'LeaveEntitlementEntity',
    'ShiftTemplateEntity',
    'ShiftAssignmentEntity',
    'ShiftSwapRequestEntity',
    'AttendanceSettingsEntity',
    'ContractTemplateEntity',
    'EmployeeContractEntity',
    'EmployeeLocationAssignmentEntity',
    // Finance — child rows, but they move real money, so audited on request.
    'InvoicePaymentEntity',
    'PoVendorPaymentEntity',
    'PoVendorTrackingEventEntity',
    // Masters.
    'PortMasterEntity',
    'DocumentEntity',
    'DocumentCategoryEntity',
]);

/**
 * Never recorded in `changes`, even when they change.
 *
 * Secrets and noise. If a new secret-ish column is ever added to an audited
 * entity, add it here — `auditColumnIsSensitive()` also catches the common
 * naming patterns as a backstop so a miss fails safe.
 */
export const AUDIT_COLUMN_DENYLIST: ReadonlySet<string> = new Set([
    'password',
    'salt',
    'passwordExpired',
    'passwordCreated',
    'passwordAttempt',
    'token',
    'refreshToken',
    'accessToken',
    'face_descriptor',
    'createdAt',
    'updatedAt',
    'deletedAt',
]);

/**
 * Backstop for the denylist: anything that *looks* like a credential is dropped
 * even if nobody remembered to list it. Fails closed.
 */
export const auditColumnIsSensitive = (column: string): boolean =>
    AUDIT_COLUMN_DENYLIST.has(column) ||
    /pass|secret|token|salt|api[_-]?key|credential/i.test(column);

/**
 * Fields tried, in order, to give an audit row a human label — so the activity
 * feed reads "STIPL/QT/0007" instead of a uuid.
 */
export const AUDIT_LABEL_FIELDS: readonly string[] = [
    'voucher_no',
    'code',
    'company_name',
    'name',
    'email',
    // Stock movements have no voucher_no of their own — fall back to the source
    // document's number so an inventory row reads "STIPL/GRN/0001", not a uuid.
    'source_voucher_no',
];

/** `changes` values longer than this are truncated — an audit row is not a blob store. */
export const AUDIT_VALUE_MAX_LEN = 500;
