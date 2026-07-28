import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';
import { FileService } from '@common/file/services/file.service';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorService } from '@modules/po-vendor/services/po-vendor.service';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { InvoicePaymentRepository } from '@modules/invoice/repository/repositories/invoice-payment.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import {
    SalesTurnoverResponseDto,
    SalesTurnoverRowDto,
    CurrencyGroupDto,
} from '../dtos/response/sales-turnover.response.dto';
import {
    GstBalanceResponseDto,
    GstBalanceRowDto,
    GstBalanceBreakdownResponseDto,
    GstBalancePurchaseSourceDto,
    GstBalanceSalesSourceDto,
} from '../dtos/response/gst-balance.response.dto';
import {
    PurchaseTurnoverResponseDto,
    PurchaseTurnoverRowDto,
} from '../dtos/response/purchase-turnover.response.dto';
import {
    ProductProfitabilityResponseDto,
    ProductProfitabilityRowDto,
} from '../dtos/response/product-profitability.response.dto';
import {
    HsnSummaryResponseDto,
    HsnSummaryRowDto,
    HsnSummaryBreakdownResponseDto,
    HsnSummaryVoucherDto,
} from '../dtos/response/hsn-summary.response.dto';
import {
    SoInvoiceReconciliationResponseDto,
    SoInvoiceReconRowDto,
} from '../dtos/response/so-invoice-reconciliation.response.dto';
import {
    StockTurnoverResponseDto,
    StockTurnoverRowDto,
} from '../dtos/response/stock-turnover.response.dto';
import {
    InventoryHoldingDaysResponseDto,
    InventoryHoldingDaysRowDto,
} from '../dtos/response/inventory-holding-days.response.dto';

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

export interface IStockTurnoverQuery {
    date_from?: string;
    date_to?: string;
    category_id?: string;
    product_id?: string;
    search?: string;
    order_by?: 'ratio' | 'dio' | 'cogs' | 'inventory' | 'sold' | 'name';
    order_direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
}

export interface IInventoryHoldingDaysQuery {
    date_from?: string;
    date_to?: string;
    category_id?: string;
    product_id?: string;
    search?: string;
    order_by?: 'days' | 'sold' | 'name';
    order_direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
}

export interface IGstBalanceQuery {
    date_from?: string;
    date_to?: string;
}

export interface ISoInvoiceReconQuery {
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** Narrow to a single invoice (dropdown). */
    invoice_id?: string;
    /** Narrow to a single Sales Order / purchase_order (dropdown). */
    purchase_order_id?: string;
    /** Free text over product name/code. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface IPurchaseTurnoverQuery {
    group_by?: 'month' | 'vendor';
    date_from?: string;
    date_to?: string;
    vendor_id?: string;
    /** unpaid | partially_paid | paid | overpaid — derived, filtered post-mapList. */
    payment_status?: string;
    order_by?: 'value' | 'paid' | 'outstanding' | 'count';
    order_direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
}

export interface ISalesTurnoverQuery {
    group_by?: 'month' | 'customer';
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** Narrow to one currency section. */
    currency?: string;
    /**
     * 'native' (default) → a section per currency, never summed (§5).
     * 'inr'              → every invoice converted to ₹ at ITS OWN stored rate
     *                      and merged into ONE section, so a single grand total
     *                      is meaningful. Historical rates, so a past report
     *                      always reproduces.
     */
    currency_mode?: 'native' | 'inr';
    /** unpaid | partially_paid | paid | overpaid — derived, filtered in JS. */
    payment_status?: string;
    order_by?: 'value' | 'received' | 'outstanding' | 'count';
    order_direction?: 'asc' | 'desc';
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
const round4 = (v: number): number =>
    Math.round((v + Number.EPSILON) * 10000) / 10000;
const pad2 = (x: number): string => String(x).padStart(2, '0');
const ddmmyyyy = (d: Date): string =>
    `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;

// ── GST state helpers (Input-Output GST Balance) ─────────────────────────
/** First 2 chars of a GSTIN = the state code ('24' = Gujarat). */
const gstStateCode = (gstin?: string): string | null => {
    const s = (gstin || '').trim();
    return /^\d{2}/.test(s) ? s.slice(0, 2) : null;
};
/** Free-text state names — compare case/whitespace-insensitively. */
const norm = (s?: string): string => (s || '').trim().toLowerCase();
const MONTH_ABBR = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
// ── Sales Turnover helpers ───────────────────────────────────────────────
/**
 * Invoice statuses that count as a sale. MUST equal `LEDGER_INVOICE_STATUSES`
 * in `ledger.service.ts:29` — the customer ledger and this report have to agree
 * (plan §6, §12.7). Excludes `draft` (not a sale yet) and `cancelled`.
 */
const SALES_TURNOVER_STATUSES = ['issued', 'partially_paid', 'paid'];
/** Currency sort for the sections: INR first, then alphabetical. */
const currencyRank = (a: string, b: string): number =>
    a === b ? 0 : a === 'INR' ? -1 : b === 'INR' ? 1 : a < b ? -1 : 1;

/** '2026-04' → 'Apr 2026' */
const monthLabel = (key: string): string => {
    const [y, m] = key.split('-');
    return `${MONTH_ABBR[Number(m) - 1] || m} ${y}`;
};

/**
 * The date a vendor PO counts on. There is NO purchase-date column on
 * `PoVendorEntity` — `dispatch_date` (a DATE, nullable) is when the goods moved;
 * `createdAt` (a timestamp) is the fallback. Normalise both to 'YYYY-MM-DD' so
 * range-filtering and month bucketing agree.
 */
const povIsoDate = (row: any): string => {
    const raw = row?.dispatch_date || row?.createdAt;
    if (!raw) return '';
    if (typeof raw === 'string') return raw.slice(0, 10);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : isoDate(d);
};

/**
 * Read-only aggregation reports. Reads across tables via raw SQL (mirrors
 * `InvoiceService.salesLeaderboard`). Touches no write path.
 */
@Injectable()
export class ReportsService {
    constructor(
        @InjectDatabaseConnection() private readonly dataSource: DataSource,
        private readonly fileService: FileService,
        // GST Balance only — a POV's GST is derived, not stored, so the input
        // side goes through mapList rather than SQL.
        private readonly povRepository: PoVendorRepository,
        private readonly povService: PoVendorService,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        // Sales Turnover — invoices, their receipts, customer names.
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly customerRepository: CustomerRepository
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
     * Drill-down for ONE HSN summary row — the invoice lines it is made of.
     *
     * The client's reference is Tally's "GSTR-1 Voucher Register": click an
     * HSN, see the vouchers behind it. Same idea as the GST Balance month
     * drill-down, so it reuses that UI pattern (right-side drawer).
     *
     * The WHERE clause below is deliberately identical to `hsnSummary`'s,
     * including the date range and the `gst_route` gate, and the grouping key
     * is the same triple (HSN × rate × UQC). If the two ever drift, the drawer
     * stops footing to the row it opened from — which is the one thing it
     * exists to prove. `IS NOT DISTINCT FROM` is what makes the "—" group
     * (null HSN / null UQC) openable at all; plain `=` never matches null.
     */
    /**
     * The voucher rows behind HSN summary figures.
     *
     * ONE query serving two callers — the drawer (one HSN row) and the export's
     * second sheet (every HSN row). They must select identically or the export
     * would stop reconciling with the report it sits next to, so the difference
     * between them is exactly one optional WHERE clause and nothing else.
     */
    private async fetchHsnVoucherRows(
        companyId: string,
        opts: {
            from: string;
            to: string;
            gstRoute: string | null;
            search?: string | null;
            /** Omit to get every HSN row's vouchers. */
            triple?: { hsn: string | null; uqc: string | null; rate: number };
        }
    ): Promise<(HsnSummaryVoucherDto & { hsn_code: string | null; rate: number })[]> {
        const params: any[] = [
            companyId,
            opts.from,
            opts.to,
            opts.gstRoute,
            opts.search ?? null,
        ];

        // `IS NOT DISTINCT FROM` rather than `=`: it is what makes the "—"
        // group (null HSN / null UQC) selectable at all — plain `=` never
        // matches null, so that row's drawer would come back empty.
        let tripleClause = '';
        if (opts.triple) {
            params.push(opts.triple.hsn, opts.triple.uqc, opts.triple.rate);
            tripleClause = `
               AND il.hsn_code IS NOT DISTINCT FROM $6::text
               AND il.uqc_code IS NOT DISTINCT FROM $7::text
               AND COALESCE(il.igst_rate_pct, 0)::float8 = $8::float8`;
        }

        const raw: any[] = await this.dataSource.query(
            `SELECT i._id::text                                     AS invoice_id,
                    i.voucher_no                                    AS invoice_no,
                    -- Formatted in SQL, not JS: invoice_date is a DATE column
                    -- and the raw pg driver hands DATE back as a JS Date, which
                    -- stringifies to the full "Wed Apr 22 2026 00:00:00 GMT..."
                    -- form and would shift across a timezone on the way through.
                    TO_CHAR(i.invoice_date, 'DD-MM-YYYY')           AS invoice_date,
                    i.status                                        AS status,
                    i.gst_route                                     AS gst_route,
                    COALESCE(i.grand_total_inr, '0')::float8         AS invoice_total_inr,
                    COALESCE(
                        i.customer_snapshot->>'company_name',
                        c.company_name
                    )                                               AS customer_name,
                    il.product_name                                 AS product_name,
                    il.hsn_code                                     AS hsn_code,
                    il.uqc_code                                     AS uqc_code,
                    COALESCE(il.igst_rate_pct, 0)::float8           AS rate,
                    COALESCE(il.qty, 0)::float8                     AS qty,
                    COALESCE(il.taxable_amount, 0)::float8          AS taxable_value_inr,
                    CASE WHEN i.gst_route = 'igst_paid'
                         THEN COALESCE(il.taxable_amount, 0)
                              * COALESCE(il.igst_rate_pct, 0) / 100.0
                         ELSE 0 END::float8                         AS igst_inr
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             LEFT JOIN customers c
                 ON c._id = i.customer_id
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::text IS NULL OR i.gst_route = $4)
               AND ($5::text IS NULL OR il.hsn_code ILIKE '%' || $5 || '%')
               ${tripleClause}
             ORDER BY il.hsn_code ASC NULLS FIRST,
                      COALESCE(il.igst_rate_pct, 0) ASC,
                      il.uqc_code ASC NULLS FIRST,
                      i.invoice_date ASC, i.voucher_no ASC, il.seq ASC`,
            params
        );

        return raw.map((row) => {
            const taxable = r2(n(row.taxable_value_inr));
            const igst = r2(n(row.igst_inr));
            return {
                invoice_id: row.invoice_id,
                invoice_no: row.invoice_no ?? null,
                invoice_date: row.invoice_date || '',
                customer_name: row.customer_name ?? null,
                // Only invoices feed GSTR-1, so this is a constant today. It is
                // a column rather than a caption so the drawer keeps matching
                // Tally if credit notes are ever added.
                voucher_type: 'Sales',
                status: row.status ?? '',
                gst_route: row.gst_route ?? '',
                product_name: row.product_name ?? null,
                hsn_code: row.hsn_code ?? null,
                uqc_code: row.uqc_code ?? null,
                rate: r2(n(row.rate)),
                qty: r2(n(row.qty)),
                taxable_value_inr: taxable,
                igst_inr: igst,
                cgst_inr: 0,
                sgst_inr: 0,
                cess_inr: 0,
                total_value_inr: r2(taxable + igst),
                invoice_total_inr: r2(n(row.invoice_total_inr)),
            };
        });
    }

    async hsnSummaryBreakdown(
        companyId: string,
        query: IHsnSummaryQuery & {
            hsn_code?: string | null;
            uqc_code?: string | null;
            rate?: number | string;
        }
    ): Promise<HsnSummaryBreakdownResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const gstRoute = query.gst_route?.trim() ? query.gst_route.trim() : null;

        // Empty string from a query string means "the null group", not "".
        const hsn = query.hsn_code ? String(query.hsn_code) : null;
        const uqc = query.uqc_code ? String(query.uqc_code) : null;
        const rate = n(query.rate);

        const vouchers = await this.fetchHsnVoucherRows(companyId, {
            from,
            to,
            gstRoute,
            triple: { hsn, uqc, rate },
        });

        const totals = vouchers.reduce(
            (acc, v) => {
                acc.total_qty += v.qty;
                acc.taxable_value_inr += v.taxable_value_inr;
                acc.igst_inr += v.igst_inr;
                acc.total_value_inr += v.total_value_inr;
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

        return {
            hsn_code: hsn,
            uqc_code: uqc,
            rate: r2(rate),
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            vouchers,
            totals,
            currency: 'INR',
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

        // Sheet 2 — the proof. Sheet 1 alone cannot answer "where does this
        // figure come from"; shipping the register alongside it makes the file
        // self-contained for a reconciliation or a GST query.
        //
        // Flat, with HSN/Rate/UQC as the leading columns, rather than one sheet
        // per HSN: a 40-HSN period would otherwise be a 40-tab workbook, and
        // flat is what can be filtered or pivoted.
        const today = new Date();
        const registerRows = await this.fetchHsnVoucherRows(companyId, {
            from: query.date_from || isoDate(this.currentFyStart(today)),
            to: query.date_to || isoDate(today),
            gstRoute: query.gst_route?.trim() ? query.gst_route.trim() : null,
            // Same HSN filter as sheet 1, so the two sheets always describe the
            // same set of documents.
            search: query.search?.trim() ? query.search.trim() : null,
        });

        const registerHeader = [
            'HSN',
            'Rate %',
            'UQC',
            'Date',
            'Particulars',
            'Vch Type',
            'Vch No.',
            'Item',
            'Qty',
            'Total Value (INR)',
            'Taxable Value (INR)',
            'IGST (INR)',
            'CGST (INR)',
            'SGST (INR)',
            'Cess (INR)',
            'Invoice Amount (INR)',
        ];
        const registerBody = registerRows.map((v) => [
            v.hsn_code || '',
            v.rate,
            v.uqc_code || '',
            v.invoice_date,
            v.customer_name || '',
            v.voucher_type,
            v.invoice_no || '',
            v.product_name || '',
            v.qty,
            v.total_value_inr,
            v.taxable_value_inr,
            v.igst_inr,
            v.cgst_inr,
            v.sgst_inr,
            v.cess_inr,
            v.invoice_total_inr,
        ]);
        const registerTotals = registerRows.reduce(
            (acc, v) => {
                acc.qty += v.qty;
                acc.total += v.total_value_inr;
                acc.taxable += v.taxable_value_inr;
                acc.igst += v.igst_inr;
                return acc;
            },
            { qty: 0, total: 0, taxable: 0, igst: 0 }
        );
        const registerTotalRow: (string | number)[] = [
            'TOTAL',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            r2(registerTotals.qty),
            r2(registerTotals.total),
            r2(registerTotals.taxable),
            r2(registerTotals.igst),
            0,
            0,
            0,
            // Blank on purpose: "Invoice Amount" is the whole document repeated
            // on every line of that invoice, so summing it double-counts.
            '',
        ];

        const registerAoa: (string | number)[][] = [
            [
                `Voucher Register — ${result.period_label} (INR). One row per invoice LINE; this sheet totals back to the HSN Summary sheet.`,
            ],
            [],
            registerHeader,
            ...registerBody,
            [],
            registerTotalRow,
        ];

        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: 'HSN Summary', rows: aoa },
            { sheetName: 'Voucher Register', rows: registerAoa },
        ]);
    }

    /**
     * Resolves OUR state, once per request. Mirrors the chain the POV/PO PDFs
     * use (`po-vendor-pdf.service.ts:118-158`): corporate default address →
     * any corporate → any default → first, then the company record itself.
     */
    private async resolveCompanyState(
        companyId: string
    ): Promise<{ code: string | null; name: string }> {
        const company: any = await this.companyRepository.findOneById(companyId);
        let gstin: string | undefined;
        let state: string | undefined;
        try {
            const addresses: any[] =
                await this.companyAddressRepository.findByCompanyId(companyId);
            const corp =
                (addresses || []).find(
                    (a) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a) => a.type === 'corporate') ||
                (addresses || []).find((a) => a.is_default) ||
                (addresses || [])[0];
            if (corp) {
                gstin = corp.gstin || undefined;
                state = corp.state || undefined;
            }
        } catch {
            /* graceful — fall back to the company record */
        }
        if (!gstin && company?.tax_number) gstin = company.tax_number;
        if (!state && company?.state) state = company.state;
        return { code: gstStateCode(gstin), name: norm(state) };
    }

    /**
     * Input-Output GST Balance (INPUT_OUTPUT_GST_BALANCE_REPORT_PLAN.md).
     *
     *   Output GST = notional IGST on `igst_paid` exports, 0 under LUT. There is
     *                no output CGST/SGST — every sale is a zero-rated export.
     *   Input GST  = GST paid to vendors (goods + charges), split intra/inter
     *                state (§6): same state → CGST+SGST (half each),
     *                different → IGST, unresolvable → Unclassified.
     *   Net ITC    = input total − output IGST → refund claimable (normally
     *                positive for a merchant exporter; NOT tax payable).
     */
    async gstBalance(
        companyId: string,
        query: IGstBalanceQuery
    ): Promise<GstBalanceResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);

        const bucket = new Map<string, GstBalanceRowDto>();
        const monthOf = (d: any): string => String(d ?? '').slice(0, 7);
        const rowFor = (key: string): GstBalanceRowDto => {
            if (!bucket.has(key)) {
                bucket.set(key, {
                    month: key,
                    month_label: monthLabel(key),
                    output_igst_inr: 0,
                    // The taxable bases the two GST figures were computed on —
                    // so the tax can be checked against its own source.
                    output_taxable_inr: 0,
                    input_taxable_inr: 0,
                    input_igst_inr: 0,
                    input_cgst_inr: 0,
                    input_sgst_inr: 0,
                    input_unclassified_inr: 0,
                    input_total_inr: 0,
                    net_itc_inr: 0,
                });
            }
            return bucket.get(key)!;
        };

        // ── Output: notional IGST by month (same gate as hsnSummary) ──
        const outRaw: any[] = await this.dataSource.query(
            `SELECT to_char(i.invoice_date, 'YYYY-MM')                AS month,
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN il.taxable_amount * COALESCE(il.igst_rate_pct, 0) / 100.0
                             ELSE 0 END
                    ), 0)::float8                                     AS output_igst_inr,
                    -- The taxable sales value that IGST was computed on.
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN il.taxable_amount
                             ELSE 0 END
                    ), 0)::float8                                     AS output_taxable_inr
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
             GROUP BY to_char(i.invoice_date, 'YYYY-MM')`,
            [companyId, from, to]
        );
        for (const o of outRaw) {
            const row = rowFor(o.month);
            row.output_igst_inr = r2(n(o.output_igst_inr));
            row.output_taxable_inr = r2(n(o.output_taxable_inr));
        }

        // ── Input: POV GST via mapList, split by state ──
        // A POV has NO purchase-date column — only dispatch_date (nullable) and
        // createdAt. So the date can't be pushed into the query; fetch the
        // company's dispatched/closed POVs and bucket in JS on
        // `dispatch_date || createdAt`, which is when the goods (and the GST)
        // actually landed.
        const povRaw: any[] = await this.povRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            status: { $in: ['dispatched', 'closed'] },
        } as any);

        let unclassifiedPovs = 0;
        // Date-filter here rather than in the query (see above). Anything with
        // no resolvable date drops out rather than landing in a wrong month.
        const povInRange = povRaw.filter((r) => {
            const d = povIsoDate(r);
            return !!d && d >= from && d <= to;
        });
        if (povInRange.length) {
            const povs = await this.povService.mapList(povInRange as any);
            const monthByPov = new Map<string, string>(
                povInRange.map((r) => [r._id.toString(), monthOf(povIsoDate(r))])
            );

            const vendorIds = Array.from(
                new Set(
                    (povs as any[]).map((p) => p.vendor_id).filter(Boolean)
                )
            );
            const [vendors, addresses, mine] = await Promise.all([
                vendorIds.length
                    ? this.vendorRepository.findAll({
                          _id: { $in: vendorIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                vendorIds.length
                    ? this.vendorAddressRepository.findAll({
                          vendor_id: { $in: vendorIds },
                          // Editing an address soft-deletes the old row and
                          // writes a new one — without this we read the dead
                          // one (stale state, no GSTIN) and misclassify.
                          soft_delete: false,
                      } as any)
                    : Promise.resolve([] as any[]),
                this.resolveCompanyState(companyId),
            ]);

            const vendorById = new Map<string, any>(
                (vendors as any[]).map((v) => [v._id.toString(), v])
            );
            const addrById = new Map<string, any>(
                (addresses as any[]).map((a) => [a._id.toString(), a])
            );
            // Preferred address per vendor: default bill_from → any bill_from →
            // any default → first seen. Only used when the POV names no address.
            const addrByVendor = new Map<string, any>();
            const rank = (a: any): number =>
                a.type === 'bill_from' && a.is_default
                    ? 0
                    : a.type === 'bill_from'
                      ? 1
                      : a.is_default
                        ? 2
                        : 3;
            for (const a of addresses as any[]) {
                const key = a.vendor_id?.toString();
                if (!key) continue;
                const cur = addrByVendor.get(key);
                if (!cur || rank(a) < rank(cur)) addrByVendor.set(key, a);
            }
            // The address this POV actually billed from, when it names one —
            // same precedence as po-vendor-pdf.service.ts:178-227.
            const addrIdByPov = new Map<string, string>(
                povInRange
                    .filter((r) => r.vendor_address_id)
                    .map((r) => [
                        r._id.toString(),
                        r.vendor_address_id.toString(),
                    ])
            );

            for (const pov of povs as any[]) {
                const gst = r2(n((pov as any).gst_inr));
                const row = rowFor(monthByPov.get(pov._id) || monthOf(from));
                // The purchase amount the GST was charged on: goods + vendor
                // charges, excluding the tax itself. Accumulated BEFORE the
                // `gst <= 0` skip, so a zero-rated purchase still shows its
                // value — otherwise the base would silently under-report.
                row.input_taxable_inr = r2(
                    row.input_taxable_inr +
                        (n((pov as any).order_value) - gst)
                );
                if (gst <= 0) continue;

                // GSTIN lives on the ADDRESS first, the vendor master second —
                // most data fills only the address one.
                const vendor = vendorById.get(String(pov.vendor_id));
                const addr =
                    addrById.get(addrIdByPov.get(pov._id) || '') ||
                    addrByVendor.get(String(pov.vendor_id));
                const vendorCode = gstStateCode(addr?.gstin || vendor?.gstin);
                let intra: boolean | null = null;
                if (vendorCode && mine.code) {
                    intra = vendorCode === mine.code;
                } else {
                    // Fallback: compare state names (plan §6.2). Vendor state
                    // exists only on the address — there is no vendor.state.
                    const vState = norm(addr?.state);
                    if (vState && mine.name) intra = vState === mine.name;
                }

                if (intra === null) {
                    unclassifiedPovs += 1;
                    row.input_unclassified_inr = r2(
                        row.input_unclassified_inr + gst
                    );
                } else if (intra) {
                    // Halve the POV's own GST rather than re-deriving per line,
                    // so CGST + SGST always foots back to it to the paisa.
                    const half = r2(gst / 2);
                    row.input_cgst_inr = r2(row.input_cgst_inr + half);
                    row.input_sgst_inr = r2(row.input_sgst_inr + (gst - half));
                } else {
                    row.input_igst_inr = r2(row.input_igst_inr + gst);
                }
            }
        }

        // ── Fill every month in the range, so a gap reads as zero, not absent ──
        const rows: GstBalanceRowDto[] = [];
        const cur = new Date(`${from.slice(0, 7)}-01T00:00:00`);
        const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
        while (cur <= end) {
            const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`;
            rows.push(rowFor(key));
            cur.setMonth(cur.getMonth() + 1);
        }
        rows.sort((a, b) => (a.month < b.month ? -1 : 1));

        const totals = {
            output_igst_inr: 0,
            output_taxable_inr: 0,
            input_taxable_inr: 0,
            input_igst_inr: 0,
            input_cgst_inr: 0,
            input_sgst_inr: 0,
            input_unclassified_inr: 0,
            input_total_inr: 0,
            net_itc_inr: 0,
        };
        for (const row of rows) {
            row.input_total_inr = r2(
                row.input_igst_inr +
                    row.input_cgst_inr +
                    row.input_sgst_inr +
                    row.input_unclassified_inr
            );
            row.net_itc_inr = r2(row.input_total_inr - row.output_igst_inr);
            totals.output_igst_inr = r2(
                totals.output_igst_inr + row.output_igst_inr
            );
            totals.output_taxable_inr = r2(
                totals.output_taxable_inr + row.output_taxable_inr
            );
            totals.input_taxable_inr = r2(
                totals.input_taxable_inr + row.input_taxable_inr
            );
            totals.input_igst_inr = r2(totals.input_igst_inr + row.input_igst_inr);
            totals.input_cgst_inr = r2(totals.input_cgst_inr + row.input_cgst_inr);
            totals.input_sgst_inr = r2(totals.input_sgst_inr + row.input_sgst_inr);
            totals.input_unclassified_inr = r2(
                totals.input_unclassified_inr + row.input_unclassified_inr
            );
            totals.input_total_inr = r2(
                totals.input_total_inr + row.input_total_inr
            );
            totals.net_itc_inr = r2(totals.net_itc_inr + row.net_itc_inr);
        }

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows,
            totals,
            currency: 'INR',
            unclassified_pov_count: unclassifiedPovs,
        };
    }

    /**
     * Drill-down for ONE month of the GST Balance (client #6: "clarify the
     * source of the purchase amount… show how these values are derived").
     *
     * Returns the individual documents behind that month's figures, using the
     * exact same selection rules as `gstBalance` above:
     *   purchases → Vendor POs, status dispatched|closed, dated by
     *               dispatch_date || createdAt, taxable = order_value − gst
     *   sales     → invoices, status not draft|cancelled, dated by invoice_date
     */
    async gstBalanceBreakdown(
        companyId: string,
        month: string
    ): Promise<GstBalanceBreakdownResponseDto> {
        const key = String(month || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(key)) {
            throw new BadRequestException('month must be YYYY-MM.');
        }
        const from = `${key}-01`;
        const endDate = new Date(
            Number(key.slice(0, 4)),
            Number(key.slice(5, 7)),
            0
        );
        const to = `${key}-${pad2(endDate.getDate())}`;

        const { purchases, sales } = await this.fetchGstBalanceSources(
            companyId,
            from,
            to
        );

        return {
            month: key,
            month_label: monthLabel(key),
            purchases,
            sales,
        };
    }

    /**
     * The documents behind GST Balance figures, over any date range.
     *
     * ONE fetch serving two callers — the month drawer and the export's detail
     * sheets. The export runs it ONCE across the whole report period rather
     * than month-by-month: the purchase side has to load every Vendor PO to
     * date-filter it in JS (a POV has no purchase-date column), so twelve
     * monthly calls would be twelve full scans of the same table.
     */
    private async fetchGstBalanceSources(
        companyId: string,
        from: string,
        to: string
    ): Promise<{
        purchases: GstBalancePurchaseSourceDto[];
        sales: GstBalanceSalesSourceDto[];
    }> {
        // ── Purchases (the actual question) ──
        const povRaw: any[] = await this.povRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            status: { $in: ['dispatched', 'closed'] },
        } as any);
        const povInRange = povRaw.filter((r) => {
            const d = povIsoDate(r);
            return !!d && d >= from && d <= to;
        });

        const purchases: GstBalancePurchaseSourceDto[] = [];
        if (povInRange.length) {
            const povs = await this.povService.mapList(povInRange as any);
            const dateByPov = new Map<string, string>(
                povInRange.map((r) => [r._id.toString(), povIsoDate(r) || ''])
            );
            const addrIdByPov = new Map<string, string>(
                povInRange
                    .filter((r) => r.vendor_address_id)
                    .map((r) => [
                        r._id.toString(),
                        r.vendor_address_id.toString(),
                    ])
            );
            const vendorIds = Array.from(
                new Set((povs as any[]).map((p) => p.vendor_id).filter(Boolean))
            );
            const [vendors, addresses, mine] = await Promise.all([
                vendorIds.length
                    ? this.vendorRepository.findAll({
                          _id: { $in: vendorIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                vendorIds.length
                    ? this.vendorAddressRepository.findAll({
                          vendor_id: { $in: vendorIds },
                          soft_delete: false,
                      } as any)
                    : Promise.resolve([] as any[]),
                this.resolveCompanyState(companyId),
            ]);
            const vendorById = new Map<string, any>(
                (vendors as any[]).map((v) => [v._id.toString(), v])
            );
            const addrById = new Map<string, any>(
                (addresses as any[]).map((a) => [a._id.toString(), a])
            );
            const rank = (a: any): number =>
                a.type === 'bill_from' && a.is_default
                    ? 0
                    : a.type === 'bill_from'
                      ? 1
                      : a.is_default
                        ? 2
                        : 3;
            const addrByVendor = new Map<string, any>();
            for (const a of addresses as any[]) {
                const k = a.vendor_id?.toString();
                if (!k) continue;
                const cur = addrByVendor.get(k);
                if (!cur || rank(a) < rank(cur)) addrByVendor.set(k, a);
            }

            for (const pov of povs as any[]) {
                const gst = r2(n((pov as any).gst_inr));
                const vendor = vendorById.get(String(pov.vendor_id));
                const addr =
                    addrById.get(addrIdByPov.get(pov._id) || '') ||
                    addrByVendor.get(String(pov.vendor_id));
                const vendorCode = gstStateCode(addr?.gstin || vendor?.gstin);
                let intra: boolean | null = null;
                if (vendorCode && mine.code) {
                    intra = vendorCode === mine.code;
                } else {
                    const vState = norm(addr?.state);
                    if (vState && mine.name) intra = vState === mine.name;
                }
                purchases.push({
                    po_vendor_id: String(pov._id),
                    voucher_no: pov.voucher_no,
                    vendor_name:
                        pov.vendor_name || vendor?.company_name || '—',
                    vendor_state: addr?.state || null,
                    status: pov.status,
                    date: dateByPov.get(String(pov._id)) || '',
                    taxable_inr: r2(n((pov as any).order_value) - gst),
                    gst_inr: gst,
                    gst_split:
                        gst <= 0
                            ? 'none'
                            : intra === null
                              ? 'unclassified'
                              : intra
                                ? 'cgst_sgst'
                                : 'igst',
                });
            }
            purchases.sort((a, b) =>
                a.date === b.date
                    ? a.voucher_no.localeCompare(b.voucher_no)
                    : a.date < b.date
                      ? -1
                      : 1
            );
        }

        // ── Sales, one row per invoice ──
        const salesRaw: any[] = await this.dataSource.query(
            `SELECT i._id::text                                        AS invoice_id,
                    i.voucher_no                                       AS voucher_no,
                    i.status                                           AS status,
                    -- Formatted in SQL: invoice_date is a DATE and the raw pg
                    -- driver returns DATE as a JS Date, whose string form is
                    -- "Wed Apr 22 2026 00:00:00 GMT..." — slicing 10 characters
                    -- off that gives "Wed Apr 22", not a date.
                    TO_CHAR(i.invoice_date, 'YYYY-MM-DD')              AS invoice_date,
                    i.gst_route                                        AS gst_route,
                    COALESCE(c.company_name, '—')                      AS customer_name,
                    COALESCE(SUM(il.taxable_amount), 0)::float8        AS taxable_inr,
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN il.taxable_amount * COALESCE(il.igst_rate_pct, 0) / 100.0
                             ELSE 0 END
                    ), 0)::float8                                      AS igst_inr
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             LEFT JOIN customers c ON c._id = i.customer_id
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
             GROUP BY i._id, i.voucher_no, i.status, i.invoice_date,
                      i.gst_route, c.company_name
             ORDER BY i.invoice_date ASC, i.voucher_no ASC`,
            [companyId, from, to]
        );

        return {
            purchases,
            sales: (salesRaw || []).map((s) => ({
                invoice_id: s.invoice_id,
                voucher_no: s.voucher_no,
                customer_name: s.customer_name,
                status: s.status,
                invoice_date: String(s.invoice_date ?? '').slice(0, 10),
                gst_route: s.gst_route,
                taxable_inr: r2(n(s.taxable_inr)),
                igst_inr: r2(n(s.igst_inr)),
            })),
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async gstBalanceExcel(
        companyId: string,
        query: IGstBalanceQuery
    ): Promise<Buffer> {
        const result = await this.gstBalance(companyId, query);
        const header = [
            'Month',
            // The taxable bases sit next to the tax they produced, so the
            // sheet documents its own derivation (client #6).
            'Sales Taxable (INR)',
            'Output IGST (INR)',
            'Purchase Taxable (INR)',
            'Input IGST (INR)',
            'Input CGST (INR)',
            'Input SGST (INR)',
            'Unclassified (INR)',
            'Input Total (INR)',
            'Net ITC (INR)',
        ];
        const body = result.rows.map((r) => [
            r.month_label,
            r.output_taxable_inr,
            r.output_igst_inr,
            r.input_taxable_inr,
            r.input_igst_inr,
            r.input_cgst_inr,
            r.input_sgst_inr,
            r.input_unclassified_inr,
            r.input_total_inr,
            r.net_itc_inr,
        ]);
        const totalRow = [
            'TOTAL',
            result.totals.output_taxable_inr,
            result.totals.output_igst_inr,
            result.totals.input_taxable_inr,
            result.totals.input_igst_inr,
            result.totals.input_cgst_inr,
            result.totals.input_sgst_inr,
            result.totals.input_unclassified_inr,
            result.totals.input_total_inr,
            result.totals.net_itc_inr,
        ];
        const aoa: (string | number)[][] = [
            [`Input-Output GST Balance — ${result.period_label} (INR)`],
            ['Net ITC = Input Total − Output IGST (positive = refund claimable)'],
            [
                'Purchase Taxable = Vendor PO goods + charges, excl. GST (status dispatched/closed, dated by dispatch date).',
            ],
            [
                'Sales Taxable = invoice-line taxable amount on igst_paid invoices (excl. draft/cancelled, dated by invoice date).',
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];

        // Sheets 2 and 3 — the documents each monthly figure is made of, the
        // same thing the month drawer shows, for the whole period at once.
        // Sheet 1 alone cannot answer "where does the purchase amount come
        // from" (client #6) once the file has left the screen.
        //
        // Fetched ONCE over the whole range and tagged with a Month column,
        // rather than month-by-month: flat is what can be filtered or pivoted,
        // and the purchase side would otherwise re-scan every Vendor PO per
        // month.
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const { purchases, sales } = await this.fetchGstBalanceSources(
            companyId,
            from,
            to
        );

        const purchaseHeader = [
            'Month',
            'Date',
            'Vendor PO',
            'Vendor',
            'Vendor State',
            'Status',
            'Taxable (INR)',
            'GST (INR)',
            'GST Split',
        ];
        const purchaseBody = purchases.map((p) => [
            monthLabel(String(p.date || '').slice(0, 7)),
            isoToDdmmyyyy(String(p.date || '')),
            p.voucher_no,
            p.vendor_name,
            p.vendor_state || '—',
            p.status,
            p.taxable_inr,
            p.gst_inr,
            p.gst_split,
        ]);
        const purchaseTotals = purchases.reduce(
            (acc, p) => {
                acc.taxable += p.taxable_inr;
                acc.gst += p.gst_inr;
                return acc;
            },
            { taxable: 0, gst: 0 }
        );
        const purchaseAoa: (string | number)[][] = [
            [
                `Purchases — Vendor POs behind the Input GST — ${result.period_label} (INR). Totals back to the Purchase Taxable and input-tax columns on the GST Balance sheet.`,
            ],
            [
                'GST Split: igst = inter-state vendor, cgst_sgst = same state as the company, unclassified = vendor state unknown (no GSTIN on file).',
            ],
            [],
            purchaseHeader,
            ...purchaseBody,
            [],
            [
                'TOTAL',
                '',
                '',
                '',
                '',
                '',
                r2(purchaseTotals.taxable),
                r2(purchaseTotals.gst),
                '',
            ],
        ];

        const salesHeader = [
            'Month',
            'Date',
            'Invoice',
            'Customer',
            'Status',
            'GST Route',
            'Taxable (INR)',
            'Output IGST (INR)',
        ];
        const salesBody = sales.map((s) => [
            monthLabel(String(s.invoice_date || '').slice(0, 7)),
            isoToDdmmyyyy(String(s.invoice_date || '')),
            s.voucher_no,
            s.customer_name,
            s.status,
            s.gst_route,
            s.taxable_inr,
            s.igst_inr,
        ]);
        const salesTotals = sales.reduce(
            (acc, s) => {
                acc.taxable += s.taxable_inr;
                acc.igst += s.igst_inr;
                return acc;
            },
            { taxable: 0, igst: 0 }
        );
        const salesAoa: (string | number)[][] = [
            [
                `Sales — invoices behind the Output GST — ${result.period_label} (INR). Totals back to the Sales Taxable and Output IGST columns on the GST Balance sheet.`,
            ],
            [
                'Output IGST is notional: charged and refunded on igst_paid exports, and zero under LUT — so LUT invoices show taxable value with no IGST.',
            ],
            [],
            salesHeader,
            ...salesBody,
            [],
            [
                'TOTAL',
                '',
                '',
                '',
                '',
                '',
                r2(salesTotals.taxable),
                r2(salesTotals.igst),
            ],
        ];

        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: 'GST Balance', rows: aoa },
            { sheetName: 'Purchases (Input)', rows: purchaseAoa },
            { sheetName: 'Sales (Output)', rows: salesAoa },
        ]);
    }

    /**
     * Purchase Turnover (PURCHASE_TURNOVER_VPO_REPORT_PLAN.md) — what we bought,
     * paid and still owe, grouped **by month** (the trend) or **by vendor** (the
     * exposure; nothing else in the app aggregates across a vendor's POVs).
     *
     * No SQL: a POV's `order_value` / `gst_inr` / `amount_paid` are derived by
     * `PoVendorService.mapList` (product-master tax fallback + jsonb charge
     * rates), so re-deriving them in a query would drift from the POV page.
     *
     * Scope = dispatched + closed, **every payment status**. Unpaid POVs are IN:
     * turnover is what was purchased, not what was paid — dropping them would
     * hide the Outstanding that matters most (plan §6).
     */
    /**
     * Sales Turnover (SALES_TURNOVER_REPORT_PLAN) — what Shivatrade sold, in the
     * customer's own currency, By Month or By Customer. Multi-currency by nature:
     * the report is a STACK of per-currency sections, each with its own subtotal.
     * Currencies are never summed together (§5). All money is native — this
     * method never touches `exchange_rate` or `grand_total_inr`.
     */
    async salesTurnover(
        companyId: string,
        query: ISalesTurnoverQuery
    ): Promise<SalesTurnoverResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const groupBy = query.group_by === 'customer' ? 'customer' : 'month';
        const toInr = query.currency_mode === 'inr';

        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
            status: { $in: SALES_TURNOVER_STATUSES },
        };
        if (query.customer_id) find.customer_id = query.customer_id;
        const invoicesRaw: any[] = await this.invoiceRepository.findAll(
            find as any
        );

        // Date filter on the real `invoice_date` column (no POV-style proxy).
        const invoices = invoicesRaw.filter((inv) => {
            const d = String(inv.invoice_date || '').slice(0, 10);
            return !!d && d >= from && d <= to;
        });

        // Received per invoice — NATIVE. One batched read of non-voided
        // InvoicePayments, mirroring ledger.service.ts:134.
        const invoiceIds = invoices.map((i) => i._id.toString());
        const receivedById = new Map<string, number>();
        if (invoiceIds.length) {
            const payments: any[] =
                await this.invoicePaymentRepository.findAll({
                    invoice_id: { $in: invoiceIds },
                    soft_delete: false,
                } as any);
            for (const p of payments) {
                if (p.voided_at) continue; // a voided receipt is not received
                const id = p.invoice_id?.toString();
                if (!id) continue;
                receivedById.set(id, r2(n(receivedById.get(id)) + n(p.amount)));
            }
        }

        // Customer names (customer mode only) — one batched read, no N+1.
        const customerNameById = new Map<string, string>();
        if (groupBy === 'customer') {
            const ids = Array.from(
                new Set(
                    invoices
                        .map((i) => i.customer_id?.toString())
                        .filter(Boolean)
                )
            );
            if (ids.length) {
                const customers: any[] =
                    await this.customerRepository.findAll({
                        _id: { $in: ids },
                    } as any);
                for (const c of customers) {
                    customerNameById.set(
                        c._id.toString(),
                        c.company_name || '—'
                    );
                }
            }
        }

        // Every currency present in range — the dropdown source (§7.3.10).
        // Computed before the currency narrow so the dropdown is stable.
        const availableCurrencies = Array.from(
            new Set(invoices.map((i) => i.currency_code || 'INR'))
        ).sort(currencyRank);

        // Per-invoice figures + derived payment_status; apply the status filter.
        const groupMap = new Map<string, CurrencyGroupDto>();
        const rowMapByCurrency = new Map<string, Map<string, SalesTurnoverRowDto>>();
        const rowFor = (
            currency: string,
            symbol: string | null,
            key: string,
            label: string
        ): SalesTurnoverRowDto => {
            if (!groupMap.has(currency)) {
                groupMap.set(currency, {
                    currency,
                    currency_symbol: symbol,
                    rows: [],
                    totals: {
                        invoice_count: 0,
                        sales_value: 0,
                        received: 0,
                        outstanding: 0,
                    },
                });
                rowMapByCurrency.set(currency, new Map());
            }
            const rm = rowMapByCurrency.get(currency)!;
            if (!rm.has(key)) {
                rm.set(key, {
                    key,
                    label,
                    invoice_count: 0,
                    sales_value: 0,
                    received: 0,
                    outstanding: 0,
                });
            }
            return rm.get(key)!;
        };

        // INR mode: convert at each invoice's OWN rate. The factor is derived
        // from the stored `grand_total_inr` snapshot rather than from
        // exchange_rate directly, so a fully-paid invoice converts to exactly
        // the INR figure the invoice itself carries — no penny drift. Falls
        // back to 1/exchange_rate when grand_total is 0 (rate is
        // foreign-per-₹1, so ₹ = native ÷ rate).
        const inrFactor = (inv: any): number => {
            const native = n(inv.grand_total);
            const inr = n(inv.grand_total_inr);
            if (native > 0 && inr > 0) return inr / native;
            const er = n(inv.exchange_rate);
            return er > 0 ? 1 / er : 1;
        };

        for (const inv of invoices) {
            const currency = inv.currency_code || 'INR';
            // The currency filter narrows by the invoice's OWN currency in both
            // modes — in INR mode you are picking which source currencies to
            // convert, not which output section to see.
            if (query.currency && currency !== query.currency) continue;
            const factor = toInr ? inrFactor(inv) : 1;
            const sales = r2(n(inv.grand_total) * factor);
            const received = r2(
                n(receivedById.get(inv._id.toString())) * factor
            );
            const status =
                received <= 0
                    ? 'unpaid'
                    : received < sales
                      ? 'partially_paid'
                      : received === sales
                        ? 'paid'
                        : 'overpaid';
            if (query.payment_status && status !== query.payment_status) {
                continue;
            }
            const key =
                groupBy === 'customer'
                    ? String(inv.customer_id || '—')
                    : String(inv.invoice_date).slice(0, 7);
            const label =
                groupBy === 'customer'
                    ? customerNameById.get(String(inv.customer_id)) || '—'
                    : monthLabel(key);
            // INR mode collapses every currency into one ₹ section, which is
            // what makes a single grand total meaningful.
            const row = toInr
                ? rowFor('INR', '₹', key, label)
                : rowFor(currency, inv.currency_symbol || null, key, label);
            row.invoice_count += 1;
            row.sales_value = r2(row.sales_value + sales);
            row.received = r2(row.received + received);
        }

        // Finalise each currency section: month zero-fill / customer sort,
        // outstanding, and a per-section subtotal (never cross-currency).
        const orderBy = query.order_by || 'value';
        const dir = query.order_direction === 'asc' ? 1 : -1;
        const keyOf = (x: SalesTurnoverRowDto): number =>
            orderBy === 'received'
                ? x.received
                : orderBy === 'outstanding'
                  ? x.outstanding
                  : orderBy === 'count'
                    ? x.invoice_count
                    : x.sales_value;

        const groups: CurrencyGroupDto[] = Array.from(groupMap.keys())
            .sort(currencyRank)
            .map((currency) => {
                const g = groupMap.get(currency)!;
                const rm = rowMapByCurrency.get(currency)!;
                let rows: SalesTurnoverRowDto[];
                if (groupBy === 'month') {
                    rows = [];
                    const cur = new Date(`${from.slice(0, 7)}-01T00:00:00`);
                    const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
                    while (cur <= end) {
                        const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`;
                        rows.push(
                            rm.get(key) || {
                                key,
                                label: monthLabel(key),
                                invoice_count: 0,
                                sales_value: 0,
                                received: 0,
                                outstanding: 0,
                            }
                        );
                        cur.setMonth(cur.getMonth() + 1);
                    }
                    rows.sort((a, b) => (a.key < b.key ? -1 : 1));
                } else {
                    rows = Array.from(rm.values());
                    rows.sort((a, b) => (keyOf(a) - keyOf(b)) * dir);
                }
                const totals = {
                    invoice_count: 0,
                    sales_value: 0,
                    received: 0,
                    outstanding: 0,
                };
                for (const row of rows) {
                    row.outstanding = r2(row.sales_value - row.received);
                    totals.invoice_count += row.invoice_count;
                    totals.sales_value = r2(totals.sales_value + row.sales_value);
                    totals.received = r2(totals.received + row.received);
                    totals.outstanding = r2(totals.outstanding + row.outstanding);
                }
                g.rows = rows;
                g.totals = totals;
                return g;
            });

        const overallInvoiceCount = groups.reduce(
            (s, g) => s + g.totals.invoice_count,
            0
        );

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            group_by: groupBy,
            groups,
            available_currencies: availableCurrencies,
            overall_invoice_count: overallInvoiceCount,
            currency_mode: toInr ? 'inr' : 'native',
        };
    }

    /**
     * The same report as an .xlsx Buffer. One sheet, a currency-header row
     * before each section's rows + its TOTAL — there is deliberately NO
     * cross-currency total cell (§12.1).
     */
    async salesTurnoverExcel(
        companyId: string,
        query: ISalesTurnoverQuery
    ): Promise<Buffer> {
        const result = await this.salesTurnover(companyId, query);
        const firstCol = result.group_by === 'customer' ? 'Customer' : 'Month';
        const header = [
            firstCol,
            'Invoices',
            'Sales Value',
            'Received',
            'Outstanding',
        ];

        const aoa: (string | number)[][] = [
            [`Sales Turnover — ${result.period_label}`],
            [`Grouped by: ${firstCol}  ·  Invoices: ${result.overall_invoice_count}`],
        ];
        // Say so on the sheet — otherwise a converted total is indistinguishable
        // from a native one once the file leaves the app.
        if (result.currency_mode === 'inr') {
            aoa.push([
                'All amounts converted to INR at each invoice\'s own exchange rate.',
            ]);
        }
        aoa.push([]);

        for (const g of result.groups) {
            const label = g.currency_symbol
                ? `${g.currency} (${g.currency_symbol})`
                : g.currency;
            aoa.push([label]); // currency section header
            aoa.push(header);
            for (const r of g.rows) {
                aoa.push([
                    r.label,
                    r.invoice_count,
                    r.sales_value,
                    r.received,
                    r.outstanding,
                ]);
            }
            aoa.push([
                'TOTAL',
                g.totals.invoice_count,
                g.totals.sales_value,
                g.totals.received,
                g.totals.outstanding,
            ]);
            aoa.push([]); // blank line between currency sections
        }

        return this.fileService.writeExcelFromArray(aoa);
    }

    async purchaseTurnover(
        companyId: string,
        query: IPurchaseTurnoverQuery
    ): Promise<PurchaseTurnoverResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const groupBy = query.group_by === 'vendor' ? 'vendor' : 'month';

        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
            status: { $in: ['dispatched', 'closed'] },
        };
        if (query.vendor_id) find.vendor_id = query.vendor_id;
        const povRaw: any[] = await this.povRepository.findAll(find as any);

        // A POV has no purchase-date column — date in JS on dispatch_date ||
        // createdAt (plan §12.2). No date drops out rather than mis-bucketing.
        const inRange = povRaw.filter((r) => {
            const d = povIsoDate(r);
            return !!d && d >= from && d <= to;
        });
        const dateById = new Map<string, string>(
            inRange.map((r) => [r._id.toString(), povIsoDate(r)])
        );

        const povs = inRange.length
            ? ((await this.povService.mapList(inRange as any)) as any[])
            : [];
        // payment_status is derived from amount_paid vs order value, not a
        // column — so it can only be filtered here, after mapList.
        const scoped = query.payment_status
            ? povs.filter((p) => p.payment_status === query.payment_status)
            : povs;

        const bucket = new Map<string, PurchaseTurnoverRowDto>();
        const rowFor = (key: string, label: string): PurchaseTurnoverRowDto => {
            if (!bucket.has(key)) {
                bucket.set(key, {
                    key,
                    label,
                    pov_count: 0,
                    taxable_inr: 0,
                    gst_inr: 0,
                    order_value_inr: 0,
                    paid_inr: 0,
                    outstanding_inr: 0,
                });
            }
            return bucket.get(key)!;
        };

        for (const pov of scoped) {
            const key =
                groupBy === 'vendor'
                    ? String(pov.vendor_id || '—')
                    : (dateById.get(pov._id) || '').slice(0, 7);
            if (!key) continue;
            const label =
                groupBy === 'vendor'
                    ? pov.vendor_name || '—'
                    : monthLabel(key);
            const row = rowFor(key, label);
            row.pov_count += 1;
            row.order_value_inr = r2(row.order_value_inr + n(pov.order_value));
            row.gst_inr = r2(row.gst_inr + n(pov.gst_inr));
            // GROSS — net_paid (after TDS) is the bank outflow, but gross is
            // what settles the vendor, so Outstanding must use it (plan §12.4).
            row.paid_inr = r2(row.paid_inr + n(pov.amount_paid));
        }

        // Month mode: emit every month in the range so a quiet month reads 0.00
        // rather than vanishing. Vendor mode: never invent rows.
        let rows: PurchaseTurnoverRowDto[];
        if (groupBy === 'month') {
            rows = [];
            const cur = new Date(`${from.slice(0, 7)}-01T00:00:00`);
            const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
            while (cur <= end) {
                const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`;
                rows.push(rowFor(key, monthLabel(key)));
                cur.setMonth(cur.getMonth() + 1);
            }
            rows.sort((a, b) => (a.key < b.key ? -1 : 1));
        } else {
            rows = Array.from(bucket.values());
            const orderBy = query.order_by || 'value';
            const dir = query.order_direction === 'asc' ? 1 : -1;
            const keyOf = (x: PurchaseTurnoverRowDto): number =>
                orderBy === 'paid'
                    ? x.paid_inr
                    : orderBy === 'outstanding'
                      ? x.outstanding_inr
                      : orderBy === 'count'
                        ? x.pov_count
                        : x.order_value_inr;
            rows.sort((a, b) => (keyOf(a) - keyOf(b)) * dir);
        }

        const totals = {
            pov_count: 0,
            taxable_inr: 0,
            gst_inr: 0,
            order_value_inr: 0,
            paid_inr: 0,
            outstanding_inr: 0,
        };
        for (const row of rows) {
            row.taxable_inr = r2(row.order_value_inr - row.gst_inr);
            row.outstanding_inr = r2(row.order_value_inr - row.paid_inr);
            totals.pov_count += row.pov_count;
            totals.taxable_inr = r2(totals.taxable_inr + row.taxable_inr);
            totals.gst_inr = r2(totals.gst_inr + row.gst_inr);
            totals.order_value_inr = r2(
                totals.order_value_inr + row.order_value_inr
            );
            totals.paid_inr = r2(totals.paid_inr + row.paid_inr);
            totals.outstanding_inr = r2(
                totals.outstanding_inr + row.outstanding_inr
            );
        }

        const perPage = Math.max(1, Math.min(100000, Number(query.perPage) || 25));
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            group_by: groupBy,
            rows: rows.slice(start, start + perPage),
            totals,
            currency: 'INR',
            pagination: {
                total: rows.length,
                perPage,
                orderBy: groupBy === 'month' ? 'month' : query.order_by || 'value',
            },
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async purchaseTurnoverExcel(
        companyId: string,
        query: IPurchaseTurnoverQuery
    ): Promise<Buffer> {
        const result = await this.purchaseTurnover(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });
        const header = [
            result.group_by === 'vendor' ? 'Vendor' : 'Month',
            'POVs',
            'Taxable (INR)',
            'GST (INR)',
            'Order Value (INR)',
            'Paid (INR)',
            'Outstanding (INR)',
        ];
        const body = result.rows.map((r) => [
            r.label,
            r.pov_count,
            r.taxable_inr,
            r.gst_inr,
            r.order_value_inr,
            r.paid_inr,
            r.outstanding_inr,
        ]);
        const totalRow = [
            'TOTAL',
            result.totals.pov_count,
            result.totals.taxable_inr,
            result.totals.gst_inr,
            result.totals.order_value_inr,
            result.totals.paid_inr,
            result.totals.outstanding_inr,
        ];
        const aoa: (string | number)[][] = [
            [
                `Purchase Turnover (VPO) — by ${result.group_by} — ${result.period_label} (INR)`,
            ],
            ['Dispatched + closed POVs. Paid is gross (before TDS).'],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── SO vs Invoice — Price Reconciliation ────────────────────────────
    /**
     * Per invoiced line, compares the FINAL CUSTOMER SELLING price on the
     * source Sales Order line against the actual invoiced price. Selling value
     * is defined identically on both sides so the comparison is fair:
     *   invoice line = invoice_line.taxable_amount                        (INR)
     *   SO line      = pol.taxable + expenses − rebates + margin          (INR)
     * Per-unit rate = value ÷ qty, expressed in the invoice's currency
     * (× exchange_rate). When the SO and invoice share a currency the SO uses
     * its OWN rate, so a rate change shows up as a difference (FX included). A
     * mismatched-currency SO is converted at the invoice rate and flagged.
     * Totals are kept in INR so they stay summable across currencies.
     */
    async soInvoiceReconciliation(
        companyId: string,
        query: ISoInvoiceReconQuery
    ): Promise<SoInvoiceReconciliationResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const customerId = query.customer_id || null;
        const invoiceId = query.invoice_id || null;
        const soId = query.purchase_order_id || null;
        const search = query.search?.trim() ? query.search.trim() : null;
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        const raw: any[] = await this.dataSource.query(
            `SELECT i._id                                          AS invoice_id,
                    i.voucher_no                                   AS invoice_no,
                    i.invoice_type                                 AS invoice_type,
                    i.invoice_date                                 AS invoice_date,
                    COALESCE(i.currency_code, 'INR')               AS inv_currency,
                    COALESCE(i.currency_symbol, '')                AS inv_symbol,
                    COALESCE(i.exchange_rate, '1')::float8         AS inv_fx,
                    c.company_name                                 AS customer_name,
                    po._id                                         AS so_id,
                    po.voucher_no                                  AS so_no,
                    COALESCE(po.currency_code, 'INR')              AS so_currency,
                    COALESCE(po.exchange_rate, '1')::float8        AS so_fx,
                    il.product_id                                  AS product_id,
                    COALESCE(p.name, il.product_name, '—')         AS product_name,
                    il.product_code                                AS product_code,
                    il.hsn_code                                    AS hsn_code,
                    il.seq                                         AS seq,
                    COALESCE(il.qty, 0)::float8                    AS inv_qty,
                    COALESCE(il.taxable_amount, 0)::float8         AS inv_value_inr,
                    COALESCE(pol.qty, 0)::float8                   AS so_qty,
                    (COALESCE(pol.taxable, 0)
                       + COALESCE(pol.product_expenses_amount, 0)
                       - COALESCE(pol.product_rebates_amount, 0)
                       + COALESCE(pol.margin_amount, 0))::float8   AS so_value_inr
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             JOIN purchase_order_lines pol
                 ON pol._id = il.purchase_order_line_id
             JOIN purchase_orders po
                 ON po._id = pol.purchase_order_id
             LEFT JOIN products p  ON p._id = il.product_id
             LEFT JOIN customers c ON c._id = i.customer_id
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR i.customer_id = $4)
               AND ($5::text IS NULL
                    OR il.product_name ILIKE '%' || $5 || '%'
                    OR il.product_code ILIKE '%' || $5 || '%')
             ORDER BY i.invoice_date DESC, i.voucher_no, il.seq`,
            [companyId, from, to, customerId, search]
        );

        // Count invoice lines in range with NO Sales Order link — surfaced so
        // the report never looks like it silently dropped rows.
        const unlinked: any[] = await this.dataSource.query(
            `SELECT COUNT(*)::int AS c
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id AND i.soft_delete = false
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND il.purchase_order_line_id IS NULL
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR i.customer_id = $4)`,
            [companyId, from, to, customerId]
        );

        // Dropdown sources — distinct invoices and SOs across the FULL
        // date/customer/search set, computed BEFORE the invoice/SO narrow so the
        // options stay stable while you pick one (same idea as the Sales Turnover
        // currency dropdown).
        const invMap = new Map<string, string>();
        const soMap = new Map<string, string>();
        for (const r of raw) {
            if (r.invoice_id && !invMap.has(String(r.invoice_id)))
                invMap.set(String(r.invoice_id), r.invoice_no);
            if (r.so_id && !soMap.has(String(r.so_id)))
                soMap.set(String(r.so_id), r.so_no);
        }
        const byNoDesc = (a: { no: string }, b: { no: string }) =>
            String(b.no || '').localeCompare(String(a.no || ''));
        const invoice_options = Array.from(invMap, ([id, no]) => ({
            id,
            no,
        })).sort(byNoDesc);
        const so_options = Array.from(soMap, ([id, no]) => ({ id, no })).sort(
            byNoDesc
        );

        // Apply the invoice / Sales Order narrows (dropdown filters).
        let narrowed = raw;
        if (invoiceId)
            narrowed = narrowed.filter((r) => String(r.invoice_id) === invoiceId);
        if (soId) narrowed = narrowed.filter((r) => String(r.so_id) === soId);

        const rows: SoInvoiceReconRowDto[] = narrowed.map((r) => {
            const invQty = n(r.inv_qty);
            const soQty = n(r.so_qty);
            const invValueInr = n(r.inv_value_inr);
            const soValueInrFull = n(r.so_value_inr);

            // Per-unit selling value (INR) on each side.
            const soRateInr = soQty > 0 ? soValueInrFull / soQty : null;
            const invRateInr = invQty > 0 ? invValueInr / invQty : null;

            // Express in the invoice currency. Same currency → SO keeps its own
            // FX (rate change becomes a visible difference). Different currency
            // → convert the SO at the invoice's rate and flag it.
            const invFx = n(r.inv_fx) || 1;
            const soFx = n(r.so_fx) || 1;
            const mismatch =
                String(r.so_currency) !== String(r.inv_currency);
            const soFxUsed = mismatch ? invFx : soFx;

            const invRate = invRateInr != null ? r2(invRateInr * invFx) : null;
            const soRate = soRateInr != null ? r2(soRateInr * soFxUsed) : null;
            const rateDiff =
                invRate != null && soRate != null
                    ? r2(invRate - soRate)
                    : null;
            const amountDiff =
                rateDiff != null ? r2(rateDiff * invQty) : null;
            const diffPct =
                rateDiff != null && soRate && soRate !== 0
                    ? r2((rateDiff / soRate) * 100)
                    : null;

            // INR totals base: the SO's expected value for the INVOICED qty
            // (like-for-like), and the actual invoiced value.
            const soValueForInvInr =
                soRateInr != null ? r2(soRateInr * invQty) : null;
            const varianceInr =
                soValueForInvInr != null
                    ? r2(invValueInr - soValueForInvInr)
                    : null;

            return {
                invoice_id: r.invoice_id,
                invoice_no: r.invoice_no,
                invoice_type: r.invoice_type,
                invoice_date: r.invoice_date,
                customer_name: r.customer_name ?? null,
                so_no: r.so_no ?? null,
                product_id: r.product_id ?? null,
                product_name: r.product_name ?? '—',
                product_code: r.product_code ?? null,
                hsn_code: r.hsn_code ?? null,
                currency_code: r.inv_currency,
                currency_symbol: r.inv_symbol || r.inv_currency,
                currency_mismatch: mismatch,
                so_qty: soQty || null,
                so_rate: soRate,
                inv_qty: invQty,
                inv_rate: invRate ?? 0,
                rate_diff: rateDiff,
                amount_diff: amountDiff,
                diff_pct: diffPct,
                so_value_inr: soValueForInvInr,
                invoice_value_inr: r2(invValueInr),
                variance_inr: varianceInr,
            };
        });

        // Totals in INR, over rows that are actually comparable (SO value known).
        const totals = rows.reduce(
            (acc, x) => {
                if (x.so_value_inr != null) {
                    acc.lines += 1;
                    acc.so_value_inr += x.so_value_inr;
                    acc.invoice_value_inr += x.invoice_value_inr;
                    acc.variance_inr += x.variance_inr || 0;
                }
                return acc;
            },
            {
                lines: 0,
                so_value_inr: 0,
                invoice_value_inr: 0,
                variance_inr: 0,
                unlinked_lines: n(unlinked?.[0]?.c),
            }
        );
        totals.so_value_inr = r2(totals.so_value_inr);
        totals.invoice_value_inr = r2(totals.invoice_value_inr);
        totals.variance_inr = r2(totals.variance_inr);

        const start = (page - 1) * perPage;
        const paged = rows.slice(start, start + perPage);

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: paged,
            totals,
            invoice_options,
            so_options,
            pagination: { total: rows.length, perPage },
        };
    }

    /** The same report as an .xlsx Buffer (whole filtered set + TOTAL row). */
    async soInvoiceReconciliationExcel(
        companyId: string,
        query: ISoInvoiceReconQuery
    ): Promise<Buffer> {
        const result = await this.soInvoiceReconciliation(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });
        const header = [
            'Invoice No',
            'Type',
            'Date',
            'Customer',
            'SO No',
            'Product',
            'Code',
            'HSN',
            'Currency',
            'SO Qty',
            'SO Sell Rate',
            'Inv Qty',
            'Inv Sell Rate',
            'Rate Diff',
            'Amount Diff',
            'Diff %',
        ];
        const body = result.rows.map((r) => [
            r.invoice_no,
            r.invoice_type,
            isoToDdmmyyyy(r.invoice_date),
            r.customer_name || '',
            r.so_no || '',
            r.product_name,
            r.product_code || '',
            r.hsn_code || '',
            r.currency_code + (r.currency_mismatch ? ' *' : ''),
            r.so_qty ?? '',
            r.so_rate ?? '',
            r.inv_qty,
            r.inv_rate,
            r.rate_diff ?? '',
            r.amount_diff ?? '',
            r.diff_pct ?? '',
        ]);
        const totalRow = [
            'TOTAL (INR)',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            result.totals.so_value_inr,
            '',
            result.totals.invoice_value_inr,
            '',
            result.totals.variance_inr,
            '',
        ];
        const aoa: (string | number)[][] = [
            [`SO vs Invoice — Price Reconciliation — ${result.period_label}`],
            [
                'Row amounts are in each invoice’s currency (* = SO currency differed, converted at invoice rate). Totals are INR.',
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── Stock Turnover Ratio ─────────────────────────────────────────────
    /**
     * How many times inventory is sold & replaced over the period, per product
     * and overall. Everything is valued in INR at each product's WEIGHTED-AVERAGE
     * vendor cost (Σ accepted GRN qty × POV unit_price ÷ Σ accepted qty), so the
     * two sides of the ratio are consistent:
     *
     *   turnover_ratio = COGS ÷ average inventory value
     *   COGS           = qty sold (issued invoices in range) × unit_cost
     *   avg inventory  = ((opening on-hand + closing on-hand) ÷ 2) × unit_cost
     *       opening on-hand = Σ stock_movements.qty before the start date
     *       closing on-hand = Σ stock_movements.qty through the end date
     *   dio_days       = period_days ÷ turnover_ratio   (days stock sits)
     *
     * Only products with sales OR held stock in the window are returned.
     */
    async stockTurnover(
        companyId: string,
        query: IStockTurnoverQuery
    ): Promise<StockTurnoverResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);

        // Inclusive day count for DIO.
        const periodDays =
            Math.max(
                1,
                Math.round(
                    (new Date(`${to}T00:00:00`).getTime() -
                        new Date(`${from}T00:00:00`).getTime()) /
                        86400000
                ) + 1
            );

        const params: any[] = [companyId, from, to];
        const filters: string[] = [];
        if (query.category_id) {
            params.push(query.category_id);
            filters.push(`AND p.category_id = $${params.length}`);
        }
        if (query.product_id) {
            params.push(query.product_id);
            filters.push(`AND p._id = $${params.length}`);
        }
        if (query.search && query.search.trim()) {
            params.push(`%${query.search.trim()}%`);
            filters.push(
                `AND (p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`
            );
        }

        const rowsRaw: any[] = await this.dataSource.query(
            `SELECT
                 p._id                              AS product_id,
                 p.code                             AS product_code,
                 p.name                             AS product_name,
                 cat.name                           AS category_name,
                 COALESCE(cost.cost_sum, 0)         AS cost_sum,
                 COALESCE(cost.qty_sum, 0)          AS cost_qty_sum,
                 COALESCE(sold.qty_sold, 0)         AS qty_sold,
                 COALESCE(oh.opening, 0)            AS opening,
                 COALESCE(oh.closing, 0)            AS closing
             FROM products p
             LEFT JOIN categories cat ON cat._id = p.category_id
             LEFT JOIN (
                 SELECT gl.product_id,
                        SUM(gl.accepted_qty::numeric * povl.unit_price::numeric) AS cost_sum,
                        SUM(gl.accepted_qty::numeric)                            AS qty_sum
                 FROM grn_lines gl
                 JOIN grns g
                   ON g._id = gl.grn_id
                  AND g.company_id = $1
                  AND g.soft_delete = false
                  AND g.status <> 'cancelled'
                 JOIN po_vendor_lines povl ON povl._id = gl.po_vendor_line_id
                 WHERE gl.accepted_qty::numeric > 0
                 GROUP BY gl.product_id
             ) cost ON cost.product_id = p._id
             LEFT JOIN (
                 SELECT il.product_id, SUM(il.qty::numeric) AS qty_sold
                 FROM invoice_lines il
                 JOIN invoices i
                   ON i._id = il.invoice_id
                  AND i.company_id = $1
                  AND i.soft_delete = false
                  AND i.status IN ('issued', 'partially_paid', 'paid')
                  AND i.invoice_date >= $2
                  AND i.invoice_date <= $3
                 GROUP BY il.product_id
             ) sold ON sold.product_id = p._id
             LEFT JOIN (
                 SELECT product_id,
                        SUM(CASE WHEN "createdAt" < $2::date
                                 THEN qty::numeric ELSE 0 END) AS opening,
                        SUM(CASE WHEN "createdAt" < ($3::date + INTERVAL '1 day')
                                 THEN qty::numeric ELSE 0 END) AS closing
                 FROM stock_movements
                 WHERE company_id = $1 AND deleted = false
                 GROUP BY product_id
             ) oh ON oh.product_id = p._id
             WHERE p.company_id = $1 AND p.soft_delete = false
             ${filters.join('\n             ')}`,
            params
        );

        let rows: StockTurnoverRowDto[] = rowsRaw
            .map((r) => {
                const opening = r2(n(r.opening));
                const closing = r2(n(r.closing));
                const avgQty = r2((opening + closing) / 2);
                const costQty = n(r.cost_qty_sum);
                const unitCost = costQty > 0 ? r2(n(r.cost_sum) / costQty) : 0;
                const qtySold = r2(n(r.qty_sold));
                // Inventory can't be negative in value terms; clamp.
                const avgInvValue = r2(Math.max(0, avgQty) * unitCost);
                const cogs = r2(qtySold * unitCost);
                const ratio =
                    avgInvValue > 0 ? r2(cogs / avgInvValue) : null;
                const dio =
                    ratio && ratio > 0 ? r2(periodDays / ratio) : null;
                return {
                    product_id: r.product_id,
                    product_code: r.product_code || undefined,
                    product_name: r.product_name,
                    category_name: r.category_name || undefined,
                    opening_qty: opening,
                    closing_qty: closing,
                    avg_qty: avgQty,
                    unit_cost: unitCost,
                    avg_inventory_value_inr: avgInvValue,
                    qty_sold: qtySold,
                    cogs_inr: cogs,
                    turnover_ratio: ratio,
                    dio_days: dio,
                } as StockTurnoverRowDto;
            })
            // Drop products with no sales and no stock in the window — they add
            // only noise (every catalogue item would otherwise list at 0).
            .filter(
                (r) =>
                    r.qty_sold !== 0 ||
                    r.opening_qty !== 0 ||
                    r.closing_qty !== 0
            );

        // Sort. `ratio`/`dio` push nulls to the end regardless of direction.
        const dir = query.order_direction === 'asc' ? 1 : -1;
        const orderBy = query.order_by || 'ratio';
        const numOr = (v: number | null, fallback: number): number =>
            v == null ? fallback : v;
        rows.sort((a, b) => {
            switch (orderBy) {
                case 'name':
                    return (
                        (a.product_name || '').localeCompare(
                            b.product_name || ''
                        ) * dir
                    );
                case 'cogs':
                    return (a.cogs_inr - b.cogs_inr) * dir;
                case 'inventory':
                    return (
                        (a.avg_inventory_value_inr -
                            b.avg_inventory_value_inr) *
                        dir
                    );
                case 'sold':
                    return (a.qty_sold - b.qty_sold) * dir;
                case 'dio':
                    // Nulls last.
                    return (
                        (numOr(a.dio_days, Number.POSITIVE_INFINITY) -
                            numOr(b.dio_days, Number.POSITIVE_INFINITY)) *
                        dir
                    );
                case 'ratio':
                default:
                    return (
                        (numOr(a.turnover_ratio, -1) -
                            numOr(b.turnover_ratio, -1)) *
                        dir
                    );
            }
        });

        const totalCogs = r2(rows.reduce((s, r) => s + r.cogs_inr, 0));
        const totalInv = r2(
            rows.reduce((s, r) => s + r.avg_inventory_value_inr, 0)
        );
        const totalSold = r2(rows.reduce((s, r) => s + r.qty_sold, 0));
        const overallRatio = totalInv > 0 ? r2(totalCogs / totalInv) : null;
        const overallDio =
            overallRatio && overallRatio > 0
                ? r2(periodDays / overallRatio)
                : null;

        const perPage = Math.max(
            1,
            Math.min(100000, Number(query.perPage) || 25)
        );
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            period_days: periodDays,
            rows: rows.slice(start, start + perPage),
            totals: {
                product_count: rows.length,
                qty_sold: totalSold,
                avg_inventory_value_inr: totalInv,
                cogs_inr: totalCogs,
                turnover_ratio: overallRatio,
                dio_days: overallDio,
            },
            currency: 'INR',
            pagination: {
                total: rows.length,
                perPage,
                orderBy,
            },
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async stockTurnoverExcel(
        companyId: string,
        query: IStockTurnoverQuery
    ): Promise<Buffer> {
        const result = await this.stockTurnover(companyId, {
            ...query,
            page: 1,
            perPage: 100000,
        });
        const dash = (v: number | null): string | number =>
            v == null ? '—' : v;
        const header = [
            'Product',
            'Code',
            'Category',
            'Opening Qty',
            'Closing Qty',
            'Avg Qty',
            'Unit Cost (INR)',
            'Avg Inventory Value (INR)',
            'Qty Sold',
            'COGS (INR)',
            'Turnover Ratio',
            'DIO (days)',
        ];
        const body = result.rows.map((r) => [
            r.product_name,
            r.product_code || '',
            r.category_name || '',
            r.opening_qty,
            r.closing_qty,
            r.avg_qty,
            r.unit_cost,
            r.avg_inventory_value_inr,
            r.qty_sold,
            r.cogs_inr,
            dash(r.turnover_ratio),
            dash(r.dio_days),
        ]);
        const totalRow = [
            'TOTAL',
            '',
            '',
            '',
            '',
            '',
            '',
            result.totals.avg_inventory_value_inr,
            result.totals.qty_sold,
            result.totals.cogs_inr,
            dash(result.totals.turnover_ratio),
            dash(result.totals.dio_days),
        ];
        const aoa: (string | number)[][] = [
            [`Stock Turnover Ratio — ${result.period_label} (INR)`],
            [
                'Ratio = COGS ÷ avg inventory value, at weighted-avg vendor cost. DIO = days stock sits before it sells.',
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── Inventory Holding Days ───────────────────────────────────────────
    /**
     * Average number of days a unit was HELD IN STOCK before it sold. Anchored
     * on issued invoices (a unit only counts once it has actually sold). FIFO
     * cohort matching per product:
     *
     *   - Receipt cohorts = confirmed GRN accepted_qty at grn_date (oldest-first)
     *   - Sale events      = issued invoice_line qty at invoice_date (oldest-first)
     *   - Walk ALL sales up to `date_to` in order, consuming receipts FIFO so
     *     pre-range sales correctly deplete early cohorts; each matched slice
     *     whose SALE date is in [from, to] contributes (qty × holding_days) to
     *     the average, where holding_days = max(0, sale_date − receipt_date).
     *   - avg = Σ(qty × days) ÷ Σ qty (qty-weighted), per product and pooled.
     *
     * Sold qty with no receipt on record (opening stock) is reported as
     * `unmatched_qty`, excluded from the average.
     */
    async inventoryHoldingDays(
        companyId: string,
        query: IInventoryHoldingDaysQuery
    ): Promise<InventoryHoldingDaysResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);

        // Which products to emit (metadata + filters).
        const pParams: any[] = [companyId];
        const pFilters: string[] = [];
        if (query.category_id) {
            pParams.push(query.category_id);
            pFilters.push(`AND p.category_id = $${pParams.length}`);
        }
        if (query.product_id) {
            pParams.push(query.product_id);
            pFilters.push(`AND p._id = $${pParams.length}`);
        }
        if (query.search && query.search.trim()) {
            pParams.push(`%${query.search.trim()}%`);
            pFilters.push(
                `AND (p.name ILIKE $${pParams.length} OR p.code ILIKE $${pParams.length})`
            );
        }
        const prods: any[] = await this.dataSource.query(
            `SELECT p._id       AS product_id,
                    p.code      AS product_code,
                    p.name      AS product_name,
                    cat.name    AS category_name
             FROM products p
             LEFT JOIN categories cat ON cat._id = p.category_id
             WHERE p.company_id = $1 AND p.soft_delete = false
             ${pFilters.join('\n             ')}`,
            pParams
        );
        const metaById = new Map<string, any>(
            prods.map((r) => [r.product_id, r])
        );

        // Sales up to `to` (pre-range sales still deplete cohorts correctly).
        const salesRaw: any[] = metaById.size
            ? await this.dataSource.query(
                  `SELECT il.product_id AS product_id,
                          i.invoice_date AS d,
                          SUM(il.qty::numeric) AS qty
                   FROM invoice_lines il
                   JOIN invoices i
                     ON i._id = il.invoice_id
                    AND i.company_id = $1
                    AND i.soft_delete = false
                    AND i.status IN ('issued', 'partially_paid', 'paid')
                    AND i.invoice_date <= $2
                   GROUP BY il.product_id, i.invoice_date`,
                  [companyId, to]
              )
            : [];

        // Receipts up to `to`.
        const recvRaw: any[] = metaById.size
            ? await this.dataSource.query(
                  `SELECT gl.product_id AS product_id,
                          g.grn_date AS d,
                          SUM(gl.accepted_qty::numeric) AS qty
                   FROM grn_lines gl
                   JOIN grns g
                     ON g._id = gl.grn_id
                    AND g.company_id = $1
                    AND g.soft_delete = false
                    AND g.status = 'confirmed'
                   WHERE gl.accepted_qty::numeric > 0
                     AND g.grn_date <= $2
                   GROUP BY gl.product_id, g.grn_date`,
                  [companyId, to]
              )
            : [];

        const isoOf = (x: any): string =>
            !x ? '' : x instanceof Date ? isoDate(x) : String(x).slice(0, 10);
        const dayDiff = (a: string, b: string): number =>
            Math.round(
                (new Date(`${b}T00:00:00`).getTime() -
                    new Date(`${a}T00:00:00`).getTime()) /
                    86400000
            );

        const salesByProduct = new Map<string, Array<{ d: string; qty: number }>>();
        for (const s of salesRaw) {
            const arr = salesByProduct.get(s.product_id) || [];
            arr.push({ d: isoOf(s.d), qty: n(s.qty) });
            salesByProduct.set(s.product_id, arr);
        }
        const recvByProduct = new Map<string, Array<{ d: string; qty: number }>>();
        for (const r of recvRaw) {
            const arr = recvByProduct.get(r.product_id) || [];
            arr.push({ d: isoOf(r.d), qty: n(r.qty) });
            recvByProduct.set(r.product_id, arr);
        }

        let rows: InventoryHoldingDaysRowDto[] = [];
        for (const [pid, meta] of metaById.entries()) {
            const sales = (salesByProduct.get(pid) || [])
                .slice()
                .sort((a, b) => (a.d < b.d ? -1 : 1));
            const receipts = (recvByProduct.get(pid) || [])
                .map((r) => ({ ...r }))
                .sort((a, b) => (a.d < b.d ? -1 : 1));

            let ri = 0;
            let remaining = receipts[0]?.qty || 0;
            let wSum = 0;
            let qMatched = 0;
            let unmatched = 0;
            let minD: number | null = null;
            let maxD: number | null = null;
            let firstSale: string | undefined;
            let lastSale: string | undefined;

            for (const sale of sales) {
                let need = sale.qty;
                const inRange = sale.d >= from && sale.d <= to;
                if (inRange) {
                    if (!firstSale) firstSale = sale.d;
                    lastSale = sale.d;
                }
                while (need > 1e-9 && ri < receipts.length) {
                    if (remaining <= 1e-9) {
                        ri += 1;
                        remaining = receipts[ri]?.qty || 0;
                        continue;
                    }
                    const take = Math.min(need, remaining);
                    remaining = round4(remaining - take);
                    need = round4(need - take);
                    if (inRange) {
                        const days = Math.max(0, dayDiff(receipts[ri].d, sale.d));
                        wSum += take * days;
                        qMatched = round4(qMatched + take);
                        minD = minD == null ? days : Math.min(minD, days);
                        maxD = maxD == null ? days : Math.max(maxD, days);
                    }
                }
                // Sold beyond every receipt on record → no cohort to match.
                if (need > 1e-9 && inRange) unmatched = round4(unmatched + need);
            }

            // Only products with a sale in the window are relevant.
            if (qMatched <= 1e-9 && unmatched <= 1e-9) continue;
            rows.push({
                product_id: pid,
                product_code: meta.product_code || undefined,
                product_name: meta.product_name,
                category_name: meta.category_name || undefined,
                qty_sold_matched: r2(qMatched),
                avg_holding_days: qMatched > 0 ? r2(wSum / qMatched) : 0,
                min_holding_days: minD ?? 0,
                max_holding_days: maxD ?? 0,
                first_sale_date: firstSale,
                last_sale_date: lastSale,
                unmatched_qty: r2(unmatched),
            });
        }

        const dir = query.order_direction === 'asc' ? 1 : -1;
        const orderBy = query.order_by || 'days';
        rows.sort((a, b) => {
            switch (orderBy) {
                case 'name':
                    return (
                        (a.product_name || '').localeCompare(
                            b.product_name || ''
                        ) * dir
                    );
                case 'sold':
                    return (a.qty_sold_matched - b.qty_sold_matched) * dir;
                case 'days':
                default:
                    return (a.avg_holding_days - b.avg_holding_days) * dir;
            }
        });

        // Pooled average across every matched unit + total unmatched.
        let totWSum = 0;
        let totMatched = 0;
        let totUnmatched = 0;
        for (const r of rows) {
            totWSum += r.avg_holding_days * r.qty_sold_matched;
            totMatched = r2(totMatched + r.qty_sold_matched);
            totUnmatched = r2(totUnmatched + r.unmatched_qty);
        }

        const perPage = Math.max(
            1,
            Math.min(100000, Number(query.perPage) || 25)
        );
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: rows.slice(start, start + perPage),
            totals: {
                product_count: rows.length,
                qty_sold_matched: totMatched,
                avg_holding_days: totMatched > 0 ? r2(totWSum / totMatched) : null,
                unmatched_qty: totUnmatched,
            },
            pagination: {
                total: rows.length,
                perPage,
                orderBy,
            },
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async inventoryHoldingDaysExcel(
        companyId: string,
        query: IInventoryHoldingDaysQuery
    ): Promise<Buffer> {
        const result = await this.inventoryHoldingDays(companyId, {
            ...query,
            page: 1,
            perPage: 100000,
        });
        const header = [
            'Product',
            'Code',
            'Category',
            'Qty Sold (matched)',
            'Avg Holding Days',
            'Min Days',
            'Max Days',
            'First Sale',
            'Last Sale',
            'Unmatched Qty',
        ];
        const body = result.rows.map((r) => [
            r.product_name,
            r.product_code || '',
            r.category_name || '',
            r.qty_sold_matched,
            r.avg_holding_days,
            r.min_holding_days,
            r.max_holding_days,
            r.first_sale_date ? isoToDdmmyyyy(r.first_sale_date) : '',
            r.last_sale_date ? isoToDdmmyyyy(r.last_sale_date) : '',
            r.unmatched_qty,
        ]);
        const totalRow = [
            'TOTAL',
            '',
            '',
            result.totals.qty_sold_matched,
            result.totals.avg_holding_days == null
                ? '—'
                : result.totals.avg_holding_days,
            '',
            '',
            '',
            '',
            result.totals.unmatched_qty,
        ];
        const aoa: (string | number)[][] = [
            [`Inventory Holding Days — ${result.period_label}`],
            [
                'Avg days a unit was held (GRN receipt → sale) via FIFO matching, for units sold (invoice issued) in the period.',
            ],
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
