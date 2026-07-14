import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
    DataSource,
    EntitySubscriberInterface,
    InsertEvent,
    RemoveEvent,
    UpdateEvent,
} from 'typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { RequestContextService } from '@common/request/services/request-context.service';
import {
    AuditLogEntity,
    AuditChangeMap,
    ENUM_AUDIT_ACTION,
} from '../repository/entities/audit-log.entity';
import {
    AUDIT_ENTITY_ALLOWLIST,
    AUDIT_LABEL_FIELDS,
    AUDIT_VALUE_MAX_LEN,
    TRACKING_OWN_ENTITIES,
    auditColumnIsSensitive,
    isTrackingEnabled,
} from '../constants/tracking.constant';

/**
 * Writes an audit row for every create / update / delete of an allowlisted
 * business entity (ERP_TRACKING_SYSTEM_PLAN §5.2).
 *
 * Using a subscriber rather than hand-instrumenting 40 services is the whole
 * point: `event.updatedColumns` tells us exactly which columns TypeORM wrote,
 * and `event.databaseEntity` holds the pre-image — so the {from, to} diff costs
 * no extra SELECT.
 *
 * THREE INVARIANTS, each of which would take the app down if broken:
 *
 *   1. NEVER RECURSE. Writing an audit row is an INSERT, which fires
 *      afterInsert. Tracking's own entities are hard-excluded first, before the
 *      allowlist is even consulted.
 *
 *   2. NEVER THROW. A subscriber exception propagates into the caller's
 *      transaction and rolls back the user's save. All fallible work (label
 *      lookup, diffing, serialisation) happens BEFORE the insert, wrapped in
 *      try/catch. The insert itself is the only awaited statement.
 *
 *   3. SAME TRANSACTION. Write via `event.manager`, never a fresh repository.
 *      Otherwise a rolled-back save leaves a phantom audit row claiming a change
 *      that never happened.
 */
/**
 * NOTE: deliberately NOT decorated with `@EventSubscriber()`. That decorator
 * registers the class in TypeORM's global metadata storage; we instead push this
 * DI-constructed *instance* onto `dataSource.subscribers` below. Doing both risks
 * a double registration — and two audit rows for every change.
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
    private readonly logger = new Logger(AuditSubscriber.name);

    constructor(
        @InjectDataSource(DATABASE_CONNECTION_NAME)
        dataSource: DataSource,
        private readonly requestContext: RequestContextService
    ) {
        // Registering here (rather than in the DataSource options) keeps DI
        // intact — the subscriber needs RequestContextService.
        dataSource.subscribers.push(this);
    }

    async afterInsert(event: InsertEvent<any>): Promise<void> {
        await this.write(event.metadata.name, event.entity, event, {
            action: ENUM_AUDIT_ACTION.CREATE,
            changes: null,
        });
    }

    async afterUpdate(event: UpdateEvent<any>): Promise<void> {
        const name = event.metadata.name;
        if (this.skip(name)) return;

        const changes = this.buildDiff(event);
        // Nothing meaningful changed (only denylisted/noise columns) — writing a
        // row with an empty diff would be pure noise in the activity feed.
        if (!changes || !Object.keys(changes).length) return;

        // A soft delete is an update of `deleted`/`soft_delete`, not a DELETE.
        const softDeleted =
            (event.entity as any)?.soft_delete === true ||
            (event.entity as any)?.deleted === true;

        await this.write(name, event.entity ?? event.databaseEntity, event, {
            action: softDeleted
                ? ENUM_AUDIT_ACTION.SOFT_DELETE
                : ENUM_AUDIT_ACTION.UPDATE,
            changes,
        });
    }

    async afterRemove(event: RemoveEvent<any>): Promise<void> {
        await this.write(
            event.metadata.name,
            event.entity ?? event.databaseEntity,
            event,
            { action: ENUM_AUDIT_ACTION.DELETE, changes: null }
        );
    }

    // ── internals ───────────────────────────────────────────────────────

    /** Invariant 1 first, then the kill-switch, then the allowlist. */
    private skip(entityName: string): boolean {
        if (TRACKING_OWN_ENTITIES.has(entityName)) return true;
        if (!isTrackingEnabled()) return true;
        return !AUDIT_ENTITY_ALLOWLIST.has(entityName);
    }

    private async write(
        entityName: string,
        entity: any,
        event: InsertEvent<any> | UpdateEvent<any> | RemoveEvent<any>,
        payload: { action: ENUM_AUDIT_ACTION; changes: AuditChangeMap | null }
    ): Promise<void> {
        if (this.skip(entityName)) return;

        let row: Partial<AuditLogEntity>;
        try {
            const entityId = entity?._id ?? (event as RemoveEvent<any>).entityId;
            // No id ⇒ nothing to anchor the history to. Silently skip.
            if (!entityId) return;

            const ctx = this.requestContext.resolve();
            row = {
                request_id: ctx?.requestId,
                // Prefer the entity's own company over the actor's, so a
                // SUPER_ADMIN editing a tenant's document files the row under the
                // tenant.
                company_id: entity?.company_id ?? ctx?.companyId,
                user_id: ctx?.userId,
                action: payload.action,
                entity_name: entityName,
                entity_id: String(entityId),
                entity_label: this.buildLabel(entity),
                changes: payload.changes ?? undefined,
            };
        } catch (err: any) {
            // Invariant 2: everything fallible lives above this line.
            this.logger.warn(
                `audit skipped for ${entityName}: ${err?.message}`
            );
            return;
        }

        // COALESCE PER REQUEST.
        //
        // One user action often means several saves. `QuotationService.update()`
        // saves the header (:380), then `recalcTotals()` saves it again (:703).
        // Naively that writes two audit rows for one edit — the second showing
        // derived churn (grand_total, margin_amount) rather than what the user
        // did. Instead, merge into the row this request already wrote: keep the
        // ORIGINAL `from`, take the LATEST `to`, and drop fields that end up
        // back where they started.
        //
        // Cheap: one indexed lookup, and only for writes we already decided to
        // audit. Skipped entirely for creates and for system writes with no
        // request_id.
        if (row.request_id && payload.changes) {
            const existing = await event.manager.findOne(AuditLogEntity, {
                where: {
                    request_id: row.request_id,
                    entity_id: row.entity_id,
                    action: row.action,
                },
            });
            if (existing) {
                const merged = this.mergeChanges(
                    existing.changes ?? {},
                    payload.changes
                );
                if (!Object.keys(merged).length) {
                    // The net effect of this request was nothing. Drop the row
                    // rather than leave "changed X from 5 to 5" in the history.
                    await event.manager.delete(AuditLogEntity, existing._id);
                    return;
                }
                await event.manager.update(AuditLogEntity, existing._id, {
                    changes: merged,
                    entity_label: row.entity_label ?? existing.entity_label,
                });
                return;
            }
        }

        // Invariant 3: the caller's transaction. If this fails the user's write
        // correctly rolls back — the right outcome for an ERP that claims an
        // audit trail.
        await event.manager.insert(AuditLogEntity, row as any);
    }

    /** Earliest `from`, latest `to`, no-op fields removed. */
    private mergeChanges(
        existing: AuditChangeMap,
        incoming: AuditChangeMap
    ): AuditChangeMap {
        const merged: AuditChangeMap = { ...existing };
        for (const [field, delta] of Object.entries(incoming)) {
            merged[field] = merged[field]
                ? { from: merged[field].from, to: delta.to }
                : delta;
        }
        for (const [field, delta] of Object.entries(merged)) {
            if (this.sameValue(delta.from, delta.to)) delete merged[field];
        }
        return merged;
    }

    /**
     * Only columns TypeORM actually wrote, minus secrets and noise.
     * `databaseEntity` is the pre-image; it is absent for QueryBuilder updates,
     * in which case `from` is undefined and we still record the new value.
     */
    private buildDiff(event: UpdateEvent<any>): AuditChangeMap | null {
        const updated = event.updatedColumns ?? [];
        if (!updated.length) return null;

        const changes: AuditChangeMap = {};
        for (const column of updated) {
            const prop = column.propertyName;
            if (auditColumnIsSensitive(prop)) continue;

            const from = (event.databaseEntity as any)?.[prop];
            const to = (event.entity as any)?.[prop];
            if (this.sameValue(from, to)) continue;

            changes[prop] = {
                from: this.clip(from),
                to: this.clip(to),
            };
        }
        return changes;
    }

    /**
     * Numeric columns come back from Postgres as strings ("10.00") but are set as
     * numbers (10) — a naive !== would log a change on every save.
     */
    private sameValue(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a == null && b == null) return true;
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        if (
            (typeof a === 'number' || typeof a === 'string') &&
            (typeof b === 'number' || typeof b === 'string')
        ) {
            const na = Number(a);
            const nb = Number(b);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
            return String(a) === String(b);
        }
        return false;
    }

    /** An audit row is not a blob store. */
    private clip(value: unknown): unknown {
        if (typeof value !== 'string') return value ?? null;
        return value.length > AUDIT_VALUE_MAX_LEN
            ? `${value.slice(0, AUDIT_VALUE_MAX_LEN)}…`
            : value;
    }

    private buildLabel(entity: any): string | undefined {
        if (!entity) return undefined;
        for (const field of AUDIT_LABEL_FIELDS) {
            const value = entity[field];
            if (typeof value === 'string' && value.trim()) {
                return value.slice(0, 120);
            }
        }
        return undefined;
    }
}
