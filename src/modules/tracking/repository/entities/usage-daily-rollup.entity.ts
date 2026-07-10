import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { USAGE_DAILY_ROLLUP_COLLECTION_NAME } from '../../constants/tracking.constant';

/**
 * One row per company per day (ERP_TRACKING_SYSTEM_PLAN §4.3).
 *
 * NOT subject to the 30-day prune. `api_call_logs` and `audit_logs` are raw and
 * disposable; this is the durable aggregate that survives them. Delete a rollup
 * and the history it summarises is gone for good.
 *
 * The unique (company_id, day) index is what makes the nightly job idempotent —
 * a re-run overwrites the day rather than duplicating it.
 */
@Entity(USAGE_DAILY_ROLLUP_COLLECTION_NAME)
@Unique('uq_usage_rollup_company_day', ['company_id', 'day'])
@Index(['day'])
export class UsageDailyRollupEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'date', nullable: false })
    day: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    api_calls: number;

    @Column({ type: 'int', nullable: false, default: 0 })
    api_errors: number;

    /** 95th percentile response time for the day, in ms. Null when no calls. */
    @Column({ type: 'int', nullable: true })
    p95_duration_ms?: number;

    /** Distinct authenticated users who made a request that day. */
    @Column({ type: 'int', nullable: false, default: 0 })
    active_users: number;

    /** `{ "quotation": 4, "invoice": 2 }` — from audit_logs where action='create'. */
    @Column({ type: 'jsonb', nullable: true })
    documents_created?: Record<string, number>;
}

export type UsageDailyRollupDoc = UsageDailyRollupEntity;
