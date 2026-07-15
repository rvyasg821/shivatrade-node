import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { AUDIT_LOG_COLLECTION_NAME } from '../../constants/tracking.constant';

/** `{ field: { from, to } }` — only fields that actually differ. */
export type AuditChangeMap = Record<
    string,
    { from: unknown; to: unknown }
>;

export enum ENUM_AUDIT_ACTION {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    SOFT_DELETE = 'soft_delete',
    /** A bulk operation, recorded as ONE summary row rather than N per-row rows.
     *  e.g. "imported 500 prices". Written by `AuditLogService.recordSummary()`,
     *  never by the subscriber. */
    IMPORT = 'import',

    // ─── Authentication events ───────────────────────────────────────────────
    // Not entity mutations, so the subscriber never sees them — the auth/session/
    // reset-password services write these via `AuditLogService.recordSummary()`.
    // Values MUST stay ≤ 20 chars (the `action` column is varchar(20)).
    /** A successful sign-in. */
    LOGIN = 'login',
    /** A session was revoked (sign-out). */
    LOGOUT = 'logout',
    /** A rejected sign-in — wrong password, unknown account, or blocked role. */
    LOGIN_FAILED = 'login_failed',
    /** A password-reset email/OTP was requested ("forgot password"). */
    PASSWORD_RESET_REQUEST = 'pwd_reset_req',
    /** A password was actually changed through the reset flow. */
    PASSWORD_RESET = 'pwd_reset',
}

/**
 * One row per changed business entity (ERP_TRACKING_SYSTEM_PLAN §4.2).
 *
 * Answers "who changed this margin, when, and what was it before" — the question
 * the ERP could not answer before. Written by `AuditSubscriber` inside the
 * caller's transaction, so a rolled-back save leaves no phantom audit row.
 *
 * Headers only: line entities are excluded, else a 40-line SO edit writes 41 rows.
 */
@Entity(AUDIT_LOG_COLLECTION_NAME)
@Index(['company_id', 'createdAt'])
@Index(['entity_name', 'entity_id', 'createdAt'])
@Index(['user_id', 'createdAt'])
// Backs the subscriber's coalesce lookup, which runs on every audited update.
// Without it that lookup becomes a sequential scan as the table grows.
@Index(['request_id', 'entity_id', 'action'])
export class AuditLogEntity extends DatabaseObjectIdEntityBase {
    /** Correlates back to the `api_call_logs` row for the same request.
     *  Null for cron / system writes, which have no HTTP request. */
    @Column({ type: 'varchar', length: 64, nullable: true })
    request_id?: string;

    @Column({ type: 'uuid', nullable: true })
    company_id?: string;

    /** Null ⇒ a system/cron actor, never a wrong user. If the async context is
     *  lost, attribution fails closed to `null`. */
    @Column({ type: 'uuid', nullable: true })
    user_id?: string;

    @Column({ type: 'varchar', length: 20, nullable: false })
    action: ENUM_AUDIT_ACTION;

    /** TypeORM entity class name, e.g. `QuotationEntity`. */
    @Column({ type: 'varchar', length: 60, nullable: false })
    entity_name: string;

    @Column({ type: 'uuid', nullable: false })
    entity_id: string;

    /** Denormalised `voucher_no` / `code` / `name`, so the feed reads
     *  "STIPL/QT/0007" rather than a uuid. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    entity_label?: string;

    /** `{ margin_pct: { from: "10", to: "12" } }`. Null on create/delete. */
    @Column({ type: 'jsonb', nullable: true })
    changes?: AuditChangeMap;

    // `createdAt` is inherited and already indexed on the base entity.
}

export type AuditLogDoc = AuditLogEntity;
