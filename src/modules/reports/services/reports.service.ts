import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { FileService } from '@common/file/services/file.service';
import {
    ProductProfitabilityResponseDto,
    ProductProfitabilityRowDto,
} from '../dtos/response/product-profitability.response.dto';

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
