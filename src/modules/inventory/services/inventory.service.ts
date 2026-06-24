import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';

import { InventoryListResponseDto } from '../dtos/response/inventory-list.response.dto';
import { InventoryReceiptDetailResponseDto } from '../dtos/response/inventory-receipt-detail.response.dto';
import { InventoryStatsResponseDto } from '../dtos/response/inventory-stats.response.dto';

export interface InventoryListFilters {
    search?: string;
    category_id?: string;
    po_id?: string;
    pov_id?: string;
    vendor_id?: string;
    // Deliver-to location (Locations master id). Stored on the POV/SO under
    // the `delivery_address_id` column since the 2026-05-22 ship-to refactor.
    location_id?: string;
    date_from?: string;
    date_to?: string;
    min_qty?: number;
    limit: number;
    offset: number;
    orderBy?: string;
    orderDirection?: string;
}

// Stats use the same filter set as the list, minus paging/sorting.
export type InventoryStatsFilters = Omit<
    InventoryListFilters,
    'limit' | 'offset' | 'orderBy' | 'orderDirection'
>;

// Ledger-driven per-product on-hand summary.
export interface StockSummaryFilters {
    search?: string;
    category_id?: string;
    location_id?: string;
    in_stock_only?: boolean; // on-hand > 0
    non_positive_only?: boolean; // on-hand <= 0 (negative/zero)
    limit: number;
    offset: number;
    orderBy?: string;
    orderDirection?: string;
}

// Whitelist of sortable columns → real SQL expressions. Prevents SQL
// injection via the orderBy query param.
const ORDER_COLUMNS: Record<string, string> = {
    arrival_date: 'COALESCE(pv.actual_arrival_date, pv."updatedAt")',
    product_code: 'p.code',
    product_name: 'p.name',
    received_qty: 'COALESCE(pvl.received_qty, 0)',
    accepted_qty: 'COALESCE(pvl.received_qty, 0)',
    vendor_name: 'v.company_name',
    po_voucher_no: 'po.voucher_no',
    pov_voucher_no: 'pv.voucher_no',
};

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class InventoryService {
    constructor(
        @InjectDatabaseConnection() private readonly dataSource: DataSource
    ) {}

    // The join chain shared by the count + page queries. Driving table is
    // po_vendor_lines (one row per received product per POV).
    //
    // On-hand stock = `pvl.received_qty` (the good received qty, rejected
    // excluded — same number the POV coverage shows). `acc` only sums the
    // confirmed GRN accepted / rejected qty for the detail display.
    private readonly FROM_JOINS = `
        FROM po_vendor_lines pvl
        LEFT JOIN po_vendors pv      ON pv._id = pvl.po_vendor_id
        LEFT JOIN purchase_orders po ON po._id = pv.purchase_order_id
        LEFT JOIN products p         ON p._id = pvl.product_id
        LEFT JOIN categories c       ON c._id = p.category_id
        LEFT JOIN vendors v          ON v._id = pv.vendor_id
        LEFT JOIN (
            SELECT gl.po_vendor_line_id AS pov_line_id,
                   SUM(gl.accepted_qty)  AS accepted_qty,
                   SUM(gl.rejected_qty)  AS rejected_qty
            FROM grn_lines gl
            JOIN grns g ON g._id = gl.grn_id
            WHERE g.status = 'confirmed' AND g.soft_delete = false
            GROUP BY gl.po_vendor_line_id
        ) acc ON acc.pov_line_id = pvl._id`;

    /**
     * Builds the shared WHERE clause + positional params for the stock
     * register. Used by both the paginated list and the KPI stats so they
     * always describe the exact same filtered set. Returns `whereSql` and the
     * params array (companyId is always $1); callers append their own params
     * (limit/offset) starting at `params.length + 1`.
     */
    private buildWhere(
        companyId: string,
        filters: InventoryStatsFilters
    ): { whereSql: string; params: any[] } {
        const where: string[] = [
            'pv.company_id = $1',
            // Any non-cancelled POV with accepted stock — includes still-open
            // (dispatched) POVs that have a confirmed GRN, so partial receipts
            // are visible without waiting for the POV to fully close.
            "pv.status <> 'cancelled'",
            'pv.soft_delete = false',
            // Stock = the POV line's received (good) qty — the same number the
            // POV coverage shows. Rejected goods are excluded from received_qty.
            'COALESCE(pvl.received_qty, 0) > 0',
        ];
        const params: any[] = [companyId];
        let i = 2;

        if (filters.search) {
            where.push(
                `(p.code ILIKE $${i} OR p.name ILIKE $${i} OR po.voucher_no ILIKE $${i} OR pv.voucher_no ILIKE $${i})`
            );
            params.push(`%${filters.search}%`);
            i++;
        }
        if (filters.category_id) {
            where.push(`p.category_id = $${i}`);
            params.push(filters.category_id);
            i++;
        }
        if (filters.po_id) {
            where.push(`po._id = $${i}`);
            params.push(filters.po_id);
            i++;
        }
        if (filters.pov_id) {
            where.push(`pv._id = $${i}`);
            params.push(filters.pov_id);
            i++;
        }
        if (filters.vendor_id) {
            where.push(`pv.vendor_id = $${i}`);
            params.push(filters.vendor_id);
            i++;
        }
        if (filters.location_id) {
            // POV snapshots the SO's deliver-to location; fall back to the SO.
            where.push(
                `COALESCE(pv.delivery_address_id, po.delivery_address_id) = $${i}`
            );
            params.push(filters.location_id);
            i++;
        }
        if (filters.date_from) {
            where.push(
                `COALESCE(pv.actual_arrival_date, pv."updatedAt") >= $${i}`
            );
            params.push(filters.date_from);
            i++;
        }
        if (filters.date_to) {
            where.push(
                `COALESCE(pv.actual_arrival_date, pv."updatedAt") <= $${i}`
            );
            params.push(filters.date_to);
            i++;
        }
        if (filters.min_qty != null && !Number.isNaN(filters.min_qty)) {
            where.push(`COALESCE(pvl.received_qty, 0) >= $${i}`);
            params.push(filters.min_qty);
            i++;
        }

        return { whereSql: where.join(' AND '), params };
    }

    /**
     * Paginated stock register. A POV line qualifies when its parent POV is
     * non-cancelled and it has QC-accepted qty from confirmed GRNs (> 0) —
     * so partial receipts on still-open POVs are included. Filters compose —
     * only the WHERE clauses with values are appended.
     */
    async list(
        companyId: string,
        filters: InventoryListFilters
    ): Promise<{ rows: InventoryListResponseDto[]; total: number }> {
        const { whereSql, params } = this.buildWhere(companyId, filters);

        const countRows = await this.dataSource.query(
            `SELECT COUNT(*)::int AS total ${this.FROM_JOINS} WHERE ${whereSql}`,
            params
        );
        const total = countRows?.[0]?.total || 0;

        const orderCol =
            ORDER_COLUMNS[filters.orderBy] || ORDER_COLUMNS.arrival_date;
        const orderDir =
            (filters.orderDirection || 'DESC').toUpperCase() === 'ASC'
                ? 'ASC'
                : 'DESC';

        const limitIdx = params.length + 1;
        const offsetIdx = params.length + 2;
        const rows = await this.dataSource.query(
            `SELECT
                pvl._id            AS pov_line_id,
                pvl.received_qty           AS received_qty,
                COALESCE(acc.accepted_qty, 0) AS accepted_qty,
                COALESCE(acc.rejected_qty, 0) AS rejected_qty,
                p._id              AS product_id,
                p.code             AS product_code,
                p.name             AS product_name,
                p.unit_of_measure  AS uom,
                c.name             AS category_name,
                po._id             AS po_id,
                po.voucher_no      AS po_voucher_no,
                pv._id             AS pov_id,
                pv.voucher_no      AS pov_voucher_no,
                COALESCE(pv.actual_arrival_date, pv."updatedAt") AS arrival_date,
                v.company_name     AS vendor_name
             ${this.FROM_JOINS}
             WHERE ${whereSql}
             ORDER BY ${orderCol} ${orderDir}, pvl._id ASC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            [...params, filters.limit, filters.offset]
        );

        return { rows, total };
    }

    /**
     * KPI aggregates for the listing header cards, over the SAME filtered set
     * as `list` (location / category / vendor / date / search all apply).
     *
     * - stock_value   = Σ(received_qty × unit_price), in INR (vendor purchase
     *   price). A goods-inward valuation — what has been received & accepted,
     *   not yet net of invoiced-out qty (the stock-movement ledger handles
     *   that once built).
     * - line_count    = number of receipt lines (matches the list total).
     * - product_count = distinct products (SKUs) in stock.
     * - vendor_count  = distinct vendors supplying the current stock.
     */
    async stats(
        companyId: string,
        filters: InventoryStatsFilters
    ): Promise<InventoryStatsResponseDto> {
        const { whereSql, params } = this.buildWhere(companyId, filters);

        const rows = await this.dataSource.query(
            `SELECT
                COALESCE(SUM(COALESCE(pvl.received_qty, 0) * COALESCE(pvl.unit_price, 0)), 0) AS stock_value,
                COUNT(*)::int                  AS line_count,
                COUNT(DISTINCT p._id)::int     AS product_count,
                COUNT(DISTINCT pv.vendor_id)::int AS vendor_count
             ${this.FROM_JOINS}
             WHERE ${whereSql}`,
            params
        );

        const r = rows?.[0] || {};
        return {
            stock_value: String(r.stock_value ?? '0'),
            line_count: r.line_count ?? 0,
            product_count: r.product_count ?? 0,
            vendor_count: r.vendor_count ?? 0,
        };
    }

    /**
     * Full receipt detail for the modal. Validates the line still belongs
     * to a non-cancelled POV in this company — a bookmarked link to a since-
     * cancelled receipt 404s so the FE can show "no longer valid".
     */
    async getReceiptDetail(
        companyId: string,
        povLineId: string
    ): Promise<InventoryReceiptDetailResponseDto> {
        const rows = await this.dataSource.query(
            `SELECT
                p.code             AS product_code,
                p.name             AS product_name,
                c.name             AS category_name,
                p.unit_of_measure  AS uom,
                p.hsn_code         AS hsn_code,

                pv._id                 AS pov_id,
                pv.voucher_no          AS pov_voucher_no,
                pv.status              AS status,
                pv.dispatch_date       AS dispatch_date,
                pv.actual_arrival_date AS actual_arrival_date,
                pv.transporter_name    AS transporter_name,
                pv.vehicle_no          AS vehicle_no,
                pv.lr_no               AS lr_no,
                pv.currency_code       AS pov_currency_code,
                v.company_name         AS vendor_name,

                pvl.ordered_qty    AS ordered_qty,
                pvl.dispatched_qty AS dispatched_qty,
                pvl.received_qty   AS received_qty,
                COALESCE(acc.accepted_qty, 0) AS accepted_qty,
                COALESCE(acc.rejected_qty, 0) AS rejected_qty,
                pvl.unit_price     AS unit_price,
                pvl.line_total     AS line_total,

                po._id           AS po_id,
                po.voucher_no    AS po_voucher_no,
                po.currency_code AS po_currency_code,
                po.exchange_rate AS po_exchange_rate,
                po.delivery_address AS delivery_address,
                cust.company_name   AS customer_name,

                pfi._id        AS pfi_id,
                pfi.voucher_no AS pfi_voucher_no,
                q._id          AS quotation_id,
                q.voucher_no   AS quotation_voucher_no,
                l._id          AS lead_id,
                l.company_name AS lead_name
             FROM po_vendor_lines pvl
             LEFT JOIN po_vendors pv      ON pv._id = pvl.po_vendor_id
             LEFT JOIN purchase_orders po ON po._id = pv.purchase_order_id
             LEFT JOIN pfis pfi           ON pfi._id = po.pfi_id
             LEFT JOIN quotations q       ON q._id = po.quotation_id
             LEFT JOIN leads l            ON l._id = q.lead_id
             LEFT JOIN products p         ON p._id = pvl.product_id
             LEFT JOIN categories c       ON c._id = p.category_id
             LEFT JOIN vendors v          ON v._id = pv.vendor_id
             LEFT JOIN customers cust     ON cust._id = po.customer_id
             LEFT JOIN (
                SELECT gl.po_vendor_line_id AS pov_line_id,
                       SUM(gl.accepted_qty)  AS accepted_qty,
                       SUM(gl.rejected_qty)  AS rejected_qty
                FROM grn_lines gl
                JOIN grns g ON g._id = gl.grn_id
                WHERE g.status = 'confirmed' AND g.soft_delete = false
                GROUP BY gl.po_vendor_line_id
             ) acc ON acc.pov_line_id = pvl._id
             WHERE pvl._id = $1 AND pv.company_id = $2`,
            [povLineId, companyId]
        );

        const row = rows?.[0];
        // Valid while the POV exists and isn't cancelled — a since-cancelled
        // receipt 404s so the FE can show "no longer valid".
        if (!row || row.status === 'cancelled') {
            throw new NotFoundException('inventory.receiptNotFound');
        }

        // Short qty = dispatched − received (the shortfall on receipt).
        const shortQty = num(row.dispatched_qty) - num(row.received_qty);

        // Short reason: parse the latest POV_RECEIVED tracking event body
        // for a "Reason: …" fragment (only present on partial receipts).
        let shortReason: string | null = null;
        if (shortQty > 0) {
            const events = await this.dataSource.query(
                `SELECT notes
                 FROM po_vendor_tracking_events
                 WHERE po_vendor_id = $1 AND event_type = 'pov_received'
                 ORDER BY event_at DESC
                 LIMIT 1`,
                [row.pov_id]
            );
            const notes: string = events?.[0]?.notes || '';
            const match = notes.match(/Reason:\s*(.+?)(?:\s·|$)/i);
            shortReason = match?.[1]?.trim() || null;
        }

        return {
            product: {
                code: row.product_code,
                name: row.product_name,
                category_name: row.category_name,
                uom: row.uom,
                hsn_code: row.hsn_code,
            },
            receipt: {
                pov_id: row.pov_id,
                pov_voucher_no: row.pov_voucher_no,
                status: row.status,
                dispatch_date: row.dispatch_date,
                actual_arrival_date: row.actual_arrival_date,
                vendor_name: row.vendor_name,
                transporter_name: row.transporter_name,
                vehicle_no: row.vehicle_no,
                lr_no: row.lr_no,
                ordered_qty: row.ordered_qty,
                dispatched_qty: row.dispatched_qty,
                received_qty: row.received_qty,
                accepted_qty: row.accepted_qty,
                rejected_qty: row.rejected_qty,
                short_qty: shortQty > 0 ? String(shortQty) : null,
                short_reason: shortReason,
                unit_price: row.unit_price,
                line_total: row.line_total,
                currency_code: row.pov_currency_code,
            },
            chain: {
                po_id: row.po_id,
                po_voucher_no: row.po_voucher_no,
                customer_name: row.customer_name,
                po_currency_code: row.po_currency_code,
                po_exchange_rate: row.po_exchange_rate,
                delivery_address: row.delivery_address,
                pfi_id: row.pfi_id,
                pfi_voucher_no: row.pfi_voucher_no,
                quotation_id: row.quotation_id,
                quotation_voucher_no: row.quotation_voucher_no,
                lead_id: row.lead_id,
                lead_name: row.lead_name,
            },
        };
    }

    // ─── Stock summary — per-product on-hand from the ledger ────────────
    //
    // The new source-of-truth for stock: `SUM(stock_movements.qty)` grouped by
    // product (the receipts register stays as vendor-side traceability only).
    async stockSummary(
        companyId: string,
        filters: StockSummaryFilters
    ): Promise<{ rows: any[]; total: number }> {
        const where: string[] = ['sm.company_id = $1', 'sm.deleted = false'];
        const params: any[] = [companyId];
        let i = 2;

        if (filters.location_id) {
            where.push(`sm.location_id = $${i}`);
            params.push(filters.location_id);
            i++;
        }
        if (filters.search) {
            where.push(`(p.code ILIKE $${i} OR p.name ILIKE $${i})`);
            params.push(`%${filters.search}%`);
            i++;
        }
        if (filters.category_id) {
            where.push(`p.category_id = $${i}`);
            params.push(filters.category_id);
            i++;
        }
        const whereSql = where.join(' AND ');

        const having: string[] = [];
        if (filters.in_stock_only) having.push('COALESCE(SUM(sm.qty), 0) > 0');
        if (filters.non_positive_only)
            having.push('COALESCE(SUM(sm.qty), 0) <= 0');
        const havingSql = having.length ? `HAVING ${having.join(' AND ')}` : '';

        const fromGroup = `
            FROM stock_movements sm
            JOIN products p ON p._id = sm.product_id
            LEFT JOIN categories c ON c._id = p.category_id
            WHERE ${whereSql}
            GROUP BY p._id, p.code, p.name, p.unit_of_measure, c.name
            ${havingSql}`;

        const countRows = await this.dataSource.query(
            `SELECT COUNT(*)::int AS total FROM (SELECT p._id ${fromGroup}) t`,
            params
        );
        const total = countRows?.[0]?.total || 0;

        const ORDER: Record<string, string> = {
            on_hand: 'on_hand',
            product_name: 'product_name',
            last_movement: 'last_movement',
        };
        const orderCol = ORDER[filters.orderBy] || 'product_name';
        const orderDir =
            (filters.orderDirection || 'ASC').toUpperCase() === 'DESC'
                ? 'DESC'
                : 'ASC';

        const limitIdx = params.length + 1;
        const offsetIdx = params.length + 2;
        const rows = await this.dataSource.query(
            `SELECT
                p._id             AS product_id,
                p.code            AS product_code,
                p.name            AS product_name,
                p.unit_of_measure AS uom,
                c.name            AS category_name,
                COALESCE(SUM(sm.qty), 0)::float8 AS on_hand,
                MAX(sm."createdAt")              AS last_movement
             ${fromGroup}
             ORDER BY ${orderCol} ${orderDir}, p.code ASC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            [...params, filters.limit, filters.offset]
        );
        return { rows, total };
    }

    // ─── Movement history for one product (with running balance) ────────
    async movementHistory(
        companyId: string,
        productId: string,
        locationId?: string
    ): Promise<{ product: any; movements: any[] }> {
        const params: any[] = [companyId, productId];
        let locClause = '';
        if (locationId) {
            params.push(locationId);
            locClause = 'AND sm.location_id = $3';
        }
        const rows = await this.dataSource.query(
            `SELECT
                sm._id              AS _id,
                sm.qty::float8      AS qty,
                sm.movement_type    AS movement_type,
                sm.source_type      AS source_type,
                sm.source_id        AS source_id,
                sm.source_voucher_no AS source_voucher_no,
                sm.notes            AS notes,
                sm."createdAt"      AS created_at
             FROM stock_movements sm
             WHERE sm.company_id = $1 AND sm.deleted = false
               AND sm.product_id = $2 ${locClause}
             ORDER BY sm."createdAt" ASC, sm._id ASC`,
            params
        );

        let balance = 0;
        const movements = rows.map((r: any) => {
            balance = Math.round((balance + num(r.qty)) * 1e4) / 1e4;
            return { ...r, balance };
        });

        const ph = await this.dataSource.query(
            `SELECT p.code AS product_code, p.name AS product_name,
                    p.unit_of_measure AS uom
             FROM products p WHERE p._id = $1`,
            [productId]
        );

        return { product: ph?.[0] || null, movements };
    }
}
