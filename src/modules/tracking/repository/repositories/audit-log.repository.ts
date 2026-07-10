import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { AuditLogEntity } from '../entities/audit-log.entity';

/**
 * Reads and prunes `audit_logs`. Writes go through `AuditSubscriber` using the
 * caller's `event.manager`, NOT this repository — an audit row must live or die
 * with the transaction that produced it.
 */
@Injectable()
export class AuditLogRepository extends DatabaseObjectIdRepositoryBase<AuditLogEntity> {
    constructor(
        @InjectDatabaseModel(AuditLogEntity)
        private readonly auditLogRepository: Repository<AuditLogEntity>
    ) {
        super(auditLogRepository);
    }

    /** Read side (Phase 3). `_repository` is protected on the base, so the query
     *  service reaches the builder through here rather than widening the base. */
    queryBuilder(alias: string) {
        return this._repository.createQueryBuilder(alias);
    }

    /** Chunked delete — same reasoning as the telemetry prune (plan §14.4). */
    async deleteOlderThanChunk(cutoff: Date, chunk: number): Promise<number> {
        const table = this._repository.metadata.tableName;
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

    async vacuumAnalyze(): Promise<void> {
        await this._repository.query(
            `VACUUM (ANALYZE) ${this._repository.metadata.tableName}`
        );
    }
}
