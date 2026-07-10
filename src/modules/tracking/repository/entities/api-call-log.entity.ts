import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { API_CALL_LOG_COLLECTION_NAME } from '../../constants/tracking.constant';

/**
 * One row per HTTP request (ERP_TRACKING_SYSTEM_PLAN §4.1).
 *
 * Append-only and METADATA ONLY — no request or response bodies, ever. That is a
 * locked decision (§11.2): it keeps rows ~300 bytes and means this table can
 * never leak a password, a token, or customer PII.
 *
 * Rows live 30 days; `TrackingCronService` hard-deletes the rest.
 *
 * Indexes are deliberately limited to three (§14.3). This table takes one insert
 * per request, and every index is paid on every insert. `request_id` and a
 * partial index on `status_code` are DEFERRED until a Phase-5 console query
 * measures slow — do not add them speculatively.
 */
@Entity(API_CALL_LOG_COLLECTION_NAME)
@Index(['company_id', 'createdAt'])
@Index(['route', 'createdAt'])
export class ApiCallLogEntity extends DatabaseObjectIdEntityBase {
    /** `req.id` from AppRequestIdMiddleware. Correlates this call to the
     *  audit rows it produced (Phase 2). Not indexed yet — see class doc. */
    @Column({ type: 'varchar', length: 64, nullable: true })
    request_id?: string;

    /** From the JWT. Null for unauthenticated requests (login, health). */
    @Column({ type: 'uuid', nullable: true })
    company_id?: string;

    /** From the JWT `user`. Null pre-auth. */
    @Column({ type: 'uuid', nullable: true })
    user_id?: string;

    /** JWT `impersonatedBy` — a SUPER_ADMIN acting as a tenant must be visible. */
    @Column({ type: 'uuid', nullable: true })
    impersonated_by?: string;

    @Column({ type: 'varchar', length: 10, nullable: false })
    method: string;

    /**
     * The route PATTERN, not the resolved URL: `/admin/po-vendor/:id/balance`.
     * Storing the resolved path would yield one distinct `route` per POV and make
     * "slowest endpoints" unanswerable (§11.3). Unmatched requests (404s) record
     * `(unmatched)` rather than an attacker-controlled string.
     */
    @Column({ type: 'varchar', length: 255, nullable: false })
    route: string;

    /** Actual path, query string stripped. For spot-debugging one request. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    path?: string;

    @Column({ type: 'int', nullable: false })
    status_code: number;

    @Column({ type: 'int', nullable: false })
    duration_ms: number;

    /** IPv6-safe width. */
    @Column({ type: 'varchar', length: 64, nullable: true })
    ip?: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    user_agent?: string;

    /** Reserved for Phase 2+. Message only — never a stack, never a body. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    error_message?: string;

    // `createdAt` is inherited from DatabaseObjectIdEntityBase, which already
    // declares it `@CreateDateColumn @Index()`. The prune cron and every console
    // query sort on it. No extra timestamp column — one source of truth.
}

export type ApiCallLogDoc = ApiCallLogEntity;
