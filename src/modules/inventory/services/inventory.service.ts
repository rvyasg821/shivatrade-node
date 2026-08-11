import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { FileService } from '@common/file/services/file.service';

import { InventoryListResponseDto } from '../dtos/response/inventory-list.response.dto';
import { InventoryReceiptDetailResponseDto } from '../dtos/response/inventory-receipt-detail.response.dto';
import { InventoryStatsResponseDto } from '../dtos/response/inventory-stats.response.dto';

/** 2026-07-21 → 21-07-2026, matching how dates read on screen. */
const isoToDdmmyyyy = (iso?: string): string => {
    const s = String(iso || '').slice(0, 10);
    const [y, m, d] = s.split('-');
    return y && m && d ? `${d}-${m}-${y}` : s;
};

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
    // Multi-currency inventory: filter to stock purchased in one currency.
    // Empty/undefined = "All" (every currency, stacked in the UI).
    currency_code?: string;
    // Only products whose live ledger on-hand is > 0 (hides fully sold-out
    // receipt lines). Single-pool on-hand, matching the coverage view.
    in_stock_only?: boolean;
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

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class InventoryService {
    constructor(
        @InjectDatabaseConnection() private readonly dataSource: DataSource,
        private readonly fileService: FileService
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

    // Live per-product on-hand from the stock ledger (single pool, matching
    // the coverage view: GRN-in minus invoice-out). Correlated to the row's
    // product `p._id` — so a sold-out product reads 0 even though its receipt
    // line still exists. Used as the "Qty in Stock" column and the in-stock
    // filter.
    private readonly ON_HAND_EXPR = `COALESCE((
            SELECT SUM(sm.qty)
            FROM stock_movements sm
            WHERE sm.company_id = p.company_id
              AND sm.product_id = p._id
              AND sm.deleted = false
        ), 0)`;

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
        // In-stock toggle — live ledger on-hand > 0 (hides sold-out products).
        // No param: correlated to the outer pv/p aliases.
        if (filters.in_stock_only) {
            where.push(`${this.ON_HAND_EXPR} > 0`);
        }

        return { whereSql: where.join(' AND '), params };
    }

    // ─── Per-currency FIFO valuation (multi-currency inventory) ──────────
    //
    // Stock is valued NATIVE, grouped by the currency it was PURCHASED in — no
    // conversion to ₹ (that reverses the old D-6 INR-at-PO-rate model). A
    // product bought from both a USD vendor and an INR vendor shows as two rows:
    // one under USD, one under INR. FIFO decides which currency slice survives
    // as goods are sold: outward movements consume the OLDEST receipt layers
    // first, so the newest (surviving) layers determine the on-hand split.
    //
    // Layers = POV lines with received_qty (each tagged with its POV currency +
    // native unit price, dated by the POV arrival date) — the same row source
    // the register used before multi-currency, so received stock always shows.
    // Outward = real OUT ledger rows (sales invoices / manual, GRN reversals
    // excluded), consumed oldest-first. Opening & closing are the FIFO remainder
    // at the period's start/end; inward is the layer qty received in the window;
    // outward = opening + inward − closing (identity, per currency).
    private readonly FIFO_CTES = `
        layers AS (
            -- Receipt layers come from the POV lines themselves (received_qty),
            -- NOT the GRN ledger: received stock exists on the POV even when it
            -- wasn't posted to the ledger via a confirmed GRN, so the register
            -- must show it (matches the pre-multi-currency row source). Each
            -- layer carries its POV currency + native unit price, dated by the
            -- POV's arrival date for FIFO ordering.
            SELECT pvl.product_id,
                   pv.vendor_id                           AS vendor_id,
                   COALESCE(pv.currency_code, 'INR')      AS ccy,
                   COALESCE(pvl.received_qty, 0)::numeric AS in_qty,
                   COALESCE(pvl.unit_price, 0)::numeric   AS unit_price,
                   COALESCE(pv.actual_arrival_date, pv."updatedAt")::timestamptz AS mv_at,
                   pvl._id                                AS mv_id
            FROM po_vendor_lines pvl
            JOIN po_vendors pv        ON pv._id = pvl.po_vendor_id
            LEFT JOIN purchase_orders po ON po._id = pv.purchase_order_id
            WHERE pv.company_id = $1 AND pv.soft_delete = false
              AND pv.status <> 'cancelled'
              AND COALESCE(pvl.received_qty, 0) > 0
              {{LAYER_FILTERS}}
        ),
        outmv AS (
            -- Outward = real issues (sales invoices, manual out). GRN rows are
            -- EXCLUDED: a GRN reversal posts a negative 'grn' row, but layers
            -- above already come from POV received_qty, so counting a reversal
            -- as outward would double-reduce the stock.
            SELECT sm.product_id, sm.qty::numeric AS qty, sm."createdAt" AS mv_at
            FROM stock_movements sm
            WHERE sm.company_id = $1 AND sm.deleted = false AND sm.qty < 0
              AND sm.source_type <> 'grn'
              {{OUT_FILTERS}}
        ),
        cutoffs AS (
            SELECT 'opening'::text AS lbl,
                   COALESCE($__FROM__::timestamptz, '-infinity'::timestamptz) AS ts
            UNION ALL
            SELECT 'closing',
                   COALESCE(($__TO__::date + 1)::timestamptz, 'infinity'::timestamptz)
        ),
        ranked AS (
            -- FIFO cum_in stays partitioned by (product, lbl) so consumption is
            -- oldest-first across ALL vendors; {{V_RANKED}} only carries the
            -- vendor tag through for the export's per-vendor grain.
            SELECT l.product_id, l.ccy, l.unit_price, l.in_qty, c.lbl{{V_RANKED}},
                   SUM(l.in_qty) OVER (
                       PARTITION BY l.product_id, c.lbl
                       ORDER BY l.mv_at, l.mv_id
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                   ) AS cum_in
            FROM layers l JOIN cutoffs c ON l.mv_at < c.ts
        ),
        out_at AS (
            SELECT o.product_id, c.lbl, SUM(-o.qty) AS out_qty
            FROM outmv o JOIN cutoffs c ON o.mv_at < c.ts
            GROUP BY o.product_id, c.lbl
        ),
        remaining AS (
            SELECT r.product_id, r.ccy, r.lbl, r.unit_price{{V_REM}},
                   GREATEST(0, LEAST(r.in_qty, r.cum_in - COALESCE(oa.out_qty, 0))) AS rem_qty
            FROM ranked r
            LEFT JOIN out_at oa ON oa.product_id = r.product_id AND oa.lbl = r.lbl
        ),
        agg AS (
            SELECT product_id, ccy, lbl{{V_AGG}},
                   SUM(rem_qty)             AS qty,
                   SUM(rem_qty * unit_price) AS val
            FROM remaining GROUP BY product_id, ccy, lbl{{V_AGG}}
        ),
        inward AS (
            SELECT l.product_id, l.ccy{{V_INW}}, SUM(l.in_qty) AS qty
            FROM layers l
            WHERE l.mv_at >= COALESCE($__FROM__::timestamptz, '-infinity'::timestamptz)
              AND l.mv_at <  COALESCE(($__TO__::date + 1)::timestamptz, 'infinity'::timestamptz)
            GROUP BY l.product_id, l.ccy{{V_INW}}
        ),
        combined AS (
            SELECT
                COALESCE(cl.product_id, op.product_id, iw.product_id) AS product_id,
                COALESCE(cl.ccy, op.ccy, iw.ccy)                      AS ccy{{V_COMB}},
                COALESCE(op.qty, 0)  AS opening_qty,
                COALESCE(iw.qty, 0)  AS inward_qty,
                COALESCE(cl.qty, 0)  AS closing_qty,
                COALESCE(cl.val, 0)  AS closing_value,
                CASE WHEN COALESCE(cl.qty, 0) > 0
                     THEN COALESCE(cl.val, 0) / cl.qty ELSE 0 END AS avg_rate
            FROM       (SELECT * FROM agg WHERE lbl = 'closing') cl
            FULL JOIN  (SELECT * FROM agg WHERE lbl = 'opening') op
                       ON op.product_id = cl.product_id AND op.ccy = cl.ccy{{V_COMB_OP}}
            FULL JOIN  inward iw
                       ON iw.product_id = COALESCE(cl.product_id, op.product_id)
                      AND iw.ccy        = COALESCE(cl.ccy, op.ccy){{V_COMB_IW}}
        )`;

    /**
     * Builds the resolved FIFO CTE block + positional params + the product-level
     * WHERE fragment, shared by list / stats / export so all three describe the
     * exact same filtered, per-currency set. `params[0]` is always companyId;
     * callers append their own params (limit/offset) starting at params.length+1.
     */
    private buildFifo(
        companyId: string,
        filters: InventoryStatsFilters,
        perVendor = false
    ): { ctes: string; params: any[]; prodWhere: string } {
        const p: any[] = [companyId];
        const layerFilters: string[] = [];
        const outFilters: string[] = [];

        // Location applies to BOTH the receipt layers and the outward pool so
        // FIFO consumes within the same warehouse (one param, reused). Layers
        // (POV) use the deliver-to snapshot; the ledger (outmv) uses its own
        // location_id.
        if (filters.location_id) {
            p.push(filters.location_id);
            layerFilters.push(
                `AND COALESCE(pv.delivery_address_id, po.delivery_address_id) = $${p.length}`
            );
            outFilters.push(`AND sm.location_id = $${p.length}`);
        }
        // Vendor narrows which receipt layers count (outward stays whole-pool).
        if (filters.vendor_id) {
            p.push(filters.vendor_id);
            layerFilters.push(`AND pv.vendor_id = $${p.length}`);
        }
        p.push(filters.date_from ?? null);
        const fromIdx = p.length;
        p.push(filters.date_to ?? null);
        const toIdx = p.length;

        const prodFilters: string[] = [];
        if (filters.search) {
            p.push(`%${filters.search}%`);
            prodFilters.push(
                `AND (p.code ILIKE $${p.length} OR p.name ILIKE $${p.length})`
            );
        }
        if (filters.category_id) {
            p.push(filters.category_id);
            prodFilters.push(`AND p.category_id = $${p.length}`);
        }
        if (filters.currency_code) {
            p.push(filters.currency_code);
            prodFilters.push(`AND cb.ccy = $${p.length}`);
        }
        if (filters.in_stock_only) prodFilters.push(`AND cb.closing_qty > 0`);

        // Per-vendor grain (export only): carry vendor_id through the FIFO CTEs
        // so surviving stock + its purchase cost split per vendor. Empty when
        // off, so list()/stats() produce the exact same per-product SQL.
        const v = (frag: string) => (perVendor ? frag : '');

        const ctes = this.FIFO_CTES.replace(
            /\{\{LAYER_FILTERS\}\}/g,
            layerFilters.join(' ')
        )
            .replace(/\{\{OUT_FILTERS\}\}/g, outFilters.join(' '))
            .replace(/\$__FROM__/g, `$${fromIdx}`)
            .replace(/\$__TO__/g, `$${toIdx}`)
            .replace(/\{\{V_RANKED\}\}/g, v(', l.vendor_id'))
            .replace(/\{\{V_REM\}\}/g, v(', r.vendor_id'))
            .replace(/\{\{V_AGG\}\}/g, v(', vendor_id'))
            .replace(/\{\{V_INW\}\}/g, v(', l.vendor_id'))
            .replace(
                /\{\{V_COMB\}\}/g,
                v(', COALESCE(cl.vendor_id, op.vendor_id, iw.vendor_id) AS vendor_id')
            )
            .replace(/\{\{V_COMB_OP\}\}/g, v(' AND op.vendor_id = cl.vendor_id'))
            .replace(
                /\{\{V_COMB_IW\}\}/g,
                v(' AND iw.vendor_id = COALESCE(cl.vendor_id, op.vendor_id)')
            );

        return { ctes, params: p, prodWhere: prodFilters.join(' ') };
    }

    /**
     * Paginated stock register — one row per (PRODUCT × purchase-currency).
     * Native, FIFO-valued (see FIFO_CTES). Filters compose. Returns the page
     * plus the full row count (via COUNT(*) OVER()).
     */
    async list(
        companyId: string,
        filters: InventoryListFilters
    ): Promise<{ rows: InventoryListResponseDto[]; total: number }> {
        const { ctes, params: p, prodWhere } = this.buildFifo(
            companyId,
            filters
        );

        const ORDER: Record<string, string> = {
            product_name: 'p.name',
            product_code: 'p.code',
            on_hand: 'cb.closing_qty',
            closing_qty: 'cb.closing_qty',
        };
        const orderCol = ORDER[filters.orderBy] || 'p.name';
        const orderDir =
            (filters.orderDirection || 'ASC').toUpperCase() === 'DESC'
                ? 'DESC'
                : 'ASC';

        const limitIdx = p.length + 1;
        const offsetIdx = p.length + 2;
        const rows = await this.dataSource.query(
            `WITH ${ctes}
             SELECT
                cb.product_id                     AS product_id,
                p.code                            AS product_code,
                p.name                            AS product_name,
                p.unit_of_measure                 AS uom,
                cat.name                          AS category_name,
                cb.ccy                            AS currency_code,
                cb.closing_qty::float8            AS on_hand,
                cb.avg_rate::float8               AS avg_rate,
                cb.opening_qty::float8            AS opening_qty,
                cb.inward_qty::float8             AS inward_qty,
                (cb.opening_qty + cb.inward_qty - cb.closing_qty)::float8 AS outward_qty,
                cb.closing_qty::float8            AS closing_qty,
                cb.closing_value::float8          AS closing_value,
                NULL                              AS arrival_date,
                COUNT(*) OVER()::int              AS total_count
             FROM combined cb
             JOIN products p   ON p._id = cb.product_id
             LEFT JOIN categories cat ON cat._id = p.category_id
             WHERE (cb.closing_qty <> 0 OR cb.inward_qty <> 0 OR cb.opening_qty <> 0)
               ${prodWhere}
             ORDER BY ${orderCol} ${orderDir}, p.code ASC, cb.ccy ASC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            [...p, filters.limit, filters.offset]
        );

        const total = rows?.[0]?.total_count ?? 0;
        for (const r of rows) delete r.total_count;
        return { rows: rows as InventoryListResponseDto[], total };
    }

    /**
     * Closing-Inventory Excel (client #5) — the on-screen register for the
     * SAME filtered set, un-paginated, for period-end reconciliation.
     *
     * Multi-currency: rows are grouped into a section PER purchase currency,
     * each valued natively with its OWN closing-value total. Currencies are
     * NEVER summed into a grand total (the plan's "can't sum currencies" rule,
     * same as the Sales Turnover report). Quantities are never totalled either
     * (mixed UOMs).
     */
    async exportExcel(
        companyId: string,
        filters: Omit<InventoryListFilters, 'limit' | 'offset'>
    ): Promise<Buffer> {
        // Per-vendor grain (product × currency × vendor): each row shows the
        // stock still on hand from that vendor and the price it was purchased at
        // (avg_rate = FIFO cost of that vendor's surviving layers). Own query,
        // NOT list() — the on-screen list stays one-row-per-product.
        const { ctes, params, prodWhere } = this.buildFifo(
            companyId,
            filters as any,
            true
        );
        const rows = await this.dataSource.query(
            `WITH ${ctes}
             SELECT
                p.code                            AS product_code,
                p.name                            AS product_name,
                p.part_no                         AS part_no,
                p.hsn_code                        AS hsn_code,
                cat.name                          AS category_name,
                p.unit_of_measure                 AS uom,
                v.company_name                    AS vendor_name,
                v.vendor_code                     AS vendor_code,
                COALESCE(inv.invoice_numbers, '') AS invoice_numbers,
                cb.ccy                            AS currency_code,
                cb.opening_qty::float8            AS opening_qty,
                cb.inward_qty::float8             AS inward_qty,
                (cb.opening_qty + cb.inward_qty - cb.closing_qty)::float8 AS outward_qty,
                cb.closing_qty::float8            AS closing_qty,
                -- Price the stock was purchased at: the FIFO cost of the on-hand
                -- layers when there's closing stock (so rate × closing reconciles
                -- to Closing Value); otherwise the avg price of that vendor's
                -- received layers, so a fully-consumed line still shows its rate.
                COALESCE(NULLIF(cb.avg_rate, 0), pr.purchase_rate, 0)::float8 AS purchase_rate,
                cb.closing_value::float8          AS closing_value
             FROM combined cb
             JOIN products p          ON p._id = cb.product_id
             LEFT JOIN categories cat ON cat._id = p.category_id
             LEFT JOIN vendors v      ON v._id = cb.vendor_id
             LEFT JOIN (
                SELECT product_id, ccy, vendor_id,
                       SUM(in_qty * unit_price) / NULLIF(SUM(in_qty), 0) AS purchase_rate
                FROM layers
                GROUP BY product_id, ccy, vendor_id
             ) pr ON pr.product_id = cb.product_id
                 AND pr.ccy = cb.ccy
                 AND pr.vendor_id = cb.vendor_id
             -- Vendor invoice number(s) that supplied this product/vendor/currency
             -- (distinct, comma-joined — one product+vendor can span several POVs).
             LEFT JOIN (
                SELECT pvl.product_id,
                       COALESCE(pv.currency_code, 'INR') AS ccy,
                       pv.vendor_id,
                       STRING_AGG(DISTINCT pv.invoice_number, ', '
                           ORDER BY pv.invoice_number) AS invoice_numbers
                FROM po_vendor_lines pvl
                JOIN po_vendors pv ON pv._id = pvl.po_vendor_id
                WHERE pv.company_id = $1
                  AND pv.soft_delete = false
                  AND pv.status <> 'cancelled'
                  AND pv.invoice_number IS NOT NULL
                  AND pv.invoice_number <> ''
                GROUP BY pvl.product_id, ccy, pv.vendor_id
             ) inv ON inv.product_id = cb.product_id
                 AND inv.ccy = cb.ccy
                 AND inv.vendor_id = cb.vendor_id
             WHERE (cb.closing_qty <> 0 OR cb.inward_qty <> 0 OR cb.opening_qty <> 0)
               ${prodWhere}
             ORDER BY p.name ASC, p.code ASC, cb.ccy ASC, v.company_name ASC`,
            params
        );

        const asAt = filters.date_to ? isoToDdmmyyyy(filters.date_to) : 'today';
        const period = filters.date_from
            ? `${isoToDdmmyyyy(filters.date_from)} → ${asAt}`
            : `up to ${asAt}`;

        const aoa: (string | number)[][] = [
            [`Closing Inventory — as at ${asAt}`],
            [`Movement period: ${period}`],
            [
                'One row per product per vendor per purchase currency. Purchase Rate is the price the on-hand stock was bought at (FIFO cost). Currencies are not summed; quantities are not totalled (mixed units of measure).',
            ],
            [],
        ];

        const HEADER = [
            'Product Code',
            'Product',
            'Part No',
            'HSN Code',
            'Category',
            'UOM',
            'Vendor Name',
            'Vendor Code',
            'Vendor Invoice No',
            'Opening',
            'Inward',
            'Outward',
            'Closing',
            'Purchase Rate',
            'Closing Value',
            'Currency',
        ];

        // Group rows by currency, preserving query order within each section.
        const byCcy = new Map<string, any[]>();
        for (const r of rows as any[]) {
            const ccy = r.currency_code || 'INR';
            if (!byCcy.has(ccy)) byCcy.set(ccy, []);
            byCcy.get(ccy).push(r);
        }

        for (const ccy of Array.from(byCcy.keys()).sort()) {
            const section = byCcy.get(ccy);
            aoa.push([`Currency: ${ccy}`]);
            aoa.push(HEADER);
            let sectionValue = 0;
            for (const r of section) {
                sectionValue += Number(r.closing_value) || 0;
                aoa.push([
                    r.product_code || '',
                    r.product_name || '',
                    r.part_no || '',
                    r.hsn_code || '',
                    r.category_name || '',
                    r.uom || '',
                    r.vendor_name || '',
                    r.vendor_code || '',
                    r.invoice_numbers || '',
                    Number(r.opening_qty) || 0,
                    Number(r.inward_qty) || 0,
                    Number(r.outward_qty) || 0,
                    Number(r.closing_qty) || 0,
                    Number(r.purchase_rate) || 0,
                    Number(r.closing_value) || 0,
                    ccy,
                ]);
            }
            aoa.push([
                `Rows: ${section.length}`,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                `Total (${ccy})`,
                Math.round((sectionValue + Number.EPSILON) * 100) / 100,
                ccy,
            ]);
            aoa.push([]);
        }

        return this.fileService.writeExcelFromArray(aoa as any);
    }

    /**
     * KPI aggregates for the listing header cards, over the SAME filtered set
     * as `list` (location / category / vendor / date / search all apply).
     *
     * - stock_value   = CURRENT on-hand valuation, in INR. Per product it is
     *   `net on-hand (ledger: GRN-in − invoice-out) × weighted-average
     *   received unit price`. A fully invoiced-out (sold) product therefore
     *   contributes ₹0, so the card reconciles with the "Qty in Stock" column
     *   (both net of what's left the building). On-hand is clamped at 0 so a
     *   negative ledger balance can't subtract value.
     * - line_count    = number of receipt lines (matches the list total).
     * - product_count = distinct products (SKUs) in stock.
     * - vendor_count  = distinct vendors supplying the current stock.
     */
    async stats(
        companyId: string,
        filters: InventoryStatsFilters
    ): Promise<InventoryStatsResponseDto> {
        const { ctes, params, prodWhere } = this.buildFifo(companyId, {
            ...filters,
            // KPI value is current on-hand worth → only currencies with stock.
            in_stock_only: true,
        });

        // Per-currency valuation from the same FIFO combined set the list uses.
        const rows = await this.dataSource.query(
            `WITH ${ctes}
             SELECT cb.ccy                              AS currency_code,
                    COALESCE(SUM(cb.closing_value), 0)::float8 AS stock_value,
                    COUNT(DISTINCT cb.product_id)::int  AS product_count
             FROM combined cb
             JOIN products p ON p._id = cb.product_id
             WHERE cb.closing_qty > 0 ${prodWhere}
             GROUP BY cb.ccy
             ORDER BY cb.ccy ASC`,
            params
        );

        const byCurrency = (rows || []).map((r: any) => ({
            currency_code: r.currency_code,
            stock_value: String(r.stock_value ?? '0'),
            product_count: r.product_count ?? 0,
        }));

        // Distinct products (any currency) + distinct vendors currently supplying
        // stock — computed over the same filtered layer set.
        const counts = await this.dataSource.query(
            `WITH ${ctes}
             SELECT
                (SELECT COUNT(DISTINCT cb.product_id)::int
                   FROM combined cb JOIN products p ON p._id = cb.product_id
                   WHERE cb.closing_qty > 0 ${prodWhere})            AS product_count,
                (SELECT COUNT(DISTINCT l.vendor_id)::int FROM layers l) AS vendor_count
             `,
            params
        );

        return {
            by_currency: byCurrency,
            product_count: counts?.[0]?.product_count ?? 0,
            vendor_count: counts?.[0]?.vendor_count ?? 0,
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
                sm."createdAt"      AS created_at,
                -- For a GRN receipt, surface the Vendor PO it was received
                -- against + that POV's vendor, so the ledger shows where the
                -- stock came from (GRN → VPO → vendor).
                g.po_vendor_id::text    AS pov_id,
                g.po_vendor_voucher_no  AS pov_voucher_no,
                v.company_name          AS vendor_name
             FROM stock_movements sm
             LEFT JOIN grns g
                 ON sm.source_type = 'grn' AND g._id = sm.source_id
             LEFT JOIN vendors v ON v._id = g.vendor_id
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
