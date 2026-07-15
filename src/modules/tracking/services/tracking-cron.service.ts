import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiCallLogRepository } from '../repository/repositories/api-call-log.repository';
import { AuditLogRepository } from '../repository/repositories/audit-log.repository';
import { UsageDailyRollupRepository } from '../repository/repositories/usage-daily-rollup.repository';
import {
    AUDIT_RETENTION_DAYS,
    TRACKING_PRUNE_CHUNK,
    TRACKING_RETENTION_DAYS,
    isTrackingEnabled,
} from '../constants/tracking.constant';

/**
 * Nightly retention job (ERP_TRACKING_SYSTEM_PLAN §5.4, §14.4).
 *
 * ⚠️ DO NOT reuse `SubscriptionCronService.shouldRunCron()`. That guard returns
 * `false` when `APP_MODE === 'single'` — which is exactly how this deployment
 * runs. Copying it would silently disable the prune and let `api_call_logs` grow
 * forever, and nobody would notice for months. Tracking needs its own guard.
 */
@Injectable()
export class TrackingCronService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TrackingCronService.name);

    constructor(
        private readonly apiCallLogRepository: ApiCallLogRepository,
        private readonly auditLogRepository: AuditLogRepository,
        private readonly usageDailyRollupRepository: UsageDailyRollupRepository
    ) {}

    /**
     * CATCH-UP ON BOOT. The `@Cron` below only fires if the process happens to be
     * alive at 04:00. On a server that is not up 24/7 — or is restarted before
     * 04:00, which is the norm for this deployment — that tick is simply missed,
     * and `api_call_logs` grows without bound because nothing else triggers the
     * prune. Nobody notices for weeks.
     *
     * Running the SAME rollup-then-prune shortly after startup drains whatever
     * backlog accumulated while the process was down, the moment the app is next
     * brought up, regardless of the wall clock. `rollupPendingDays()` already
     * rolls up EVERY stale day before deleting, so a single boot run is a full
     * catch-up, not just "yesterday".
     *
     * Deferred a few seconds and fire-and-forget: it must never block bootstrap
     * nor fight the connection pool during the startup rush. `unref()` so a
     * pending timer can't keep the process alive on shutdown.
     */
    onApplicationBootstrap(): void {
        if (!this.shouldRun()) return;
        const timer = setTimeout(() => {
            this.rollupThenPrune().catch((err: any) =>
                this.logger.error(
                    `startup catch-up prune failed: ${err?.message}`
                )
            );
        }, 15_000);
        timer.unref?.();
    }

    /**
     * Gate on the kill-switch, on CRON_ENABLED, and — under a multi-process PM2
     * cluster — on being instance 0, so the prune runs once and not N times.
     * Notably it does NOT consider APP_MODE: retention applies in every mode.
     */
    private shouldRun(): boolean {
        if (!isTrackingEnabled()) return false;
        if (process.env.CRON_ENABLED === 'false') return false;
        const instance = process.env.NODE_APP_INSTANCE;
        if (instance !== undefined && instance !== '0') return false;
        return true;
    }

    /**
     * ORDER MATTERS. Roll up yesterday FIRST, then prune. Prune before rollup and
     * the aggregate would summarise rows that were just deleted — silently, and
     * only for the days that happen to fall on the retention boundary.
     *
     * `usage_daily_rollups` is never pruned. It is the durable aggregate that
     * outlives the raw rows.
     */
    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async rollupThenPrune(): Promise<void> {
        if (!this.shouldRun()) return;

        // `api_call_logs` is cleared every night, so the rollup is the ONLY thing
        // that survives it. If the rollup fails, DO NOT PRUNE — a failed rollup
        // followed by a successful prune destroys that day's usage numbers
        // permanently, with nothing left to recompute them from.
        let rollupOk = false;
        try {
            await this.rollupPendingDays();
            rollupOk = true;
        } catch (err: any) {
            this.logger.error(
                `usage rollup failed — SKIPPING api_call_logs prune so the raw ` +
                    `rows survive for a manual re-run: ${err?.message}`
            );
        }

        if (rollupOk) {
            await this.pruneTable(
                'api_call_logs',
                this.apiCallLogRepository,
                TRACKING_RETENTION_DAYS
            );
        }

        // Independent of the rollup — safe to prune either way.
        await this.pruneTable(
            'audit_logs',
            this.auditLogRepository,
            AUDIT_RETENTION_DAYS
        );
    }

    /**
     * MANUAL "Clear now" trigger (API Calls tab button / POST /admin/tracking/
     * api-calls/clear). Runs the exact same rollup-then-prune the 04:00 cron runs,
     * but WITHOUT the cron-only guards (`CRON_ENABLED`, PM2 instance): a human who
     * clicked the button is an explicit "do it here and now", so it must not be
     * silently short-circuited the way a scheduled tick can be.
     *
     * Returns how many rows were deleted so the UI can confirm it actually did
     * something rather than just claiming success.
     */
    async runNow(): Promise<{ deleted: number; rolledCompanies: number }> {
        let rolledCompanies = 0;
        let rollupOk = false;
        try {
            rolledCompanies = await this.rollupPendingDays();
            rollupOk = true;
        } catch (err: any) {
            this.logger.error(
                `manual clear — rollup failed, SKIPPING api_call_logs prune so ` +
                    `the raw rows survive: ${err?.message}`
            );
        }

        const deleted = rollupOk
            ? await this.pruneTable(
                  'api_call_logs',
                  this.apiCallLogRepository,
                  TRACKING_RETENTION_DAYS
              )
            : 0;

        // Independent of the rollup — safe to prune either way.
        await this.pruneTable(
            'audit_logs',
            this.auditLogRepository,
            AUDIT_RETENTION_DAYS
        );

        return { deleted, rolledCompanies };
    }

    /** Yesterday in the server's timezone. Exposed so it can be re-run by hand. */
    async rollupYesterday(): Promise<number> {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return this.rollupDay(d.toISOString().slice(0, 10));
    }

    /**
     * Roll up EVERY whole day still in `api_call_logs`, oldest first.
     *
     * Not just yesterday. If the process was down at 04:00 the table holds two or
     * more un-aggregated days, and the prune that follows would delete all of
     * them. Each `rollupDay` is idempotent, so re-doing a day already rolled up
     * is a harmless overwrite.
     *
     * Throws on the first failure, which stops the prune (see `rollupThenPrune`).
     */
    async rollupPendingDays(): Promise<number> {
        const days = await this.apiCallLogRepository.pendingRollupDays();
        if (!days.length) {
            this.logger.log('usage rollup — nothing pending');
            return 0;
        }
        let companies = 0;
        for (const day of days) {
            companies += await this.rollupDay(day);
        }
        this.logger.log(
            `usage rollup — ${days.length} day(s): ${days.join(', ')}`
        );
        return companies;
    }

    /**
     * Aggregate one calendar day into `usage_daily_rollups`.
     * Idempotent: re-running overwrites the day rather than duplicating it.
     *
     * THROWS on failure, on purpose. The caller must know, because it decides
     * whether it is safe to delete the raw rows this aggregate was built from.
     */
    async rollupDay(day: string): Promise<number> {
        try {
            const [calls, docsByCompany] = await Promise.all([
                this.usageDailyRollupRepository.aggregateApiCalls(day),
                this.usageDailyRollupRepository.aggregateDocumentsCreated(day),
            ]);

            // A company that made no API calls but somehow produced audit rows
            // (a cron acting on its behalf) still deserves a row.
            const companyIds = new Set<string>([
                ...calls.map((c) => c.company_id),
                ...docsByCompany.keys(),
            ]);
            if (!companyIds.size) {
                this.logger.log(`usage rollup ${day} — no activity`);
                return 0;
            }

            const byCompany = new Map(calls.map((c) => [c.company_id, c]));
            const rows = Array.from(companyIds).map((companyId) => {
                const c = byCompany.get(companyId);
                return {
                    company_id: companyId,
                    day,
                    api_calls: c?.api_calls ?? 0,
                    api_errors: c?.api_errors ?? 0,
                    p95_duration_ms: c?.p95_duration_ms ?? null,
                    active_users: c?.active_users ?? 0,
                    documents_created: docsByCompany.get(companyId) ?? null,
                };
            });

            await this.usageDailyRollupRepository.upsertMany(rows as any);
            this.logger.log(
                `usage rollup ${day} — ${rows.length} company row(s)`
            );
            return rows.length;
        } catch (err: any) {
            this.logger.error(`usage rollup ${day} failed: ${err?.message}`);
            // Rethrow: `rollupThenPrune` must not delete raw rows it failed to
            // aggregate. Silently returning 0 here would look like "no activity".
            throw err;
        }
    }

    private async pruneTable(
        label: string,
        repository: {
            deleteOlderThanChunk(cutoff: Date, chunk: number): Promise<number>;
            vacuumAnalyze(): Promise<void>;
        },
        retentionDays: number
    ): Promise<number> {
        try {
            const deleted = await this.pruneOlderThan(retentionDays, repository);
            if (deleted > 0) {
                // Reclaim the pages we just freed instead of waiting for
                // autovacuum to do it during business hours.
                await repository.vacuumAnalyze();
            }
            this.logger.log(
                `${label} prune complete — ${deleted} row(s) older than ${retentionDays}d removed`
            );
            return deleted;
        } catch (err: any) {
            this.logger.error(`${label} prune failed: ${err?.message}`);
            return 0;
        }
    }

    /**
     * Chunked delete. A single unbounded DELETE over a month of rows would hold a
     * long transaction and bloat the table; looping in bounded chunks keeps each
     * statement short and lets concurrent reads through.
     *
     * Exposed (not private) so the acceptance test can invoke it directly.
     */
    async pruneOlderThan(
        days: number,
        repository: {
            deleteOlderThanChunk(cutoff: Date, chunk: number): Promise<number>;
        } = this.apiCallLogRepository
    ): Promise<number> {
        // MIDNIGHT boundary, not `now − N×24h`. Two reasons:
        //
        //  1. `days: 0` must mean "keep today", not "delete everything up to this
        //     instant" — which is what `Date.now() - 0` would do.
        //  2. A rolling 24h window leaves a ragged half-day: at 04:00 it would
        //     delete yesterday 00:00–04:00 but keep 04:00–24:00, so the table
        //     holds a partial day that no rollup describes.
        //
        // Retaining whole days keeps the raw table and the daily rollups aligned.
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - days);

        let total = 0;
        // Bounded so a pathological state can never loop forever.
        for (let pass = 0; pass < 1000; pass += 1) {
            const removed = await repository.deleteOlderThanChunk(
                cutoff,
                TRACKING_PRUNE_CHUNK
            );
            total += removed;
            if (removed < TRACKING_PRUNE_CHUNK) break;
        }
        return total;
    }
}
