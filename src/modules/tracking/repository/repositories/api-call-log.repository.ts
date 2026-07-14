import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ApiCallLogEntity } from '../entities/api-call-log.entity';
import { IApiCallLogRow } from '../../interfaces/tracking.interface';

@Injectable()
export class ApiCallLogRepository extends DatabaseObjectIdRepositoryBase<ApiCallLogEntity> {
    constructor(
        @InjectDatabaseModel(ApiCallLogEntity)
        private readonly apiCallLogRepository: Repository<ApiCallLogEntity>
    ) {
        super(apiCallLogRepository);
    }

    /**
     * One multi-row INSERT for a whole buffer (plan §14.2).
     *
     * `.insert()` rather than `.save()`: save() would SELECT each row back and
     * run subscribers. This table is append-only — none of that is wanted, and
     * it would triple the cost of the flush.
     */
    async insertMany(rows: IApiCallLogRow[]): Promise<void> {
        if (!rows.length) return;
        await this._repository.insert(rows as any);
    }

    /** Read side (Phase 5). `_repository` is protected on the base. */
    queryBuilder(alias: string) {
        return this._repository.createQueryBuilder(alias);
    }

    /**
     * Every whole day still sitting in the table, oldest first, excluding today.
     *
     * With daily retention the cron must roll up EVERY pending day before it
     * deletes — not just yesterday. If a night is missed (restart, crash, the
     * process down at 04:00), rolling up only yesterday and then deleting
     * "everything before today" would destroy the older day's usage numbers with
     * nothing left to recompute them from.
     */
    async pendingRollupDays(): Promise<string[]> {
        const rows: Array<{ day: string }> = await this._repository.query(
            `SELECT DISTINCT to_char("createdAt"::date, 'YYYY-MM-DD') AS day
             FROM ${this._repository.metadata.tableName}
             WHERE "createdAt" < CURRENT_DATE
             ORDER BY day ASC`
        );
        return rows.map((r) => r.day);
    }

    /**
     * Latency percentiles + error rate for a window.
     *
     * Computed over the RAW table because percentiles are not summable — you
     * cannot average p95s across days and get the real p95. Bounded by the
     * caller's date range, which the console always supplies.
     */
    async stats(
        from?: string,
        to?: string,
        companyId?: string
    ): Promise<{
        total: number;
        errors: number;
        error_rate_pct: number;
        p50: number | null;
        p95: number | null;
        p99: number | null;
    }> {
        const where: string[] = [];
        const params: any[] = [];
        if (from) {
            params.push(from);
            where.push(`"createdAt" >= $${params.length}::timestamptz`);
        }
        if (to) {
            params.push(to);
            where.push(`"createdAt" <= $${params.length}::timestamptz`);
        }
        if (companyId) {
            params.push(companyId);
            where.push(`company_id = $${params.length}::uuid`);
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [row] = await this._repository.query(
            `SELECT COUNT(*)::int                                   AS total,
                    COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
                    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms))::int AS p50,
                    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95,
                    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms))::int AS p99
             FROM ${this._repository.metadata.tableName}
             ${clause}`,
            params
        );

        const total = Number(row?.total || 0);
        const errors = Number(row?.errors || 0);
        return {
            total,
            errors,
            error_rate_pct: total
                ? Number(((errors / total) * 100).toFixed(2))
                : 0,
            p50: row?.p50 ?? null,
            p95: row?.p95 ?? null,
            p99: row?.p99 ?? null,
        };
    }

    /**
     * Delete ONE chunk of expired rows, returning how many went.
     *
     * Chunked on purpose (plan §14.4). A single unbounded
     * `DELETE ... WHERE createdAt < cutoff` over a month of rows holds a long
     * transaction, bloats the table, and leaves autovacuum reclaiming pages while
     * users are online — the table gets slower over time even at flat row count.
     *
     * The subquery + `IN` shape keeps the LIMIT inside a plain DELETE, which
     * Postgres does not otherwise support.
     */
    async deleteOlderThanChunk(cutoff: Date, chunk: number): Promise<number> {
        const table = this._repository.metadata.tableName;
        // RETURNING _id so `.query()` hands back one row per deletion. TypeORM's
        // query() yields the ROWS array for a DELETE, not a rowCount — without
        // RETURNING this would always report 0, the caller's loop would exit
        // after one chunk, and a backlog over `chunk` rows would never drain.
        const rows: unknown[] = await this._repository.query(
            `DELETE FROM ${table}
             WHERE _id IN (
                 SELECT _id FROM ${table}
                 WHERE "createdAt" < $1
                 LIMIT $2
             )
             RETURNING _id`,
            [cutoff, chunk]
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    /** Reclaim the pages the prune just freed, rather than waiting on autovacuum. */
    async vacuumAnalyze(): Promise<void> {
        await this._repository.query(
            `VACUUM (ANALYZE) ${this._repository.metadata.tableName}`
        );
    }
}
