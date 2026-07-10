import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '@common/request/services/request-context.service';
import { AuditLogRepository } from '../repository/repositories/audit-log.repository';
import {
    AuditLogEntity,
    ENUM_AUDIT_ACTION,
} from '../repository/entities/audit-log.entity';
import { isTrackingEnabled } from '../constants/tracking.constant';

export interface IAuditSummaryInput {
    /** What kind of thing was touched, e.g. `PriceListEntity`. */
    entity_name: string;
    /** Human label for the feed, e.g. "Aarti Chemson — 500 prices". */
    entity_label?: string;
    /** Anchor id (the vendor, the file, the parent doc). */
    entity_id?: string;
    /** Free-form counts: `{ created: 480, updated: 20, failed: 0 }`. */
    summary: Record<string, unknown>;
    action?: ENUM_AUDIT_ACTION;
    company_id?: string;
    user_id?: string;
}

/**
 * Records ONE audit row for a bulk operation, instead of the N rows the
 * subscriber would write if the underlying entity were on the allowlist.
 *
 * WHY: a price-list Excel import writes one `PriceListEntity` row per
 * vendor-product price. Auditing that entity row-by-row would turn a single
 * business action ("Rakesh imported 500 prices") into 500 history entries and
 * bury every other change in the feed. Same reasoning that keeps `*LineEntity`
 * off the allowlist.
 *
 * Call this from the service that performs the bulk write, AFTER it succeeds.
 * Like everything in tracking, it is fire-and-forget: a failure here must never
 * fail the import the user just ran.
 */
@Injectable()
export class AuditLogService {
    private readonly logger = new Logger(AuditLogService.name);

    constructor(
        private readonly auditLogRepository: AuditLogRepository,
        private readonly requestContext: RequestContextService
    ) {}

    /**
     * Fire-and-forget. Returns void, never rejects — the caller should not have
     * to `await` or `try` around an audit write.
     */
    recordSummary(input: IAuditSummaryInput): void {
        if (!isTrackingEnabled()) return;
        void this.write(input).catch((err) =>
            this.logger.warn(`audit summary skipped: ${err?.message}`)
        );
    }

    private async write(input: IAuditSummaryInput): Promise<void> {
        const ctx = this.requestContext.resolve();
        const row: Partial<AuditLogEntity> = {
            request_id: ctx?.requestId,
            company_id: input.company_id ?? ctx?.companyId,
            user_id: input.user_id ?? ctx?.userId,
            action: input.action ?? ENUM_AUDIT_ACTION.IMPORT,
            entity_name: input.entity_name,
            // A summary has no single row to anchor to, so entity_id may be a
            // parent (the vendor) or absent. The column is NOT NULL, so fall back
            // to the all-zero uuid rather than failing the insert.
            entity_id: input.entity_id ?? EMPTY_UUID,
            entity_label: input.entity_label?.slice(0, 120),
            // Reuse `changes` as the summary payload — same jsonb column, so the
            // console renders it with the existing diff viewer.
            changes: input.summary as any,
        };
        await this.auditLogRepository.create(row as any);
    }
}

/** Sentinel for summary rows that have no single owning record. */
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
