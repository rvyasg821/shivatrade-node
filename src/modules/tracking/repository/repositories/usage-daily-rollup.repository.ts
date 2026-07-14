import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { UsageDailyRollupEntity } from '../entities/usage-daily-rollup.entity';

/** Shape returned by the two aggregate queries below. */
export interface IUsageAggregate {
    company_id: string;
    api_calls: number;
    api_errors: number;
    p95_duration_ms: number | null;
    active_users: number;
}

@Injectable()
export class UsageDailyRollupRepository extends DatabaseObjectIdRepositoryBase<UsageDailyRollupEntity> {
    constructor(
        @InjectDatabaseModel(UsageDailyRollupEntity)
        private readonly usageDailyRollupRepository: Repository<UsageDailyRollupEntity>
    ) {
        super(usageDailyRollupRepository);
    }

    queryBuilder(alias: string) {
        return this._repository.createQueryBuilder(alias);
    }

    /**
     * Telemetry aggregates for one calendar day, per company.
     *
     * Rows with a null `company_id` (login, health, pre-auth 401s) are excluded:
     * they belong to no tenant, and a unique index treats every NULL as distinct,
     * so they would silently create a duplicate rollup row every night.
     *
     * `[day, day+1)` — a half-open interval, so a call at exactly midnight lands
     * in one day, never both.
     */
    async aggregateApiCalls(day: string): Promise<IUsageAggregate[]> {
        const rows = await this._repository.query(
            `SELECT company_id::text                                        AS company_id,
                    COUNT(*)::int                                           AS api_calls,
                    COUNT(*) FILTER (WHERE status_code >= 400)::int         AS api_errors,
                    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::int
                                                                            AS p95_duration_ms,
                    COUNT(DISTINCT user_id)::int                            AS active_users
             FROM api_call_logs
             WHERE "createdAt" >= $1::date
               AND "createdAt" <  $1::date + INTERVAL '1 day'
               AND company_id IS NOT NULL
             GROUP BY company_id`,
            [day]
        );
        return rows as IUsageAggregate[];
    }

    /**
     * Documents created that day, per company, keyed by entity name.
     * Returns e.g. `{ "<companyId>": { QuotationEntity: 4, InvoiceEntity: 2 } }`.
     */
    async aggregateDocumentsCreated(
        day: string
    ): Promise<Map<string, Record<string, number>>> {
        const rows: Array<{
            company_id: string;
            entity_name: string;
            count: number;
        }> = await this._repository.query(
            `SELECT company_id::text AS company_id,
                    entity_name,
                    COUNT(*)::int    AS count
             FROM audit_logs
             WHERE "createdAt" >= $1::date
               AND "createdAt" <  $1::date + INTERVAL '1 day'
               AND action = 'create'
               AND company_id IS NOT NULL
             GROUP BY company_id, entity_name`,
            [day]
        );

        const out = new Map<string, Record<string, number>>();
        for (const row of rows) {
            const bucket = out.get(row.company_id) || {};
            bucket[row.entity_name] = Number(row.count);
            out.set(row.company_id, bucket);
        }
        return out;
    }

    /**
     * Idempotent write. TypeORM's `upsert` maps to
     * `ON CONFLICT (company_id, day) DO UPDATE`, so re-running the nightly job —
     * or backfilling a day by hand — overwrites rather than duplicating.
     */
    async upsertMany(rows: Partial<UsageDailyRollupEntity>[]): Promise<void> {
        if (!rows.length) return;
        await this._repository.upsert(rows as any, {
            conflictPaths: ['company_id', 'day'],
            skipUpdateIfNoValuesChanged: true,
        });
    }
}
