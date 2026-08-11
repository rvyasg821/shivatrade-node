import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { ApiCallLogRepository } from '../repository/repositories/api-call-log.repository';
import { AuditLogRepository } from '../repository/repositories/audit-log.repository';
import { UsageDailyRollupRepository } from '../repository/repositories/usage-daily-rollup.repository';
import { AuditLogEntity } from '../repository/entities/audit-log.entity';
import { ActivityPresenterService } from './activity-presenter.service';

export interface IActivityQuery {
    company_id?: string;
    user_id?: string;
    entity_name?: string;
    entity_id?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    perPage?: number;
}

export interface IActivityItem {
    _id: string;
    at: Date;
    actor_name: string;
    sentence: string;
    action: string;
    entity_name: string;
    entity_id: string;
    entity_label?: string;
    company_id?: string;
    request_id?: string;
    diff: Array<{ field: string; from: unknown; to: unknown }>;
}

const MAX_PER_PAGE = 100;

/**
 * Read side of the tracking module (Phase 3).
 *
 * Reads `audit_logs` and nothing else. Every query is date-bounded and paginated
 * so a console request can never scan the whole table (plan §14.6).
 */
@Injectable()
export class TrackingQueryService {
    constructor(
        private readonly apiCallLogRepository: ApiCallLogRepository,
        private readonly auditLogRepository: AuditLogRepository,
        private readonly usageDailyRollupRepository: UsageDailyRollupRepository,
        private readonly userRepository: UserRepository,
        private readonly presenter: ActivityPresenterService
    ) {}

    async listActivity(
        query: IActivityQuery
    ): Promise<{
        items: IActivityItem[];
        total: number;
        page: number;
        perPage: number;
        available_actions: string[];
    }> {
        const page = Math.max(1, Number(query.page) || 1);
        const perPage = Math.min(
            MAX_PER_PAGE,
            Math.max(1, Number(query.perPage) || 25)
        );

        const qb = this.auditLogRepository.queryBuilder('a');

        if (query.company_id) {
            qb.andWhere('a.company_id = :companyId', {
                companyId: query.company_id,
            });
        }
        if (query.user_id) {
            qb.andWhere('a.user_id = :userId', { userId: query.user_id });
        }
        if (query.entity_name) {
            qb.andWhere('a.entity_name = :entityName', {
                entityName: query.entity_name,
            });
        }
        if (query.entity_id) {
            qb.andWhere('a.entity_id = :entityId', {
                entityId: query.entity_id,
            });
        }
        if (query.action) {
            // Accept a comma-separated list so one UI choice can map to several
            // stored actions (e.g. "Deleted" = delete + soft_delete).
            const actions = query.action
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean);
            if (actions.length === 1) {
                qb.andWhere('a.action = :action', { action: actions[0] });
            } else if (actions.length > 1) {
                qb.andWhere('a.action IN (:...actions)', { actions });
            }
        }
        if (query.from) {
            qb.andWhere('a."createdAt" >= :from', { from: query.from });
        }
        if (query.to) {
            qb.andWhere('a."createdAt" <= :to', { to: query.to });
        }

        qb.orderBy('a."createdAt"', 'DESC')
            .skip((page - 1) * perPage)
            .take(perPage);

        const [rows, total] = await qb.getManyAndCount();
        const actors = await this.resolveActors(rows);

        // Distinct actions that actually exist for this scope (company / user /
        // entity, ignoring the date + action narrows) — drives a dynamic Action
        // filter so it never offers a value with zero rows.
        const actionQb = this.auditLogRepository
            .queryBuilder('a')
            .select('DISTINCT a.action', 'action');
        if (query.company_id) {
            actionQb.andWhere('a.company_id = :companyId', {
                companyId: query.company_id,
            });
        }
        if (query.user_id) {
            actionQb.andWhere('a.user_id = :userId', { userId: query.user_id });
        }
        if (query.entity_name) {
            actionQb.andWhere('a.entity_name = :entityName', {
                entityName: query.entity_name,
            });
        }
        const actionRows = await actionQb.getRawMany();
        const available_actions = actionRows
            .map((r) => r.action)
            .filter(Boolean)
            .sort();

        return {
            available_actions,
            items: rows.map((row) => ({
                _id: row._id,
                at: row.createdAt,
                actor_name: row.user_id
                    ? actors.get(row.user_id) || 'Unknown user'
                    : 'System',
                sentence: this.presenter.format(row),
                action: row.action,
                entity_name: row.entity_name,
                entity_id: row.entity_id,
                entity_label: row.entity_label,
                company_id: row.company_id,
                request_id: row.request_id,
                diff: this.presenter.diff(row),
            })),
            total,
            page,
            perPage,
        };
    }

    /**
     * Raw API-call rows (Phase 5, "API Calls" tab). Always paginated and — in
     * practice — date-bounded by the console. `status_class` filters by 2xx/4xx/5xx
     * without needing a partial index.
     */
    async listApiCalls(query: {
        company_id?: string;
        user_id?: string;
        route?: string;
        status_class?: string;
        from?: string;
        to?: string;
        page?: number;
        perPage?: number;
    }): Promise<{ items: any[]; total: number; page: number; perPage: number }> {
        const page = Math.max(1, Number(query.page) || 1);
        const perPage = Math.min(
            MAX_PER_PAGE,
            Math.max(1, Number(query.perPage) || 25)
        );

        const qb = this.apiCallLogRepository.queryBuilder('c');
        if (query.company_id) {
            qb.andWhere('c.company_id = :companyId', {
                companyId: query.company_id,
            });
        }
        if (query.user_id) {
            qb.andWhere('c.user_id = :userId', { userId: query.user_id });
        }
        if (query.route) {
            qb.andWhere('c.route ILIKE :route', { route: `%${query.route}%` });
        }
        if (query.status_class) {
            const base = Number(query.status_class) * 100;
            if (Number.isFinite(base) && base >= 100) {
                qb.andWhere(
                    'c.status_code >= :lo AND c.status_code < :hi',
                    { lo: base, hi: base + 100 }
                );
            }
        }
        if (query.from) {
            qb.andWhere('c."createdAt" >= :from', { from: query.from });
        }
        if (query.to) {
            qb.andWhere('c."createdAt" <= :to', { to: query.to });
        }

        qb.orderBy('c."createdAt"', 'DESC')
            .skip((page - 1) * perPage)
            .take(perPage);

        const [rows, total] = await qb.getManyAndCount();
        const actors = await this.resolveUserNames(
            rows.map((r) => r.user_id).filter(Boolean) as string[]
        );

        return {
            items: rows.map((r) => ({
                _id: r._id,
                at: r.createdAt,
                method: r.method,
                route: r.route,
                path: r.path,
                status_code: r.status_code,
                duration_ms: r.duration_ms,
                actor_name: r.user_id
                    ? actors.get(r.user_id) || 'Unknown user'
                    : 'Anonymous',
                company_id: r.company_id,
                ip: r.ip,
                request_id: r.request_id,
            })),
            total,
            page,
            perPage,
        };
    }

    /** Total / error-rate / p50 / p95 / p99 for the API Calls tab's stat tiles. */
    async apiCallStats(query: {
        company_id?: string;
        from?: string;
        to?: string;
    }) {
        return this.apiCallLogRepository.stats(
            query.from,
            query.to,
            query.company_id
        );
    }

    /**
     * Per-company daily usage. Reads `usage_daily_rollups` — a handful of rows
     * per company per month — NOT the raw telemetry table. This is the whole
     * reason the rollup exists: console analytics must never scan millions of
     * rows against the same 10-connection pool the ERP uses (plan §14.6).
     */
    async listUsage(query: {
        company_id?: string;
        from?: string;
        to?: string;
    }): Promise<{
        days: any[];
        totals: {
            api_calls: number;
            api_errors: number;
            error_rate_pct: number;
            peak_active_users: number;
            documents_created: Record<string, number>;
        };
    }> {
        const qb = this.usageDailyRollupRepository.queryBuilder('u');
        if (query.company_id) {
            qb.andWhere('u.company_id = :companyId', {
                companyId: query.company_id,
            });
        }
        if (query.from) qb.andWhere('u.day >= :from', { from: query.from });
        if (query.to) qb.andWhere('u.day <= :to', { to: query.to });
        qb.orderBy('u.day', 'DESC').take(400);

        const days = await qb.getMany();

        const totals = days.reduce(
            (acc, d) => {
                acc.api_calls += d.api_calls || 0;
                acc.api_errors += d.api_errors || 0;
                acc.peak_active_users = Math.max(
                    acc.peak_active_users,
                    d.active_users || 0
                );
                for (const [entity, count] of Object.entries(
                    d.documents_created || {}
                )) {
                    acc.documents_created[entity] =
                        (acc.documents_created[entity] || 0) + Number(count);
                }
                return acc;
            },
            {
                api_calls: 0,
                api_errors: 0,
                error_rate_pct: 0,
                peak_active_users: 0,
                documents_created: {} as Record<string, number>,
            }
        );
        totals.error_rate_pct = totals.api_calls
            ? Number(((totals.api_errors / totals.api_calls) * 100).toFixed(2))
            : 0;

        return { days, totals };
    }

    /** One query for the whole page's actors — not one per row. */
    private async resolveActors(
        rows: AuditLogEntity[]
    ): Promise<Map<string, string>> {
        return this.resolveUserNames(
            rows.map((r) => r.user_id).filter((v): v is string => !!v)
        );
    }

    /** Batch id → display name. Empty map for an empty input, no query issued. */
    private async resolveUserNames(
        userIds: string[]
    ): Promise<Map<string, string>> {
        const ids = Array.from(new Set(userIds));
        if (!ids.length) return new Map();

        const users = (await this.userRepository.findAll({
            _id: In(ids),
        } as any)) as any[];

        return new Map(
            users.map((u) => [
                u._id.toString(),
                u.name ||
                    [u.first_name, u.last_name].filter(Boolean).join(' ') ||
                    u.email ||
                    'Unknown user',
            ])
        );
    }
}
