import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';

import { StockMovementRepository } from '../repository/repositories/stock-movement.repository';
import { StockMovementEntity } from '../repository/entities/stock-movement.entity';
import {
    ENUM_STOCK_MOVEMENT_TYPE,
    ORIGINAL_MOVEMENT_TYPES,
} from '../enums/stock-movement.enum';

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export interface StockMovementInput {
    product_id: string;
    location_id?: string | null;
    qty: number; // signed: + IN, − OUT
    movement_type: ENUM_STOCK_MOVEMENT_TYPE;
    source_type: 'grn' | 'invoice' | 'manual';
    source_id?: string;
    source_line_id?: string;
    source_voucher_no?: string;
    notes?: string;
    created_by?: string;
    /** The document's own business date (GRN's grn_date / invoice's
     *  invoice_date) — defaults to today when omitted (a live movement's
     *  business date IS today). A historical-import posting must pass this
     *  explicitly so period-scoped reports place it in the right period. */
    movement_date?: string;
}

/**
 * The single source of truth for on-hand stock. Everything reads `SUM(qty)`
 * from the `stock_movements` ledger; nothing maintains a cached balance.
 *
 * - `post`    → write one signed movement (caller ensures one-per-source-line).
 * - `reverse` → cancel a source doc by posting opposite-sign rows (audit-safe,
 *               never hard-deletes).
 * - `onHand` / `onHandMap` → current balance for one / many products.
 */
@Injectable()
export class StockLedgerService {
    constructor(
        private readonly movementRepository: StockMovementRepository,
        @InjectDatabaseConnection() private readonly dataSource: DataSource
    ) {}

    async post(
        companyId: string,
        m: StockMovementInput
    ): Promise<StockMovementEntity> {
        return this.movementRepository.create({
            company_id: companyId,
            location_id: m.location_id ?? null,
            product_id: m.product_id,
            qty: String(m.qty),
            movement_type: m.movement_type,
            source_type: m.source_type,
            source_id: m.source_id ?? null,
            source_line_id: m.source_line_id ?? null,
            source_voucher_no: m.source_voucher_no ?? null,
            notes: m.notes ?? null,
            createdBy: m.created_by ?? null,
            movement_date:
                m.movement_date || new Date().toISOString().slice(0, 10),
        } as any);
    }

    /**
     * Reverse every ORIGINAL movement (grn_in / sale_out) posted for a source
     * doc by writing opposite-sign rows. Reversal rows themselves are skipped,
     * so the net effect of source becomes zero. Idempotency is the caller's
     * job (cancel runs once per doc).
     */
    async reverse(
        companyId: string,
        sourceType: 'grn' | 'invoice',
        sourceId: string,
        reversalType: ENUM_STOCK_MOVEMENT_TYPE,
        reason?: string,
        userId?: string,
        movementDate?: string
    ): Promise<void> {
        const movements = await this.movementRepository.findBySource(
            sourceType,
            sourceId
        );
        const originals = movements.filter((mv) =>
            ORIGINAL_MOVEMENT_TYPES.includes(
                mv.movement_type as ENUM_STOCK_MOVEMENT_TYPE
            )
        );
        for (const mv of originals) {
            await this.post(companyId, {
                product_id: mv.product_id,
                location_id: mv.location_id ?? null,
                qty: -num(mv.qty),
                movement_type: reversalType,
                source_type: sourceType,
                source_id: sourceId,
                source_line_id: mv.source_line_id,
                source_voucher_no: mv.source_voucher_no,
                notes: reason,
                created_by: userId,
                movement_date: movementDate,
            });
        }
    }

    async onHand(
        companyId: string,
        productId: string,
        locationId?: string | null
    ): Promise<number> {
        const map = await this.onHandMap(companyId, [productId], locationId);
        return map.get(productId) || 0;
    }

    async onHandMap(
        companyId: string,
        productIds: string[],
        locationId?: string | null
    ): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        const ids = [...new Set((productIds || []).filter(Boolean))];
        if (!ids.length) return result;

        const params: any[] = [companyId, ids];
        let locClause = '';
        if (locationId) {
            params.push(locationId);
            locClause = 'AND location_id = $3';
        }
        const rows = await this.dataSource.query(
            `SELECT product_id, COALESCE(SUM(qty), 0)::float8 AS on_hand
             FROM stock_movements
             WHERE company_id = $1
               AND deleted = false
               AND product_id = ANY($2)
               ${locClause}
             GROUP BY product_id`,
            params
        );
        for (const r of rows) {
            result.set(r.product_id, num(r.on_hand));
        }
        return result;
    }

    /**
     * "Truly free" on-hand per product = stock on hand NOT committed to an
     * active Sales Order. Two sources are free:
     *   1. standalone POV receipts (no SO line — bought to general inventory);
     *   2. receipts whose Sales Order was CANCELLED (the commitment is gone, so
     *      the goods, which stay on hand, are released back to free stock).
     * Stock received against a still-active SO line is committed to it and must
     * NOT reduce a fresh procurement requirement — counting it was the
     * double-count that under-procured a partially received order.
     *
     *   free = min(on_hand, free_source_received)
     *
     * The `min` self-corrects: once free stock is invoiced / sold out, on-hand
     * drops below the historical free-received total and caps free; with no
     * free-source stock, free is 0 (buy the full shortfall). It also ignores
     * invoiced-out SO receipts automatically — on-hand already reflects the
     * sale-out, so they never inflate the figure.
     */
    async freeOnHandMap(
        companyId: string,
        productIds: string[],
        locationId?: string | null
    ): Promise<Map<string, number>> {
        const onHand = await this.onHandMap(companyId, productIds, locationId);
        const ids = [...new Set((productIds || []).filter(Boolean))];
        if (!ids.length) return onHand;

        const rows = await this.dataSource.query(
            `SELECT pvl.product_id AS product_id,
                    COALESCE(SUM(pvl.received_qty), 0)::float8 AS free_received
             FROM po_vendor_lines pvl
             JOIN po_vendors pv ON pv._id = pvl.po_vendor_id
             LEFT JOIN purchase_orders po ON po._id = pv.purchase_order_id
             WHERE pv.company_id = $1
               AND pv.status <> 'cancelled'
               AND pv.soft_delete = false
               AND (
                    pvl.purchase_order_line_id IS NULL
                    OR po.status = 'cancelled'
               )
               AND pvl.product_id = ANY($2)
             GROUP BY pvl.product_id`,
            [companyId, ids]
        );
        const freeReceived = new Map<string, number>();
        for (const r of rows)
            freeReceived.set(r.product_id, num(r.free_received));

        const free = new Map<string, number>();
        for (const pid of ids) {
            const oh = onHand.get(pid) || 0;
            const fr = freeReceived.get(pid) || 0;
            free.set(pid, Math.max(0, Math.round(Math.min(oh, fr) * 1e4) / 1e4));
        }
        return free;
    }
}
