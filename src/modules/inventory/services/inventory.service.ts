import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';

import { InventoryListResponseDto } from '../dtos/response/inventory-list.response.dto';
import { InventoryReceiptDetailResponseDto } from '../dtos/response/inventory-receipt-detail.response.dto';

export interface InventoryListFilters {
    search?: string;
    category_id?: string;
    po_id?: string;
    pov_id?: string;
    vendor_id?: string;
    date_from?: string;
    date_to?: string;
    min_qty?: number;
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
    received_qty: 'pvl.received_qty',
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
    private readonly FROM_JOINS = `
        FROM po_vendor_lines pvl
        LEFT JOIN po_vendors pv      ON pv._id = pvl.po_vendor_id
        LEFT JOIN purchase_orders po ON po._id = pv.purchase_order_id
        LEFT JOIN products p         ON p._id = pvl.product_id
        LEFT JOIN categories c       ON c._id = p.category_id
        LEFT JOIN vendors v          ON v._id = pv.vendor_id`;

    /**
     * Paginated received-goods register. Only CLOSED, non-deleted POV lines
     * with received_qty > 0 qualify. Filters compose — only the WHERE
     * clauses with values are appended.
     */
    async list(
        companyId: string,
        filters: InventoryListFilters
    ): Promise<{ rows: InventoryListResponseDto[]; total: number }> {
        const where: string[] = [
            'pv.company_id = $1',
            "pv.status = 'closed'",
            'pv.soft_delete = false',
            'pvl.received_qty > 0',
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
            where.push(`pvl.received_qty >= $${i}`);
            params.push(filters.min_qty);
            i++;
        }

        const whereSql = where.join(' AND ');

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

        const limitIdx = i;
        const offsetIdx = i + 1;
        const rows = await this.dataSource.query(
            `SELECT
                pvl._id            AS pov_line_id,
                pvl.received_qty   AS received_qty,
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
     * Full receipt detail for the modal. Validates the line still belongs
     * to a CLOSED POV in this company — a bookmarked link to a since-
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
             WHERE pvl._id = $1 AND pv.company_id = $2`,
            [povLineId, companyId]
        );

        const row = rows?.[0];
        if (!row || row.status !== 'closed') {
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
}
