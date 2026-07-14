import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ApiCallLogRepository } from '../repository/repositories/api-call-log.repository';
import { IApiCallLogRow } from '../interfaces/tracking.interface';
import {
    TRACKING_FLUSH_INTERVAL_MS,
    TRACKING_FLUSH_ROWS,
    TRACKING_MAX_BUFFER,
} from '../constants/tracking.constant';

/**
 * Buffers telemetry rows in memory and writes them as one multi-row INSERT
 * (ERP_TRACKING_SYSTEM_PLAN §14.2).
 *
 * WHY NOT one INSERT per request: the datasource sets no pool options
 * (`common/database/services/database.options.service.ts`), so node-postgres
 * defaults to 10 connections. A per-request INSERT would check one out on every
 * call, contending with real user queries. The symptom would not be "telemetry is
 * slow" — it would be "the ERP is slow, waiting on a connection". Buffering drops
 * pool usage from one connection per request to one per flush interval.
 *
 * Trade-off, accepted: up to TRACKING_FLUSH_INTERVAL_MS of telemetry is lost if
 * the process is SIGKILLed. Graceful shutdown flushes the tail.
 */
@Injectable()
export class ApiCallLogService implements OnApplicationShutdown {
    private readonly logger = new Logger(ApiCallLogService.name);

    private buffer: IApiCallLogRow[] = [];
    /** Guards against a slow flush overlapping the next interval tick. */
    private flushing = false;
    /** Rows dropped because the buffer was full. Logged once per flush, not per drop. */
    private shed = 0;

    constructor(private readonly apiCallLogRepository: ApiCallLogRepository) {}

    /**
     * Hot path — called once per request, from `res.on('finish')`.
     * Synchronous, allocation-light, and cannot throw.
     */
    record(row: IApiCallLogRow): void {
        // Shed rather than grow without bound. If the DB is unreachable the
        // buffer would otherwise climb until the heap dies, taking the ERP with
        // it. Losing telemetry is the correct failure.
        if (this.buffer.length >= TRACKING_MAX_BUFFER) {
            this.shed += 1;
            return;
        }
        this.buffer.push(row);
        if (this.buffer.length >= TRACKING_FLUSH_ROWS) {
            void this.flush();
        }
    }

    @Interval(TRACKING_FLUSH_INTERVAL_MS)
    async flushOnInterval(): Promise<void> {
        await this.flush();
    }

    /**
     * Drain the buffer into one INSERT. Never rejects — a telemetry failure must
     * never surface anywhere near a user request.
     */
    async flush(): Promise<void> {
        if (this.flushing || !this.buffer.length) return;
        this.flushing = true;

        // Detach the batch BEFORE awaiting, so rows recorded during the INSERT
        // land in the next batch instead of being dropped by the splice.
        const rows = this.buffer;
        this.buffer = [];

        if (this.shed > 0) {
            this.logger.warn(
                `api_call_logs buffer full — shed ${this.shed} row(s)`
            );
            this.shed = 0;
        }

        try {
            await this.apiCallLogRepository.insertMany(rows);
        } catch (err: any) {
            // Do NOT re-queue: a poison row would retry forever and the buffer
            // would grow. Telemetry is lossy by design.
            this.logger.warn(
                `api_call_logs flush dropped ${rows.length} row(s): ${err?.message}`
            );
        } finally {
            this.flushing = false;
        }
    }

    /**
     * Flush the tail on a graceful restart.
     *
     * NOTE: `main.ts` does not currently call `app.enableShutdownHooks()`, so
     * this does NOT fire today — up to one flush interval (2 s) of telemetry is
     * lost on every restart. That is acceptable for a lossy log table, and
     * enabling shutdown hooks is an app-wide behaviour change (it installs
     * SIGTERM/SIGINT handlers and runs every module's destroy hook), which does
     * not belong in this feature's diff. The hook is implemented so it starts
     * working the moment someone opts in.
     */
    async onApplicationShutdown(): Promise<void> {
        await this.flush();
    }

    /** Test/diagnostic hook. */
    get bufferedCount(): number {
        return this.buffer.length;
    }
}
