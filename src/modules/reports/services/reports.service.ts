import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { FileService } from '@common/file/services/file.service';
import {
    ProductProfitabilityResponseDto,
    ProductProfitabilityRowDto,
} from '../dtos/response/product-profitability.response.dto';
import {
    HsnSummaryResponseDto,
    HsnSummaryRowDto,
} from '../dtos/response/hsn-summary.response.dto';

export interface IProductProfitabilityQuery {
    date_from?: string;
    date_to?: string;
    category_id?: string;
    search?: string;
    order_by?: 'profit' | 'revenue' | 'cost' | 'qty' | 'margin';
    order_direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
}

export interface IHsnSummaryQuery {
    date_from?: string;
    date_to?: string;
    /** HSN code, ILIKE. */
    search?: string;
    /** igst_paid | lut_zero_rated */
    gst_route?: string;
    order_by?: 'hsn' | 'taxable' | 'igst' | 'qty';
    order_direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
}

const n = (v: any): number => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
};
const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const pad2 = (x: number): string => String(x).padStart(2, '0');
const ddmmyyyy = (d: Date): string =>
    `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;

/**
 * Read-only aggregation reports. Reads across tables via raw SQL (mirrors
 * `InvoiceService.salesLeaderboard`). Touches no write path.
 */
@Injectable()
export class ReportsService {
    constructor(
        @InjectDatabaseConnection() private readonly dataSource: DataSource,
        private readonly fileService: FileService
    ) {}

    /**
     * Same data as `productProfitability`, rendered to an .xlsx Buffer.
     * Runs the report unpaginated (whole filtered set), then appends a TOTAL row.
     */
    async productProfitabilityExcel(
        companyId: string,
        query: IProductProfitabilityQuery
    ): Promise<Buffer> {
        const result = await this.productProfitability(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });

        const header = [
            'Product',
            'Code',
            'HSN',
            'Category',
            'Qty Sold',
            'Revenue (INR)',
            'Cost (INR)',
            'Profit (INR)',
            'Margin %',
        ];
        const body = result.rows.map((r) => [
            r.product_name,
            r.product_code || '',
            r.hsn_code || '',
            r.category_name || '',
            r.qty_sold,
            r.revenue_inr,
            r.cost_inr,
            r.profit_inr,
            r.margin_pct,
        ]);
        const totalRow = [
            'TOTAL',
            '',
            '',
            '',
            result.totals.qty_sold,
            result.totals.revenue_inr,
            result.totals.cost_inr,
            result.totals.profit_inr,
            result.totals.margin_pct,
        ];

        const aoa: (string | number)[][] = [
            [`Product-wise Profitability — ${result.period_label} (INR)`],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    /** Indian financial year: 1 Apr – 31 Mar. FY start for `today`. */
    private currentFyStart(today: Date): Date {
        const y = today.getFullYear();
        // Jan–Mar (months 0-2) belong to the FY that began last April.
        const startYear = today.getMonth() >= 3 ? y : y - 1;
        return new Date(startYear, 3, 1); // 1 April
    }

    /**
     * Product-wise profitability (plan §6).
     *   revenue = Σ taxable_amount                                   (INR)
     *   cost    = Σ taxable_amount / (1 + margin_pct/100)            (INR, fully-loaded)
     *   profit  = revenue − cost                                    (= booked margin)
     *   margin% = profit / cost × 100                               (on cost)
     * Only issued/paid invoices (status ∉ {draft, cancelled}) in the date range.
     */
    async productProfitability(
        companyId: string,
        query: IProductProfitabilityQuery
    ): Promise<ProductProfitabilityResponseDto> {
        const today = new Date();
        const from = query.date_from || ddmmyyyyToIso(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);

        const categoryId = query.category_id || null;
        const search = query.search?.trim() ? query.search.trim() : null;

        // One aggregate row per product (a company has at most a few hundred
        // distinct products, so fetch all and paginate/total in JS).
        const raw: any[] = await this.dataSource.query(
            `SELECT il.product_id                                        AS product_id,
                    MAX(il.product_code)                                 AS product_code,
                    COALESCE(p.name, MAX(il.product_name), '—')          AS product_name,
                    MAX(il.hsn_code)                                     AS hsn_code,
                    p.category_id                                        AS category_id,
                    cat.name                                             AS category_name,
                    COALESCE(SUM(il.qty), 0)::float8                     AS qty_sold,
                    COALESCE(SUM(il.taxable_amount), 0)::float8          AS revenue_inr,
                    COALESCE(SUM(
                        il.taxable_amount
                        / NULLIF(1 + COALESCE(il.margin_pct, 0) / 100.0, 0)
                    ), 0)::float8                                        AS cost_inr
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             LEFT JOIN products p   ON p._id = il.product_id
             LEFT JOIN categories cat ON cat._id = p.category_id
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND il.product_id IS NOT NULL
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR p.category_id = $4)
               AND ($5::text IS NULL
                    OR il.product_name ILIKE '%' || $5 || '%'
                    OR il.product_code ILIKE '%' || $5 || '%')
             GROUP BY il.product_id, p.name, p.category_id, cat.name`,
            [companyId, from, to, categoryId, search]
        );

        const rows: ProductProfitabilityRowDto[] = raw.map((row) => {
            const revenue = r2(n(row.revenue_inr));
            const cost = r2(n(row.cost_inr));
            const profit = r2(revenue - cost);
            return {
                product_id: row.product_id,
                product_code: row.product_code ?? null,
                product_name: row.product_name ?? '—',
                hsn_code: row.hsn_code ?? null,
                category_id: row.category_id ?? null,
                category_name: row.category_name ?? null,
                qty_sold: r2(n(row.qty_sold)),
                revenue_inr: revenue,
                cost_inr: cost,
                profit_inr: profit,
                margin_pct: cost > 0 ? r2((profit / cost) * 100) : 0,
            };
        });

        // Sort (default profit desc).
        const orderBy = query.order_by || 'profit';
        const dir = query.order_direction === 'asc' ? 1 : -1;
        const keyOf = (x: ProductProfitabilityRowDto): number => {
            switch (orderBy) {
                case 'revenue':
                    return x.revenue_inr;
                case 'cost':
                    return x.cost_inr;
                case 'qty':
                    return x.qty_sold;
                case 'margin':
                    return x.margin_pct;
                default:
                    return x.profit_inr;
            }
        };
        rows.sort((a, b) => (keyOf(a) - keyOf(b)) * dir);

        // Totals across the WHOLE filtered set (not just the page).
        const totals = rows.reduce(
            (acc, x) => {
                acc.qty_sold += x.qty_sold;
                acc.revenue_inr += x.revenue_inr;
                acc.cost_inr += x.cost_inr;
                acc.profit_inr += x.profit_inr;
                return acc;
            },
            { qty_sold: 0, revenue_inr: 0, cost_inr: 0, profit_inr: 0, margin_pct: 0 }
        );
        totals.qty_sold = r2(totals.qty_sold);
        totals.revenue_inr = r2(totals.revenue_inr);
        totals.cost_inr = r2(totals.cost_inr);
        totals.profit_inr = r2(totals.profit_inr);
        totals.margin_pct =
            totals.cost_inr > 0
                ? r2((totals.profit_inr / totals.cost_inr) * 100)
                : 0;

        // Paginate in JS. The cap is generous (not 200) because this is an
        // AGGREGATED report — one row per product, a few hundred at most — and
        // the Excel export + grouped view legitimately ask for the whole set.
        const perPage = Math.max(1, Math.min(100000, Number(query.perPage) || 25));
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;
        const paged = rows.slice(start, start + perPage);

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: paged,
            totals,
            currency: 'INR',
            pagination: { total: rows.length, perPage, orderBy },
        };
    }

    /**
     * HSN Summary in GSTR-1 Table 12 shape — one row per HSN × rate × UQC.
     *
     * IGST is NOTIONAL: the stored `igst_amount` is 0 on both export routes, so
     * it's derived from `igst_rate_pct` (the HSN GST rate) and only for
     * `igst_paid` invoices — under LUT no IGST is charged at all. CGST/SGST/Cess
     * are always 0: every sale is a zero-rated export, there is no domestic
     * intra-state supply (plan §3.1).
     *
     * Same aggregation as `InvoiceService.buildIgstRefundBuckets` (rate buckets
     * over INR `taxable_amount`), regrouped by HSN + UQC with a `gst_route` gate.
     */
    async hsnSummary(
        companyId: string,
        query: IHsnSummaryQuery
    ): Promise<HsnSummaryResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);

        const search = query.search?.trim() ? query.search.trim() : null;
        const gstRoute = query.gst_route?.trim() ? query.gst_route.trim() : null;

        // Line `taxable_amount` is already INR base (invoice.service.ts
        // `recompute()`) — sum it directly, no exchange-rate conversion.
        const raw: any[] = await this.dataSource.query(
            `SELECT il.hsn_code                                     AS hsn_code,
                    MAX(il.product_name)                            AS description,
                    il.uqc_code                                     AS uqc_code,
                    COALESCE(il.igst_rate_pct, 0)::float8           AS rate,
                    COALESCE(SUM(il.qty), 0)::float8                AS total_qty,
                    COALESCE(SUM(il.taxable_amount), 0)::float8     AS taxable_value_inr,
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN il.taxable_amount * COALESCE(il.igst_rate_pct, 0) / 100.0
                             ELSE 0 END
                    ), 0)::float8                                   AS igst_inr,
                    COUNT(*) FILTER (
                        WHERE il.hsn_code IS NULL OR il.uqc_code IS NULL
                    )::int                                          AS missing_meta
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::text IS NULL OR il.hsn_code ILIKE '%' || $4 || '%')
               AND ($5::text IS NULL OR i.gst_route = $5)
             GROUP BY il.hsn_code, il.uqc_code, COALESCE(il.igst_rate_pct, 0)`,
            [companyId, from, to, search, gstRoute]
        );

        let missingMeta = 0;
        const rows: HsnSummaryRowDto[] = raw.map((row) => {
            const taxable = r2(n(row.taxable_value_inr));
            const igst = r2(n(row.igst_inr));
            missingMeta += n(row.missing_meta);
            return {
                hsn_code: row.hsn_code ?? null,
                description: row.description ?? null,
                uqc_code: row.uqc_code ?? null,
                rate: r2(n(row.rate)),
                total_qty: r2(n(row.total_qty)),
                taxable_value_inr: taxable,
                igst_inr: igst,
                // No domestic supply exists — kept for Table-12 completeness.
                cgst_inr: 0,
                sgst_inr: 0,
                cess_inr: 0,
                total_value_inr: r2(taxable + igst),
            };
        });

        // Sort (default hsn asc — Table 12 reads HSN-ordered).
        const orderBy = query.order_by || 'hsn';
        const dir = query.order_direction === 'desc' ? -1 : 1;
        rows.sort((a, b) => {
            if (orderBy === 'hsn') {
                const cmp = String(a.hsn_code || '').localeCompare(
                    String(b.hsn_code || '')
                );
                // Same HSN → rate asc keeps the rate buckets readable.
                return (cmp !== 0 ? cmp : a.rate - b.rate) * dir;
            }
            const keyOf = (x: HsnSummaryRowDto): number =>
                orderBy === 'taxable'
                    ? x.taxable_value_inr
                    : orderBy === 'igst'
                      ? x.igst_inr
                      : x.total_qty;
            return (keyOf(a) - keyOf(b)) * dir;
        });

        // Totals across the WHOLE filtered set (not just the page).
        const totals = rows.reduce(
            (acc, x) => {
                acc.total_qty += x.total_qty;
                acc.taxable_value_inr += x.taxable_value_inr;
                acc.igst_inr += x.igst_inr;
                acc.total_value_inr += x.total_value_inr;
                return acc;
            },
            {
                total_qty: 0,
                total_value_inr: 0,
                taxable_value_inr: 0,
                igst_inr: 0,
                cgst_inr: 0,
                sgst_inr: 0,
                cess_inr: 0,
            }
        );
        totals.total_qty = r2(totals.total_qty);
        totals.taxable_value_inr = r2(totals.taxable_value_inr);
        totals.igst_inr = r2(totals.igst_inr);
        totals.total_value_inr = r2(totals.total_value_inr);

        // Paginate in JS — an aggregated report is at most a few hundred rows,
        // and the export legitimately asks for the whole set.
        const perPage = Math.max(1, Math.min(100000, Number(query.perPage) || 25));
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: rows.slice(start, start + perPage),
            totals,
            currency: 'INR',
            missing_hsn_or_uqc_rows: missingMeta,
            pagination: { total: rows.length, perPage, orderBy },
        };
    }

    /**
     * The same report as an .xlsx Buffer, in the exact Table-12 column order.
     * Runs unpaginated, then appends a TOTAL row.
     */
    async hsnSummaryExcel(
        companyId: string,
        query: IHsnSummaryQuery
    ): Promise<Buffer> {
        const result = await this.hsnSummary(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });

        const header = [
            'HSN',
            'Description',
            'UQC',
            'Rate %',
            'Total Qty',
            'Total Value (INR)',
            'Taxable Value (INR)',
            'IGST (INR)',
            'CGST (INR)',
            'SGST (INR)',
            'Cess (INR)',
        ];
        const body = result.rows.map((r) => [
            r.hsn_code || '',
            r.description || '',
            r.uqc_code || '',
            r.rate,
            r.total_qty,
            r.total_value_inr,
            r.taxable_value_inr,
            r.igst_inr,
            r.cgst_inr,
            r.sgst_inr,
            r.cess_inr,
        ]);
        const totalRow = [
            'TOTAL',
            '',
            '',
            '',
            result.totals.total_qty,
            result.totals.total_value_inr,
            result.totals.taxable_value_inr,
            result.totals.igst_inr,
            result.totals.cgst_inr,
            result.totals.sgst_inr,
            result.totals.cess_inr,
        ];

        const aoa: (string | number)[][] = [
            [`HSN Summary (GSTR-1 Table 12) — ${result.period_label} (INR)`],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }
}

// ── date helpers (module-local) ──────────────────────────────────────────
function isoDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ddmmyyyyToIso(d: Date): string {
    return isoDate(d);
}
function isoToDdmmyyyy(iso: string): string {
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return y && m && d ? `${d}-${m}-${y}` : String(iso);
}
