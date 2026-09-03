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
import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { ENUM_GRN_STATUS } from '@modules/grn/enums/grn.enum';
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
    PurchaseCurrencyGroupDto,
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
    LeadToInvoiceDurationResponseDto,
    LeadToInvoiceDurationRowDto,
} from '../dtos/response/lead-to-invoice-duration.response.dto';
import {
    AdvanceVsInvoiceResponseDto,
    AdvanceVsInvoiceRowDto,
} from '../dtos/response/advance-vs-invoice.response.dto';
import {
    ExchangeGainLossResponseDto,
    ExchangeGainLossRowDto,
} from '../dtos/response/exchange-gain-loss.response.dto';
import {
    DocStatusResponseDto,
    DocStatusRowDto,
    DocStatusTotalsDto,
    DocStatusOptionDto,
    DocStatusBreakdownRowDto,
    DocStatusLineBreakdownRowDto,
} from '../dtos/response/doc-status.response.dto';
import {
    StockTurnoverResponseDto,
    StockTurnoverRowDto,
} from '../dtos/response/stock-turnover.response.dto';
import {
    InventoryHoldingDaysResponseDto,
    InventoryHoldingDaysRowDto,
} from '../dtos/response/inventory-holding-days.response.dto';
import {
    InventoryAgingResponseDto,
    InventoryAgingRowDto,
} from '../dtos/response/inventory-aging.response.dto';

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

export interface IInventoryAgingQuery {
    as_of?: string;
    category_id?: string;
    product_id?: string;
    search?: string;
    order_by?: 'oldest' | 'closing_value' | 'name';
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

export interface ILeadToInvoiceDurationQuery {
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** 'export' (default) | 'commercial' | 'all'. */
    invoice_type?: string;
    /** Free text over invoice / SO / quotation / lead voucher numbers. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface IAdvanceVsInvoiceQuery {
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** all | advance_unbilled | partly_adjusted | fully_adjusted | no_advance */
    status?: string;
    /** Free text over SO voucher / customer name. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface IExchangeGainLossQuery {
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** all | gain | loss */
    result?: string;
    /** Free text over invoice / receipt voucher / customer name. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface ISalesOrderStatusQuery {
    date_from?: string;
    date_to?: string;
    customer_id?: string;
    /** open | partial | closed — coverage status filter. */
    status?: string;
    /** export | domestic | all — which invoices count toward coverage. */
    invoice_type?: string;
    /** Free text over SO voucher / customer name. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface IPurchaseOrderStatusQuery {
    date_from?: string;
    date_to?: string;
    vendor_id?: string;
    /** open | partial | closed — coverage status filter. */
    status?: string;
    /** confirmed | all — which GRNs count toward coverage (received qty). */
    grn_scope?: string;
    /** Free text over POV voucher / vendor name. */
    search?: string;
    page?: number;
    perPage?: number;
}

export interface IPurchaseTurnoverQuery {
    group_by?: 'month' | 'vendor';
    date_from?: string;
    date_to?: string;
    vendor_id?: string;
    /** Narrow to one currency section. */
    currency?: string;
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
        private readonly customerRepository: CustomerRepository,
        // Purchase Turnover — GRN (goods actually received), not the PO/POV.
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly povLineRepository: PoVendorLineRepository
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
                    -- Multi-currency: il.taxable_amount is in the invoice's
                    -- DOCUMENT (customer) currency, so divide by the frozen
                    -- exchange_rate (doc-per-₹1) to get true INR before summing
                    -- across invoices of different currencies. Domestic INR
                    -- invoices have exchange_rate = 1, so this is a no-op there.
                    COALESCE(SUM(
                        il.taxable_amount
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1)
                    ), 0)::float8                                        AS revenue_inr,
                    COALESCE(SUM(
                        (il.taxable_amount
                            / NULLIF(1 + COALESCE(il.margin_pct, 0) / 100.0, 0))
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1)
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

        // Multi-currency: line `taxable_amount` is in the invoice's DOCUMENT
        // (customer) currency (invoice.service.ts `recompute()` — the cost is
        // converted source→doc, margin built in doc currency). GSTR-1 Table 12
        // is a statutory INR return, so convert each line to INR by dividing by
        // the invoice's frozen exchange_rate (doc-per-₹1) before summing across
        // currencies. Domestic INR invoices have exchange_rate = 1 (no-op).
        const raw: any[] = await this.dataSource.query(
            `SELECT il.hsn_code                                     AS hsn_code,
                    MAX(il.product_name)                            AS description,
                    il.uqc_code                                     AS uqc_code,
                    COALESCE(il.igst_rate_pct, 0)::float8           AS rate,
                    COALESCE(SUM(il.qty), 0)::float8                AS total_qty,
                    COALESCE(SUM(
                        il.taxable_amount
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1)
                    ), 0)::float8                                   AS taxable_value_inr,
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN (il.taxable_amount
                                   / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))
                                  * COALESCE(il.igst_rate_pct, 0) / 100.0
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
                    -- Multi-currency: convert doc-currency line value → INR by
                    -- the invoice's frozen rate, so the drawer foots to the
                    -- (INR-converted) summary row it opened from.
                    (COALESCE(il.taxable_amount, 0)
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))::float8
                                                                    AS taxable_value_inr,
                    CASE WHEN i.gst_route = 'igst_paid'
                         THEN (COALESCE(il.taxable_amount, 0)
                               / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))
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
     * Input GST source rows — CONFIRMED GRNs (goods actually received), not
     * the PO/POV itself (client change-request #9, 2026-08-19: "Input GST
     * must be linked with GRN or purchase invoices, not purchase orders" — a
     * dispatched-but-not-yet-received POV carries no ITC yet). Domestic (INR)
     * only, same GST-inclusive goods valuation as Purchase Turnover / the
     * Vendor Ledger's GRN credit rows, dated by `grn_date`. Shared by
     * `gstBalance()` (the aggregate) and `fetchGstBalanceSources()` (the
     * drill-down), so both agree on exactly which rows count.
     */
    private async grnGstPurchaseRows(
        companyId: string,
        from: string,
        to: string
    ): Promise<
        Array<{
            grn_id: string;
            po_vendor_id?: string;
            voucher_no: string;
            vendor_id?: string;
            date: string;
            taxable_inr: number;
            gst_inr: number;
        }>
    > {
        const allGrns: any[] = await this.grnRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            status: ENUM_GRN_STATUS.CONFIRMED,
        } as any);
        const inRange = allGrns.filter((g) => {
            const d = String(g.grn_date || '').slice(0, 10);
            return !!d && d >= from && d <= to;
        });
        if (!inRange.length) return [];

        const grnIds = inRange.map((g) => g._id.toString());
        const povIds = Array.from(
            new Set(
                inRange.map((g) => g.po_vendor_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const [grnLines, povLines, povRows] = await Promise.all([
            this.grnLineRepository.findAll({
                grn_id: { $in: grnIds },
                soft_delete: false,
            } as any) as Promise<any[]>,
            povIds.length
                ? (this.povLineRepository.findAll({
                      po_vendor_id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            povIds.length
                ? (this.povRepository.findAll({
                      _id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const povById = new Map<string, any>(
            povRows.map((p) => [p._id.toString(), p])
        );
        const povLineById = new Map<string, any>();
        for (const pl of povLines) povLineById.set(pl._id.toString(), pl);

        const valueByGrn = new Map<string, { taxable: number; gst: number }>();
        for (const l of grnLines) {
            const k = l.grn_id.toString();
            const pl = povLineById.get(l.po_vendor_line_id?.toString());
            const price = n(pl?.unit_price);
            const disc = n(pl?.discount_pct);
            const tax = n(pl?.tax_pct);
            const base = n(l.accepted_qty) * price * (1 - disc / 100);
            const gstAmt = base * (tax / 100);
            const cur = valueByGrn.get(k) || { taxable: 0, gst: 0 };
            cur.taxable += base;
            cur.gst += gstAmt;
            valueByGrn.set(k, cur);
        }

        const rows: Array<{
            grn_id: string;
            po_vendor_id?: string;
            voucher_no: string;
            vendor_id?: string;
            date: string;
            taxable_inr: number;
            gst_inr: number;
        }> = [];
        for (const g of inRange) {
            const povId = g.po_vendor_id?.toString();
            const pov = povId ? povById.get(povId) : undefined;
            // GST is an Indian DOMESTIC tax — a foreign-currency POV (import)
            // carries no POV-level Indian GST/ITC (import IGST is paid
            // separately at customs, not modelled here). Mirrors the old
            // POV-based gate.
            if ((pov?.currency_code || 'INR') !== 'INR') continue;
            const v = valueByGrn.get(g._id.toString()) || {
                taxable: 0,
                gst: 0,
            };
            rows.push({
                grn_id: g._id.toString(),
                po_vendor_id: povId,
                voucher_no: g.voucher_no,
                vendor_id: g.vendor_id?.toString(),
                date: String(g.grn_date || '').slice(0, 10),
                taxable_inr: r2(v.taxable),
                gst_inr: r2(v.gst),
            });
        }
        return rows;
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
                    -- Multi-currency: il.taxable_amount is in the invoice's
                    -- document currency; divide by the frozen exchange_rate
                    -- (doc-per-₹1) for the statutory INR figure. Domestic INR
                    -- invoices have rate = 1 (no-op).
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN (il.taxable_amount
                                   / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))
                                  * COALESCE(il.igst_rate_pct, 0) / 100.0
                             ELSE 0 END
                    ), 0)::float8                                     AS output_igst_inr,
                    -- The taxable sales value that IGST was computed on.
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN il.taxable_amount
                                  / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1)
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

        // ── Input: confirmed-GRN GST, split by state ──
        // Client change-request #9: linked to GRN (goods actually received),
        // not the PO/POV — see `grnGstPurchaseRows` above.
        let unclassifiedPovs = 0;
        const grnPurchases = await this.grnGstPurchaseRows(companyId, from, to);
        if (grnPurchases.length) {
            const monthByGrn = new Map<string, string>(
                grnPurchases.map((g) => [g.grn_id, monthOf(g.date)])
            );
            const povIds = Array.from(
                new Set(
                    grnPurchases.map((g) => g.po_vendor_id).filter(Boolean)
                )
            ) as string[];
            const vendorIds = Array.from(
                new Set(grnPurchases.map((g) => g.vendor_id).filter(Boolean))
            ) as string[];
            const [povRowsForAddr, vendors, addresses, mine] =
                await Promise.all([
                    povIds.length
                        ? (this.povRepository.findAll({
                              _id: { $in: povIds },
                          } as any) as Promise<any[]>)
                        : Promise.resolve([] as any[]),
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

            const povAddrIdById = new Map<string, string>(
                (povRowsForAddr as any[])
                    .filter((p) => p.vendor_address_id)
                    .map((p) => [
                        p._id.toString(),
                        p.vendor_address_id.toString(),
                    ])
            );
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

            for (const g of grnPurchases) {
                const gst = g.gst_inr;
                const row = rowFor(monthByGrn.get(g.grn_id) || monthOf(from));
                // The purchase amount the GST was charged on: goods, excluding
                // the tax itself. Accumulated BEFORE the `gst <= 0` skip, so a
                // zero-rated domestic receipt still shows its value.
                row.input_taxable_inr = r2(
                    row.input_taxable_inr + g.taxable_inr
                );
                if (gst <= 0) continue;

                // GSTIN lives on the ADDRESS first, the vendor master second —
                // most data fills only the address one. Address = the POV's
                // own billed-from address (same precedence as
                // po-vendor-pdf.service.ts:178-227), falling back to the
                // vendor's preferred address.
                const vendor = vendorById.get(String(g.vendor_id));
                const addr =
                    addrById.get(
                        povAddrIdById.get(String(g.po_vendor_id)) || ''
                    ) || addrByVendor.get(String(g.vendor_id));
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
                    // Halve the GRN's own GST rather than re-deriving per
                    // line, so CGST + SGST always foots back to it to the
                    // paisa.
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
     * than month-by-month, so twelve monthly calls don't turn into twelve
     * full scans of the GRN table.
     */
    private async fetchGstBalanceSources(
        companyId: string,
        from: string,
        to: string
    ): Promise<{
        purchases: GstBalancePurchaseSourceDto[];
        sales: GstBalanceSalesSourceDto[];
    }> {
        // ── Purchases (the actual question) — CONFIRMED GRNs, one row each ──
        // Client change-request #9: linked to GRN (goods actually received),
        // not the PO/POV — see `grnGstPurchaseRows`.
        const grnPurchases = await this.grnGstPurchaseRows(companyId, from, to);

        const purchases: GstBalancePurchaseSourceDto[] = [];
        if (grnPurchases.length) {
            const povIds = Array.from(
                new Set(
                    grnPurchases.map((g) => g.po_vendor_id).filter(Boolean)
                )
            ) as string[];
            const vendorIds = Array.from(
                new Set(grnPurchases.map((g) => g.vendor_id).filter(Boolean))
            ) as string[];
            const [povRowsForAddr, vendors, addresses, mine] =
                await Promise.all([
                    povIds.length
                        ? (this.povRepository.findAll({
                              _id: { $in: povIds },
                          } as any) as Promise<any[]>)
                        : Promise.resolve([] as any[]),
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
            const povAddrIdById = new Map<string, string>(
                (povRowsForAddr as any[])
                    .filter((p) => p.vendor_address_id)
                    .map((p) => [
                        p._id.toString(),
                        p.vendor_address_id.toString(),
                    ])
            );
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

            for (const g of grnPurchases) {
                const gst = g.gst_inr;
                const vendor = vendorById.get(String(g.vendor_id));
                const addr =
                    addrById.get(
                        povAddrIdById.get(String(g.po_vendor_id)) || ''
                    ) || addrByVendor.get(String(g.vendor_id));
                const vendorCode = gstStateCode(addr?.gstin || vendor?.gstin);
                let intra: boolean | null = null;
                if (vendorCode && mine.code) {
                    intra = vendorCode === mine.code;
                } else {
                    const vState = norm(addr?.state);
                    if (vState && mine.name) intra = vState === mine.name;
                }
                purchases.push({
                    grn_id: g.grn_id,
                    po_vendor_id: g.po_vendor_id || '',
                    voucher_no: g.voucher_no,
                    vendor_name: vendor?.company_name || '—',
                    vendor_state: addr?.state || null,
                    status: 'confirmed',
                    date: g.date,
                    taxable_inr: g.taxable_inr,
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
                    -- Multi-currency: doc-currency line value → INR via the
                    -- invoice's frozen rate (doc-per-₹1); domestic = rate 1.
                    COALESCE(SUM(
                        il.taxable_amount
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1)
                    ), 0)::float8                                      AS taxable_inr,
                    COALESCE(SUM(
                        CASE WHEN i.gst_route = 'igst_paid'
                             THEN (il.taxable_amount
                                   / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))
                                  * COALESCE(il.igst_rate_pct, 0) / 100.0
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
                'Purchase Taxable = goods received on CONFIRMED GRNs, excl. GST (dated by GRN date; a dispatched-but-not-yet-received Vendor PO does not count yet).',
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
        // and the purchase side would otherwise re-scan every GRN per month.
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const { purchases, sales } = await this.fetchGstBalanceSources(
            companyId,
            from,
            to
        );

        // Split each row's GST into the three tax-type columns the client
        // asked for, driven by the same classification the GST Split label
        // shows: inter-state → IGST, intra-state → half CGST / half SGST.
        // Unclassified/none rows can't be split, so their GST stays only in
        // the GST (INR) total (mirrors the Unclassified bucket on Sheet 1).
        const splitGst = (
            p: GstBalancePurchaseSourceDto
        ): { cgst: number; sgst: number; igst: number } => {
            const g = r2(n(p.gst_inr));
            if (p.gst_split === 'igst') return { cgst: 0, sgst: 0, igst: g };
            if (p.gst_split === 'cgst_sgst') {
                const half = r2(g / 2);
                return { cgst: half, sgst: r2(g - half), igst: 0 };
            }
            return { cgst: 0, sgst: 0, igst: 0 };
        };

        const purchaseHeader = [
            'Month',
            'Date',
            'GRN',
            'Vendor',
            'Vendor State',
            'Status',
            'Taxable (INR)',
            'GST (INR)',
            'CGST (INR)',
            'SGST (INR)',
            'IGST (INR)',
            'GST Split',
        ];
        const purchaseBody = purchases.map((p) => {
            const s = splitGst(p);
            return [
                monthLabel(String(p.date || '').slice(0, 7)),
                isoToDdmmyyyy(String(p.date || '')),
                p.voucher_no,
                p.vendor_name,
                p.vendor_state || '—',
                p.status,
                p.taxable_inr,
                p.gst_inr,
                s.cgst,
                s.sgst,
                s.igst,
                p.gst_split,
            ];
        });
        const purchaseTotals = purchases.reduce(
            (acc, p) => {
                const s = splitGst(p);
                acc.taxable += p.taxable_inr;
                acc.gst += p.gst_inr;
                acc.cgst += s.cgst;
                acc.sgst += s.sgst;
                acc.igst += s.igst;
                return acc;
            },
            { taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 }
        );
        const purchaseAoa: (string | number)[][] = [
            [
                `Purchases — GRNs behind the Input GST — ${result.period_label} (INR). Totals back to the Purchase Taxable and input-tax columns on the GST Balance sheet.`,
            ],
            [
                'GST Split: igst = inter-state vendor, cgst_sgst = same state as the company, unclassified = vendor state unknown (no GSTIN on file). CGST/SGST/IGST columns split the row GST by that classification; unclassified rows keep their GST in the GST (INR) column only.',
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
                r2(purchaseTotals.cgst),
                r2(purchaseTotals.sgst),
                r2(purchaseTotals.igst),
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
        const header = [firstCol, 'Invoices', 'Sales Value'];

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
                aoa.push([r.label, r.invoice_count, r.sales_value]);
            }
            aoa.push([
                'TOTAL',
                g.totals.invoice_count,
                g.totals.sales_value,
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

        // Client rule (client change-request #8): turnover reflects goods
        // ACTUALLY RECEIVED — a confirmed GRN — not the PO/POV, which may not
        // have been fulfilled yet. One row per GRN (mirrors Sales Turnover's
        // one row per invoice). Fetched company-wide first (not date-limited)
        // so a POV's total received value across ALL its GRNs can be used as
        // the denominator when apportioning that POV's payments fairly across
        // GRNs booked on different dates (see `paidShare` below).
        const grnFind: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
            status: ENUM_GRN_STATUS.CONFIRMED,
        };
        if (query.vendor_id) grnFind.vendor_id = query.vendor_id;
        const allGrns: any[] = await this.grnRepository.findAll(
            grnFind as any
        );

        if (!allGrns.length) {
            return {
                period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
                group_by: groupBy,
                groups: [],
                available_currencies: [],
                overall_pov_count: 0,
            };
        }

        const grnIds = allGrns.map((g) => g._id.toString());
        const povIds = Array.from(
            new Set(
                allGrns.map((g) => g.po_vendor_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const [grnLines, povLines, povRows] = await Promise.all([
            this.grnLineRepository.findAll({
                grn_id: { $in: grnIds },
                soft_delete: false,
            } as any) as Promise<any[]>,
            povIds.length
                ? (this.povLineRepository.findAll({
                      po_vendor_id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            povIds.length
                ? (this.povRepository.findAll({
                      _id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        const povs = povRows.length
            ? ((await this.povService.mapList(povRows as any)) as any[])
            : [];
        const povById = new Map<string, any>(
            povs.map((p) => [String(p._id), p])
        );
        const povLineById = new Map<string, any>();
        for (const pl of povLines) povLineById.set(pl._id.toString(), pl);

        // Vendor names for GRNs whose POV link may be missing (shouldn't
        // happen, but GRN carries its own vendor_id so it's the safe source).
        const vendorIds = Array.from(
            new Set(allGrns.map((g) => g.vendor_id?.toString()).filter(Boolean))
        ) as string[];
        const vendorNameById = new Map<string, string>();
        if (vendorIds.length) {
            const vendors: any[] = await this.vendorRepository.findAll({
                _id: { $in: vendorIds },
            } as any);
            for (const v of vendors)
                vendorNameById.set(v._id.toString(), v.company_name || '—');
        }

        // Per-GRN value = Σ(accepted qty × price × (1−disc%)) taxable, and its
        // GST — same GST-INCLUSIVE billed-value formula the Vendor Ledger's
        // GRN credit rows use (client 2026-08-06), so this report and the
        // ledger agree on what a GRN is worth.
        const valueByGrn = new Map<
            string,
            { taxable: number; gst: number; total: number }
        >();
        for (const l of grnLines) {
            const k = l.grn_id.toString();
            const pl = povLineById.get(l.po_vendor_line_id?.toString());
            const price = n(pl?.unit_price);
            const disc = n(pl?.discount_pct);
            const tax = n(pl?.tax_pct);
            const base = n(l.accepted_qty) * price * (1 - disc / 100);
            const gstAmt = base * (tax / 100);
            const cur = valueByGrn.get(k) || { taxable: 0, gst: 0, total: 0 };
            cur.taxable += base;
            cur.gst += gstAmt;
            cur.total += base + gstAmt;
            valueByGrn.set(k, cur);
        }

        // Total confirmed-GRN value per POV, ALL time (not date-limited) — the
        // denominator that apportions a POV's payments across its GRNs, so
        // Σ paid over an unrestricted range still equals Σ pov.amount_paid
        // exactly (no double-counting when a POV has several GRNs).
        const totalValueByPov = new Map<string, number>();
        for (const g of allGrns) {
            const povId = g.po_vendor_id?.toString();
            const v = valueByGrn.get(g._id.toString());
            if (!povId || !v) continue;
            totalValueByPov.set(
                povId,
                r2((totalValueByPov.get(povId) || 0) + v.total)
            );
        }

        // Date filter on the real `grn_date` column (goods actually received).
        const inRangeGrns = allGrns.filter((g) => {
            const d = String(g.grn_date || '').slice(0, 10);
            return !!d && d >= from && d <= to;
        });

        // payment_status is derived per GRN (its apportioned paid share vs its
        // own value), so it can only be filtered here, after the value/paid
        // split below is computed for each GRN.
        const rowsForStatus = inRangeGrns.map((g) => {
            const povId = g.po_vendor_id?.toString();
            const pov = povId ? povById.get(povId) : undefined;
            const v = valueByGrn.get(g._id.toString()) || {
                taxable: 0,
                gst: 0,
                total: 0,
            };
            const totalPovValue = povId ? totalValueByPov.get(povId) || 0 : 0;
            const share = totalPovValue > 0 ? v.total / totalPovValue : 0;
            const paid = r2(n(pov?.amount_paid) * share);
            const status =
                paid <= 0
                    ? 'unpaid'
                    : paid < v.total
                      ? 'partially_paid'
                      : paid === v.total
                        ? 'paid'
                        : 'overpaid';
            return { grn: g, pov, v, paid, status };
        });
        const scoped = query.payment_status
            ? rowsForStatus.filter((r) => r.status === query.payment_status)
            : rowsForStatus;

        // Every currency present in range — the dropdown source. Computed
        // before the currency narrow so the dropdown stays stable.
        const availableCurrencies = Array.from(
            new Set(scoped.map((r) => r.pov?.currency_code || 'INR'))
        ).sort(currencyRank);

        // Per-currency sections. Within each, bucket by month or vendor. A POV
        // is native to its own currency (D-6: purchases are per-currency
        // native, the POV→INR rate was retired), so USD/EUR/INR never share a
        // subtotal.
        const groupMap = new Map<string, PurchaseCurrencyGroupDto>();
        const rowMapByCurrency = new Map<
            string,
            Map<string, PurchaseTurnoverRowDto>
        >();
        const emptyRow = (key: string, label: string): PurchaseTurnoverRowDto => ({
            key,
            label,
            pov_count: 0,
            taxable: 0,
            gst: 0,
            order_value: 0,
            paid: 0,
            outstanding: 0,
        });
        const rowFor = (
            currency: string,
            symbol: string | null,
            key: string,
            label: string
        ): PurchaseTurnoverRowDto => {
            if (!groupMap.has(currency)) {
                groupMap.set(currency, {
                    currency,
                    currency_symbol: symbol,
                    rows: [],
                    totals: {
                        pov_count: 0,
                        taxable: 0,
                        gst: 0,
                        order_value: 0,
                        paid: 0,
                        outstanding: 0,
                    },
                });
                rowMapByCurrency.set(currency, new Map());
            }
            const rm = rowMapByCurrency.get(currency)!;
            if (!rm.has(key)) rm.set(key, emptyRow(key, label));
            return rm.get(key)!;
        };

        for (const { grn, pov, v, paid } of scoped) {
            const currency = pov?.currency_code || 'INR';
            // The currency filter narrows which section(s) to show.
            if (query.currency && currency !== query.currency) continue;
            const dateStr = String(grn.grn_date || '').slice(0, 10);
            const key =
                groupBy === 'vendor'
                    ? String(grn.vendor_id || '—')
                    : dateStr.slice(0, 7);
            if (!key) continue;
            const label =
                groupBy === 'vendor'
                    ? vendorNameById.get(String(grn.vendor_id)) || '—'
                    : monthLabel(key);
            const row = rowFor(
                currency,
                pov?.currency_symbol || null,
                key,
                label
            );
            row.pov_count += 1; // now counts GRNs (one row per GRN, not POV)
            row.order_value = r2(row.order_value + v.total);
            row.gst = r2(row.gst + r2(v.gst));
            // GROSS payment, apportioned to this GRN by its share of its
            // POV's total confirmed-GRN value (see `totalValueByPov` above).
            row.paid = r2(row.paid + paid);
        }

        // Month mode: emit every month in the range so a quiet month reads 0.00
        // rather than vanishing (within currencies that HAVE data).
        const monthKeys: string[] = [];
        if (groupBy === 'month') {
            const cur = new Date(`${from.slice(0, 7)}-01T00:00:00`);
            const end = new Date(`${to.slice(0, 7)}-01T00:00:00`);
            while (cur <= end) {
                monthKeys.push(
                    `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`
                );
                cur.setMonth(cur.getMonth() + 1);
            }
        }

        const groups = Array.from(groupMap.values())
            .sort((a, b) => currencyRank(a.currency, b.currency))
            .map((g) => {
                const rm = rowMapByCurrency.get(g.currency)!;
                let rows: PurchaseTurnoverRowDto[];
                if (groupBy === 'month') {
                    rows = monthKeys.map(
                        (key) => rm.get(key) || emptyRow(key, monthLabel(key))
                    );
                } else {
                    rows = Array.from(rm.values());
                    const orderBy = query.order_by || 'value';
                    const dir = query.order_direction === 'asc' ? 1 : -1;
                    const keyOf = (x: PurchaseTurnoverRowDto): number =>
                        orderBy === 'paid'
                            ? x.paid
                            : orderBy === 'outstanding'
                              ? x.outstanding
                              : orderBy === 'count'
                                ? x.pov_count
                                : x.order_value;
                    rows.sort((a, b) => (keyOf(a) - keyOf(b)) * dir);
                }
                const totals = {
                    pov_count: 0,
                    taxable: 0,
                    gst: 0,
                    order_value: 0,
                    paid: 0,
                    outstanding: 0,
                };
                for (const row of rows) {
                    row.taxable = r2(row.order_value - row.gst);
                    row.outstanding = r2(row.order_value - row.paid);
                    totals.pov_count += row.pov_count;
                    totals.taxable = r2(totals.taxable + row.taxable);
                    totals.gst = r2(totals.gst + row.gst);
                    totals.order_value = r2(
                        totals.order_value + row.order_value
                    );
                    totals.paid = r2(totals.paid + row.paid);
                    totals.outstanding = r2(
                        totals.outstanding + row.outstanding
                    );
                }
                g.rows = rows;
                g.totals = totals;
                return g;
            });

        const overallPovCount = groups.reduce(
            (s, g) => s + g.totals.pov_count,
            0
        );

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            group_by: groupBy,
            groups,
            available_currencies: availableCurrencies,
            overall_pov_count: overallPovCount,
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async purchaseTurnoverExcel(
        companyId: string,
        query: IPurchaseTurnoverQuery
    ): Promise<Buffer> {
        const result = await this.purchaseTurnover(companyId, query);
        const firstCol = result.group_by === 'vendor' ? 'Vendor' : 'Month';
        const header = [
            firstCol,
            'POVs',
            'Taxable',
            'GST',
            'Order Value',
            'Paid',
            'Outstanding',
        ];

        // One sheet, a currency-header row before each section's rows + its
        // TOTAL — there is deliberately NO cross-currency total cell (a POV is
        // native to its own currency; USD + EUR can't be added).
        const aoa: (string | number)[][] = [
            [
                `Purchase Turnover (VPO) — by ${result.group_by} — ${result.period_label}`,
            ],
            [
                `Dispatched + closed POVs. Paid is gross (before TDS). POVs: ${result.overall_pov_count}. Amounts are native per currency.`,
            ],
            [],
        ];

        for (const g of result.groups) {
            const label = g.currency_symbol
                ? `${g.currency} (${g.currency_symbol})`
                : g.currency;
            aoa.push([label]); // currency section header
            aoa.push(header);
            for (const r of g.rows) {
                aoa.push([
                    r.label,
                    r.pov_count,
                    r.taxable,
                    r.gst,
                    r.order_value,
                    r.paid,
                    r.outstanding,
                ]);
            }
            aoa.push([
                'TOTAL',
                g.totals.pov_count,
                g.totals.taxable,
                g.totals.gst,
                g.totals.order_value,
                g.totals.paid,
                g.totals.outstanding,
            ]);
            aoa.push([]); // blank line between currency sections
        }

        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── SO vs Invoice — Price Reconciliation ────────────────────────────
    /**
     * Per invoiced line, compares the FINAL CUSTOMER SELLING price on the
     * source Sales Order line against the actual invoiced price. Selling value
     * is defined identically on both sides so the comparison is fair:
     *   invoice line = invoice_line.taxable_amount              (invoice cur, native)
     *   SO line      = pol.taxable + expenses − rebates + margin (SO cur, native)
     * Multi-currency (native): each value is in its OWN document currency now.
     * Per-unit rate is expressed in the INVOICE currency — same currency →
     * the SO's native rate compares directly; different currency → the SO rate
     * is crossed SO→INR→invoice (÷ so_fx, × inv_fx) and the row is flagged.
     * Totals are converted to INR (÷ each doc's frozen rate) so they stay
     * summable across currencies.
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
            // Multi-currency: taxable_amount (invoice) and the SO value are each
            // stored in their OWN document currency now (not INR). inv_fx/so_fx
            // are doc-per-₹1, so ÷fx = INR and ×fx = that doc currency.
            const invValueDoc = n(r.inv_value_inr); // invoice-currency value
            const soValueSoCur = n(r.so_value_inr); // SO-currency value

            const invFx = n(r.inv_fx) || 1;
            const soFx = n(r.so_fx) || 1;
            const mismatch =
                String(r.so_currency) !== String(r.inv_currency);

            // Per-unit rates, both in the INVOICE currency. The invoice side is
            // already in it (native). Same currency → the SO's native rate is
            // directly comparable (no FX). Different currency → cross the SO
            // rate SO→INR→invoice (÷soFx = INR, ×invFx = invoice cur).
            const invRate = invQty > 0 ? r2(invValueDoc / invQty) : null;
            const soRateSoCur = soQty > 0 ? soValueSoCur / soQty : null;
            const soRate =
                soRateSoCur != null
                    ? r2(mismatch ? (soRateSoCur / soFx) * invFx : soRateSoCur)
                    : null;
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

            // INR totals base (÷fx to INR, so USD+EUR rows stay summable): the
            // SO's expected value for the INVOICED qty (like-for-like) and the
            // actual invoiced value, each at its own frozen rate.
            const invValueInr = invFx > 0 ? invValueDoc / invFx : invValueDoc;
            const soValueForInvInr =
                soRateSoCur != null && soFx > 0
                    ? r2((soRateSoCur * invQty) / soFx)
                    : null;
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

    // ── Lead → Invoice Duration ──────────────────────────────────────────
    /**
     * Conversion cycle time from Lead to Invoice, one row per issued invoice.
     * Walks Lead → Quotation → Sales Order → Invoice via the header FKs
     * (invoice.purchase_order_id → SO; invoice.quotation_id, falling back to the
     * SO's quotation_id → Quotation; quotation.lead_id → Lead) and reports the
     * whole-day gaps between each stage plus the total Lead → Invoice cycle.
     * Missing hops leave that stage's dates/durations null (never dropped).
     */
    async leadToInvoiceDuration(
        companyId: string,
        query: ILeadToInvoiceDurationQuery
    ): Promise<LeadToInvoiceDurationResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const customerId = query.customer_id || null;
        // Default to export invoices — the conversion cycle the client tracks.
        const typeRaw = (query.invoice_type || 'export').toLowerCase();
        const invoiceType = typeRaw === 'all' ? null : typeRaw;
        const search = query.search?.trim() ? query.search.trim() : null;
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        const raw: any[] = await this.dataSource.query(
            `SELECT i._id                                   AS invoice_id,
                    i.voucher_no                            AS invoice_no,
                    i.invoice_type                          AS invoice_type,
                    i.invoice_date                          AS invoice_date,
                    cust.company_name                       AS customer_name,
                    so._id                                  AS so_id,
                    so.voucher_no                           AS so_no,
                    so.po_date                              AS so_date,
                    q._id                                   AS quotation_id,
                    q.voucher_no                            AS quotation_no,
                    q.quotation_date                        AS quotation_date,
                    ld._id                                  AS lead_id,
                    ld.voucher_no                           AS lead_no,
                    ld."createdAt"::date                    AS lead_date
             FROM invoices i
             LEFT JOIN purchase_orders so
                 ON so._id = i.purchase_order_id AND so.soft_delete = false
             LEFT JOIN quotations q
                 ON q._id = COALESCE(i.quotation_id, so.quotation_id)
                 AND q.soft_delete = false
             LEFT JOIN leads ld
                 ON ld._id = q.lead_id AND ld.soft_delete = false
             LEFT JOIN customers cust ON cust._id = i.customer_id
             WHERE i.company_id = $1
               AND i.soft_delete = false
               AND i.status NOT IN ('draft', 'cancelled')
               AND i.invoice_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR i.customer_id = $4)
               AND ($5::text IS NULL OR i.invoice_type = $5)
               AND ($6::text IS NULL
                    OR i.voucher_no ILIKE '%' || $6 || '%'
                    OR so.voucher_no ILIKE '%' || $6 || '%'
                    OR q.voucher_no ILIKE '%' || $6 || '%'
                    OR ld.voucher_no ILIKE '%' || $6 || '%')
             ORDER BY i.invoice_date DESC, i.voucher_no`,
            [companyId, from, to, customerId, invoiceType, search]
        );

        // Whole days between two ISO/Date values; null when either is missing.
        const days = (a: any, b: any): number | null => {
            if (!a || !b) return null;
            const da = new Date(a);
            const db = new Date(b);
            if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime()))
                return null;
            return Math.round((db.getTime() - da.getTime()) / 86400000);
        };

        const rows: LeadToInvoiceDurationRowDto[] = raw.map((r) => ({
            invoice_id: r.invoice_id,
            invoice_no: r.invoice_no ?? null,
            invoice_type: r.invoice_type,
            invoice_date: r.invoice_date,
            customer_name: r.customer_name ?? null,
            so_no: r.so_no ?? null,
            so_date: r.so_date ?? null,
            quotation_no: r.quotation_no ?? null,
            quotation_date: r.quotation_date ?? null,
            lead_no: r.lead_no ?? null,
            lead_date: r.lead_date ?? null,
            lead_to_quotation_days: days(r.lead_date, r.quotation_date),
            quotation_to_so_days: days(r.quotation_date, r.so_date),
            so_to_invoice_days: days(r.so_date, r.invoice_date),
            total_days: days(r.lead_date, r.invoice_date),
        }));

        // Averages over the rows where each figure is actually computable.
        const avg = (
            pick: (x: LeadToInvoiceDurationRowDto) => number | null
        ): number | null => {
            const vals = rows
                .map(pick)
                .filter((v): v is number => v !== null && v !== undefined);
            if (!vals.length) return null;
            return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
        };
        const chainedTotals = rows
            .map((x) => x.total_days)
            .filter((v): v is number => v !== null && v !== undefined);

        const totals = {
            invoices: rows.length,
            chained: chainedTotals.length,
            avg_total_days: avg((x) => x.total_days),
            avg_lead_to_quotation_days: avg((x) => x.lead_to_quotation_days),
            avg_quotation_to_so_days: avg((x) => x.quotation_to_so_days),
            avg_so_to_invoice_days: avg((x) => x.so_to_invoice_days),
            min_total_days: chainedTotals.length
                ? Math.min(...chainedTotals)
                : null,
            max_total_days: chainedTotals.length
                ? Math.max(...chainedTotals)
                : null,
        };

        const start = (page - 1) * perPage;
        const paged = rows.slice(start, start + perPage);

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: paged,
            totals,
            pagination: { total: rows.length, perPage },
        };
    }

    /** The same report as an .xlsx Buffer (whole filtered set + AVERAGE row). */
    async leadToInvoiceDurationExcel(
        companyId: string,
        query: ILeadToInvoiceDurationQuery
    ): Promise<Buffer> {
        const result = await this.leadToInvoiceDuration(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });
        const header = [
            'Lead No',
            'Lead Date',
            'Quotation No',
            'Quotation Date',
            'SO No',
            'SO Date',
            'Invoice No',
            'Type',
            'Invoice Date',
            'Customer',
            'Lead→Quote (days)',
            'Quote→SO (days)',
            'SO→Invoice (days)',
            'Total (days)',
        ];
        const dash = '';
        const body = result.rows.map((r) => [
            r.lead_no || dash,
            r.lead_date ? isoToDdmmyyyy(r.lead_date) : dash,
            r.quotation_no || dash,
            r.quotation_date ? isoToDdmmyyyy(r.quotation_date) : dash,
            r.so_no || dash,
            r.so_date ? isoToDdmmyyyy(r.so_date) : dash,
            r.invoice_no || dash,
            r.invoice_type,
            r.invoice_date ? isoToDdmmyyyy(r.invoice_date) : dash,
            r.customer_name || dash,
            r.lead_to_quotation_days ?? dash,
            r.quotation_to_so_days ?? dash,
            r.so_to_invoice_days ?? dash,
            r.total_days ?? dash,
        ]);
        const avgRow = [
            'AVERAGE (days)',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            result.totals.avg_lead_to_quotation_days ?? '',
            result.totals.avg_quotation_to_so_days ?? '',
            result.totals.avg_so_to_invoice_days ?? '',
            result.totals.avg_total_days ?? '',
        ];
        const aoa: (string | number)[][] = [
            [`Lead → Invoice Duration — ${result.period_label}`],
            [
                `Invoices: ${result.totals.invoices} · Fully chained: ${result.totals.chained} · Fastest cycle: ${
                    result.totals.min_total_days ?? '—'
                } days · Slowest cycle: ${
                    result.totals.max_total_days ?? '—'
                } days`,
            ],
            [],
            header,
            ...body,
            [],
            avgRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── Advance vs Invoice ───────────────────────────────────────────────
    /**
     * Advances taken on Sales Orders vs the invoices later raised against them.
     * One row per SO (that carries an advance and/or has been invoiced):
     * advance = SO.advance_amount; invoiced = Σ invoice-line value billed
     * against that SO's lines (non-cancelled invoices), converted into the SO
     * currency; balance = invoiced − advance. Row amounts are native to the SO,
     * totals are INR (÷ the SO's frozen doc-per-₹1 rate) so they stay summable.
     */
    async advanceVsInvoice(
        companyId: string,
        query: IAdvanceVsInvoiceQuery
    ): Promise<AdvanceVsInvoiceResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const customerId = query.customer_id || null;
        const statusFilter =
            query.status && query.status !== 'all' ? query.status : null;
        const search = query.search?.trim() ? query.search.trim() : null;
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        const raw: any[] = await this.dataSource.query(
            `WITH inv_lines AS (
                 SELECT pol.purchase_order_id                        AS so_id,
                        i._id                                        AS invoice_id,
                        i.voucher_no                                 AS invoice_no,
                        COALESCE(il.taxable_amount, 0)::float8
                            / NULLIF(COALESCE(i.exchange_rate, '1')::float8, 0)
                                                                     AS line_inr
                 FROM invoice_lines il
                 JOIN invoices i
                     ON i._id = il.invoice_id AND i.soft_delete = false
                     AND i.status NOT IN ('draft', 'cancelled')
                 JOIN purchase_order_lines pol
                     ON pol._id = il.purchase_order_line_id
                 WHERE il.company_id = $1 AND il.soft_delete = false
             ),
             inv_by_so AS (
                 SELECT so_id,
                        SUM(line_inr)                                AS invoiced_inr,
                        COUNT(DISTINCT invoice_id)                   AS invoice_count,
                        jsonb_agg(DISTINCT jsonb_build_object(
                            'id', invoice_id, 'no', invoice_no))     AS invoices
                 FROM inv_lines
                 GROUP BY so_id
             )
             SELECT so._id                                          AS so_id,
                    so.voucher_no                                   AS so_no,
                    so.po_date                                      AS so_date,
                    cust.company_name                               AS customer_name,
                    COALESCE(so.currency_code, 'INR')               AS currency_code,
                    COALESCE(
                        (SELECT cur.symbol FROM currencies cur
                         WHERE cur.code = so.currency_code
                           AND cur.company_id = so.company_id
                         LIMIT 1), '')                              AS currency_symbol,
                    COALESCE(so.exchange_rate, '1')::float8         AS so_fx,
                    COALESCE(so.grand_total, 0)::float8             AS so_value,
                    COALESCE(so.advance_amount, 0)::float8          AS advance,
                    so.advance_date                                 AS advance_date,
                    COALESCE(ibs.invoiced_inr, 0)::float8           AS invoiced_inr,
                    COALESCE(ibs.invoice_count, 0)::int             AS invoice_count,
                    COALESCE(ibs.invoices, '[]'::jsonb)             AS invoices
             FROM purchase_orders so
             LEFT JOIN inv_by_so ibs ON ibs.so_id = so._id
             LEFT JOIN customers cust ON cust._id = so.customer_id
             WHERE so.company_id = $1
               AND so.soft_delete = false
               AND so.status NOT IN ('draft', 'cancelled')
               AND so.po_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR so.customer_id = $4)
               AND ($5::text IS NULL
                    OR so.voucher_no ILIKE '%' || $5 || '%'
                    OR cust.company_name ILIKE '%' || $5 || '%')
               AND (COALESCE(so.advance_amount, 0) > 0 OR ibs.invoiced_inr IS NOT NULL)
             ORDER BY so.po_date DESC, so.voucher_no`,
            [companyId, from, to, customerId, search]
        );

        const rows: AdvanceVsInvoiceRowDto[] = raw.map((r) => {
            const soFx = n(r.so_fx) || 1;
            const advance = r2(n(r.advance)); // SO currency (native)
            const soValue = r2(n(r.so_value)); // SO currency (native)
            const invoicedInr = n(r.invoiced_inr); // already INR
            const invoicedNative = r2(invoicedInr * soFx); // → SO currency
            const balance = r2(invoicedNative - advance);

            // INR copies for the summable totals (÷ soFx, doc-per-₹1).
            const advanceInr = soFx > 0 ? advance / soFx : advance;
            const soValueInr = soFx > 0 ? soValue / soFx : soValue;
            const balanceInr = r2(invoicedInr - advanceInr);

            // Status by how far the advance has been billed.
            let status: string;
            if (advance <= 0) status = 'no_advance';
            else if (invoicedNative <= 0) status = 'advance_unbilled';
            else if (invoicedNative < advance) status = 'partly_adjusted';
            else status = 'fully_adjusted';

            return {
                so_id: r.so_id,
                so_no: r.so_no,
                so_date: r.so_date,
                customer_name: r.customer_name ?? null,
                currency_code: r.currency_code,
                currency_symbol: r.currency_symbol || r.currency_code,
                so_value: soValue,
                advance,
                advance_date: r.advance_date ?? null,
                invoiced: invoicedNative,
                balance,
                invoice_count: n(r.invoice_count),
                invoices: (Array.isArray(r.invoices) ? r.invoices : [])
                    .filter((iv: any) => iv && iv.id)
                    .map((iv: any) => ({ id: String(iv.id), no: iv.no || '' })),
                status,
                so_value_inr: r2(soValueInr),
                advance_inr: r2(advanceInr),
                invoiced_inr: r2(invoicedInr),
                balance_inr: balanceInr,
            };
        });

        const filtered = statusFilter
            ? rows.filter((x) => x.status === statusFilter)
            : rows;

        const totals = filtered.reduce(
            (acc, x) => {
                acc.orders += 1;
                acc.so_value_inr += x.so_value_inr;
                acc.advance_inr += x.advance_inr;
                acc.invoiced_inr += x.invoiced_inr;
                acc.balance_inr += x.balance_inr;
                if (x.status === 'advance_unbilled') acc.advance_unbilled += 1;
                return acc;
            },
            {
                orders: 0,
                so_value_inr: 0,
                advance_inr: 0,
                invoiced_inr: 0,
                balance_inr: 0,
                advance_unbilled: 0,
            }
        );
        totals.so_value_inr = r2(totals.so_value_inr);
        totals.advance_inr = r2(totals.advance_inr);
        totals.invoiced_inr = r2(totals.invoiced_inr);
        totals.balance_inr = r2(totals.balance_inr);

        const start = (page - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: paged,
            totals,
            pagination: { total: filtered.length, perPage },
        };
    }

    /** The same report as an .xlsx Buffer (whole filtered set + TOTAL row). */
    async advanceVsInvoiceExcel(
        companyId: string,
        query: IAdvanceVsInvoiceQuery
    ): Promise<Buffer> {
        const result = await this.advanceVsInvoice(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });
        const statusLabel: Record<string, string> = {
            advance_unbilled: 'Advance unbilled',
            partly_adjusted: 'Advance partly adjusted',
            fully_adjusted: 'Advance fully adjusted',
            no_advance: 'No advance',
        };
        const header = [
            'Sales Order',
            'SO Date',
            'Customer',
            'Currency',
            'Status',
            'SO Value',
            'Advance Received',
            'Invoiced',
            'Balance (Inv − Adv)',
            'Invoice(s)',
        ];
        const body = result.rows.map((r) => [
            r.so_no,
            r.so_date ? isoToDdmmyyyy(r.so_date) : '',
            r.customer_name || '',
            r.currency_code,
            statusLabel[r.status] || r.status,
            r.so_value,
            r.advance,
            r.invoiced,
            r.balance,
            (r.invoices || []).map((iv) => iv.no).join(', '),
        ]);
        const totalRow = [
            'TOTAL (INR)',
            '',
            '',
            '',
            '',
            result.totals.so_value_inr,
            result.totals.advance_inr,
            result.totals.invoiced_inr,
            result.totals.balance_inr,
            '',
        ];
        const aoa: (string | number)[][] = [
            [`Advance vs Invoice — ${result.period_label}`],
            [
                'Row amounts are in each Sales Order’s currency. Totals are INR (converted at each SO’s frozen rate).',
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── Exchange Gain/Loss ───────────────────────────────────────────────
    /**
     * Realized forex gain/loss per customer receipt: a foreign invoice booked at
     * its invoice-date rate, paid later at the receipt rate. One row per
     * non-voided receipt (advances included) on a non-INR invoice. Mirrors the
     * invoice detail's per-receipt math (invoice.service `mapGet`):
     *   INR expected = amount ÷ invoice_rate, INR received = amount ÷ receipt_rate,
     *   gain/loss = received − expected. Amounts are invoice-currency; INR is
     *   summable. INR invoices carry no forex and are excluded.
     */
    async exchangeGainLoss(
        companyId: string,
        query: IExchangeGainLossQuery
    ): Promise<ExchangeGainLossResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const customerId = query.customer_id || null;
        const resultFilter =
            query.result === 'gain' || query.result === 'loss'
                ? query.result
                : null;
        const search = query.search?.trim() ? query.search.trim() : null;
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        const raw: any[] = await this.dataSource.query(
            `SELECT ip._id                                          AS payment_id,
                    ip.receipt_voucher_no                          AS receipt_no,
                    ip.payment_date                                AS payment_date,
                    ip.method                                      AS method,
                    COALESCE(ip.amount, 0)::float8                 AS amount,
                    COALESCE(ip.exchange_rate, '1')::float8        AS receipt_rate,
                    i._id                                          AS invoice_id,
                    i.voucher_no                                   AS invoice_no,
                    i.invoice_date                                 AS invoice_date,
                    i.invoice_type                                 AS invoice_type,
                    COALESCE(i.currency_code, 'INR')               AS currency_code,
                    COALESCE(i.currency_symbol, '')                AS currency_symbol,
                    COALESCE(i.exchange_rate, '1')::float8         AS invoice_rate,
                    c.company_name                                 AS customer_name
             FROM invoice_payments ip
             JOIN invoices i
                 ON i._id = ip.invoice_id AND i.soft_delete = false
             LEFT JOIN customers c ON c._id = i.customer_id
             WHERE ip.company_id = $1
               AND ip.soft_delete = false
               AND ip.voided_at IS NULL
               AND COALESCE(i.currency_code, 'INR') <> 'INR'
               AND ip.payment_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR i.customer_id = $4)
               AND ($5::text IS NULL
                    OR i.voucher_no ILIKE '%' || $5 || '%'
                    OR ip.receipt_voucher_no ILIKE '%' || $5 || '%'
                    OR c.company_name ILIKE '%' || $5 || '%')
             ORDER BY ip.payment_date DESC, i.voucher_no`,
            [companyId, from, to, customerId, search]
        );

        const rows: ExchangeGainLossRowDto[] = raw.map((r) => {
            const amt = n(r.amount);
            const invRate = n(r.invoice_rate) || 1;
            const rcptRate = n(r.receipt_rate) || invRate;
            // Compare in the 2-dp INR-per-foreign rate the operator sees/enters,
            // NOT the raw reciprocal of the 6-dp stored doc-per-₹1 rate — whose
            // drift (95.0932 vs the entered 95.09) otherwise fabricates a phantom
            // gain/loss when the receipt rate equals the invoice rate.
            const invRateInr = invRate > 0 ? r2(1 / invRate) : 0;
            const rcptRateInr = (rcptRate > 0 ? r2(1 / rcptRate) : 0) || invRateInr;
            const inrExpected = amt * invRateInr;
            const inrReceived = amt * rcptRateInr;
            const gl = r2(inrReceived - inrExpected);
            return {
                payment_id: r.payment_id,
                receipt_no: r.receipt_no ?? null,
                payment_date: r.payment_date,
                method: r.method ?? null,
                invoice_id: r.invoice_id,
                invoice_no: r.invoice_no ?? null,
                invoice_date: r.invoice_date,
                invoice_type: r.invoice_type,
                currency_code: r.currency_code,
                currency_symbol: r.currency_symbol || r.currency_code,
                customer_name: r.customer_name ?? null,
                amount: r2(amt),
                invoice_rate_inr: invRateInr,
                receipt_rate_inr: rcptRateInr,
                inr_expected: r2(inrExpected),
                inr_received: r2(inrReceived),
                gain_loss_inr: gl,
            };
        });

        const filtered = resultFilter
            ? rows.filter((x) =>
                  resultFilter === 'gain'
                      ? x.gain_loss_inr > 0
                      : x.gain_loss_inr < 0
              )
            : rows;

        const totals = filtered.reduce(
            (acc, x) => {
                acc.receipts += 1;
                acc.inr_expected += x.inr_expected;
                acc.inr_received += x.inr_received;
                acc.gain_loss_inr += x.gain_loss_inr;
                if (x.gain_loss_inr > 0) acc.gains += 1;
                else if (x.gain_loss_inr < 0) acc.losses += 1;
                return acc;
            },
            {
                receipts: 0,
                inr_expected: 0,
                inr_received: 0,
                gain_loss_inr: 0,
                gains: 0,
                losses: 0,
            }
        );
        totals.inr_expected = r2(totals.inr_expected);
        totals.inr_received = r2(totals.inr_received);
        totals.gain_loss_inr = r2(totals.gain_loss_inr);

        const start = (page - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: paged,
            totals,
            pagination: { total: filtered.length, perPage },
        };
    }

    /** The same report as an .xlsx Buffer (whole filtered set + TOTAL row). */
    async exchangeGainLossExcel(
        companyId: string,
        query: IExchangeGainLossQuery
    ): Promise<Buffer> {
        const result = await this.exchangeGainLoss(companyId, {
            ...query,
            page: 1,
            perPage: 100000, // one page = the whole set for export
        });
        const header = [
            'Receipt',
            'Receipt Date',
            'Invoice',
            'Invoice Date',
            'Customer',
            'Currency',
            'Amount',
            'Invoice Rate (₹/unit)',
            'Receipt Rate (₹/unit)',
            'INR Expected',
            'INR Received',
            'Gain / Loss (₹)',
        ];
        const body = result.rows.map((r) => [
            r.receipt_no || '',
            r.payment_date ? isoToDdmmyyyy(r.payment_date) : '',
            r.invoice_no || '',
            r.invoice_date ? isoToDdmmyyyy(r.invoice_date) : '',
            r.customer_name || '',
            r.currency_code,
            r.amount,
            r.invoice_rate_inr,
            r.receipt_rate_inr,
            r.inr_expected,
            r.inr_received,
            r.gain_loss_inr,
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
            result.totals.inr_expected,
            result.totals.inr_received,
            result.totals.gain_loss_inr,
        ];
        const aoa: (string | number)[][] = [
            [`Exchange Gain/Loss — ${result.period_label}`],
            [
                `Receipts: ${result.totals.receipts} · Gains: ${result.totals.gains} · Losses: ${result.totals.losses}. Amount is invoice currency; INR figures are ₹.`,
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    // ── Document coverage status (shared by SO Status + POV Status) ──────
    /**
     * Turn the raw per-document rows (already carrying INR-normalised values —
     * the per-report SQL owns the currency direction) into the full response:
     * status/coverage classification, party dropdown, status filter, totals and
     * pagination. Both the Sales Order and Purchase Order status reports funnel
     * their SQL through here so the classification never drifts between them.
     */
    private assembleDocStatusResponse(
        raw: any[],
        from: string,
        to: string,
        statusFilter: string | null,
        page: number,
        perPage: number
    ): DocStatusResponseDto {
        const allRows: DocStatusRowDto[] = mapDocStatusRows(raw);
        const party_options: DocStatusOptionDto[] =
            docStatusPartyOptions(allRows);
        const rows = statusFilter
            ? allRows.filter((r) => r.status === statusFilter)
            : allRows;
        const totals: DocStatusTotalsDto = docStatusTotals(rows);
        const start = (page - 1) * perPage;
        return {
            period_label: `${isoToDdmmyyyy(from)} → ${isoToDdmmyyyy(to)}`,
            rows: rows.slice(start, start + perPage),
            totals,
            party_options,
            pagination: { total: rows.length, perPage },
        };
    }

    /** The document status list as an .xlsx Buffer (whole set + TOTAL). Shared
     *  by both reports; the labels come from `cfg`. */
    private docStatusExcel(
        result: DocStatusResponseDto,
        cfg: {
            title: string;
            docNoLabel: string;
            partyLabel: string;
            coverCountLabel: string;
            note: string;
        },
        lineRows?: Array<{
            doc_no: string;
            party_name: string | null;
            currency_code: string;
        } & DocStatusLineBreakdownRowDto>
    ): Buffer {
        const statusLabel: Record<string, string> = {
            open: 'Open',
            partial: 'Partially Closed',
            closed: 'Closed',
        };
        const header = [
            cfg.docNoLabel,
            'Date',
            cfg.partyLabel,
            'Currency',
            'Status',
            'Ordered Qty',
            'Covered Qty',
            'Pending Qty',
            'Ordered Value (₹)',
            'Covered Value (₹)',
            'Pending Value (₹)',
            'Coverage %',
            cfg.coverCountLabel,
        ];
        const body = result.rows.map((r) => [
            r.doc_no,
            isoToDdmmyyyy(r.doc_date),
            r.party_name || '',
            r.currency_code,
            statusLabel[r.status] || r.status,
            r.ordered_qty,
            r.covered_qty,
            r.pending_qty,
            r.ordered_value_inr,
            r.covered_value_inr,
            r.pending_value_inr,
            r.coverage_pct,
            r.cover_count,
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
            result.totals.ordered_value_inr,
            result.totals.covered_value_inr,
            result.totals.pending_value_inr,
            '',
            '',
        ];
        const aoa: (string | number)[][] = [
            [`${cfg.title} — ${result.period_label}`],
            [
                `Open ${result.totals.open_count} · Partially Closed ${result.totals.partial_count} · Closed ${result.totals.closed_count}. ${cfg.note}`,
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];

        if (!lineRows) {
            return this.fileService.writeExcelFromArray(aoa);
        }

        // Per-line detail — same Rate/Pending Amount shown in the drill-down
        // drawer, one row per order line across every doc in this export
        // (native document currency, not ₹-normalised — mirrors the drawer).
        const lineHeader = [
            cfg.docNoLabel,
            cfg.partyLabel,
            'Currency',
            'Product',
            'Product Code',
            'HSN',
            'Unit',
            'Status',
            'Ordered Qty',
            'Covered Qty',
            'Pending Qty',
            'Rate',
            'Pending Amt',
        ];
        const lineBody = lineRows.map((l) => [
            l.doc_no,
            l.party_name || '',
            l.currency_code,
            l.product_name,
            l.product_code || '',
            l.hsn_code || '',
            l.unit || '',
            statusLabel[l.status] || l.status,
            l.ordered_qty,
            l.covered_qty,
            l.pending_qty,
            l.rate ?? '',
            l.pending_amount,
        ]);
        const lineAoa: (string | number)[][] = [
            [`${cfg.title} — Line Items — ${result.period_label}`],
            [`Rate/Amount are in each document's own currency, not ₹-normalised.`],
            [],
            lineHeader,
            ...lineBody,
        ];

        return this.fileService.writeExcelSheetsFromArray([
            { sheetName: 'Summary', rows: aoa },
            { sheetName: 'Line Items', rows: lineAoa },
        ]);
    }

    // ── Sales Order Status ───────────────────────────────────────────────
    /**
     * One row per non-draft/cancelled Sales Order, classified Open / Partially
     * Closed / Closed by how much of its ordered qty has been billed to
     * invoices (linked via `invoice_lines.purchase_order_line_id`). The
     * `invoice_type` filter (export|domestic|all, default export) chooses which
     * invoices count toward coverage. Values roll up to INR (invoice ÷ its own
     * frozen rate) so a multi-currency book stays summable.
     */
    async salesOrderStatus(
        companyId: string,
        query: ISalesOrderStatusQuery
    ): Promise<DocStatusResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const customerId = query.customer_id || null;
        const search = query.search?.trim() ? query.search.trim() : null;
        const statusFilter = query.status?.trim() || null;
        const typeRaw = (query.invoice_type || 'export').toLowerCase();
        const invType = typeRaw === 'all' ? null : typeRaw;
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        // SO selling value ÷ so_fx → INR (so_fx is doc-per-₹1). The invoiced
        // subquery already yields INR (taxable_amount ÷ invoice rate).
        const raw: any[] = await this.dataSource.query(
            `SELECT po._id                                   AS doc_id,
                    po.voucher_no                            AS doc_no,
                    po.po_date                               AS doc_date,
                    po.customer_id                           AS party_id,
                    c.company_name                           AS party_name,
                    COALESCE(po.currency_code, 'INR')        AS currency_code,
                    SUM(COALESCE(pol.qty, 0))::float8         AS ordered_qty,
                    (SUM(COALESCE(pol.taxable, 0)
                         + COALESCE(pol.product_expenses_amount, 0)
                         - COALESCE(pol.product_rebates_amount, 0)
                         + COALESCE(pol.margin_amount, 0))
                     / NULLIF(MAX(COALESCE(po.exchange_rate, '1')::float8), 0)
                    )::float8                                AS ordered_value_inr,
                    COALESCE(MAX(inv.covered_qty), 0)::float8       AS covered_qty,
                    COALESCE(MAX(inv.covered_value_inr), 0)::float8 AS covered_value_inr,
                    COALESCE(MAX(inv.cover_count), 0)::int          AS cover_count
             FROM purchase_orders po
             JOIN purchase_order_lines pol
                 ON pol.purchase_order_id = po._id
             LEFT JOIN customers c ON c._id = po.customer_id
             LEFT JOIN (
                 SELECT pol2.purchase_order_id AS doc_id,
                        SUM(COALESCE(il.qty, 0)) AS covered_qty,
                        SUM(COALESCE(il.taxable_amount, 0)
                            / NULLIF(COALESCE(i.exchange_rate, '1')::float8, 0))
                                                 AS covered_value_inr,
                        COUNT(DISTINCT i._id)    AS cover_count
                 FROM invoice_lines il
                 JOIN invoices i
                     ON i._id = il.invoice_id
                    AND i.soft_delete = false
                    -- A draft invoice already reserves this qty against the
                    -- SO (the same qty-guard that blocks a second invoice
                    -- from exceeding dispatched qty counts drafts too — see
                    -- InvoiceRepository.sumQtyByPoLineId), so treat it as
                    -- covered here as well; only a cancelled invoice frees
                    -- the qty back up.
                    AND i.status <> 'cancelled'
                    AND ($6::text IS NULL OR i.invoice_type = $6)
                 JOIN purchase_order_lines pol2
                     ON pol2._id = il.purchase_order_line_id
                 WHERE il.company_id = $1 AND il.soft_delete = false
                 GROUP BY pol2.purchase_order_id
             ) inv ON inv.doc_id = po._id
             WHERE po.company_id = $1
               AND po.soft_delete = false
               AND po.status NOT IN ('draft', 'cancelled')
               AND po.po_date BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR po.customer_id = $4)
               AND ($5::text IS NULL
                    OR po.voucher_no ILIKE '%' || $5 || '%'
                    OR c.company_name ILIKE '%' || $5 || '%')
             GROUP BY po._id, po.voucher_no, po.po_date, po.customer_id,
                      c.company_name, po.currency_code
             ORDER BY po.po_date DESC, po.voucher_no`,
            [companyId, from, to, customerId, search, invType]
        );

        return this.assembleDocStatusResponse(
            raw,
            from,
            to,
            statusFilter,
            page,
            perPage
        );
    }

    /** Drill-down: the invoice lines billed against ONE Sales Order. */
    async salesOrderStatusBreakdown(
        companyId: string,
        soId: string,
        invoiceType?: string
    ): Promise<DocStatusBreakdownRowDto[]> {
        const typeRaw = (invoiceType || 'export').toLowerCase();
        const invType = typeRaw === 'all' ? null : typeRaw;
        const raw: any[] = await this.dataSource.query(
            `SELECT i._id                                    AS cover_id,
                    i.voucher_no                             AS cover_no,
                    i.invoice_type                           AS cover_type,
                    i.invoice_date                           AS cover_date,
                    COALESCE(i.currency_code, 'INR')         AS currency_code,
                    COALESCE(i.currency_symbol, '')          AS currency_symbol,
                    COALESCE(i.exchange_rate, '1')::float8    AS inv_fx,
                    COALESCE(p.name, il.product_name, '—')    AS product_name,
                    il.product_code                          AS product_code,
                    il.hsn_code                              AS hsn_code,
                    il.seq                                   AS seq,
                    COALESCE(il.qty, 0)::float8              AS cover_qty,
                    COALESCE(il.taxable_amount, 0)::float8   AS cover_amount,
                    (COALESCE(il.taxable_amount, 0)
                       / NULLIF(COALESCE(i.exchange_rate, '1')::float8, 0)
                    )::float8                                AS cover_amount_inr,
                    COALESCE(pol.qty, 0)::float8            AS order_qty,
                    -- SO per-unit selling rate, crossed into the invoice currency
                    -- when the SO and invoice currencies differ (÷so_fx=₹, ×inv_fx).
                    (CASE
                        WHEN COALESCE(pol.qty, 0) = 0 THEN NULL
                        WHEN COALESCE(po.currency_code, 'INR') = COALESCE(i.currency_code, 'INR')
                            THEN (COALESCE(pol.taxable, 0)
                                  + COALESCE(pol.product_expenses_amount, 0)
                                  - COALESCE(pol.product_rebates_amount, 0)
                                  + COALESCE(pol.margin_amount, 0)) / pol.qty
                        ELSE ((COALESCE(pol.taxable, 0)
                               + COALESCE(pol.product_expenses_amount, 0)
                               - COALESCE(pol.product_rebates_amount, 0)
                               + COALESCE(pol.margin_amount, 0)) / pol.qty)
                             / NULLIF(COALESCE(po.exchange_rate, '1')::float8, 0)
                             * COALESCE(i.exchange_rate, '1')::float8
                     END)::float8                            AS order_rate
             FROM invoice_lines il
             JOIN invoices i
                 ON i._id = il.invoice_id
                AND i.soft_delete = false
                -- Draft invoices already reserve qty against the SO (see the
                -- same note in salesOrderStatus above) — only cancelled frees
                -- it back up.
                AND i.status <> 'cancelled'
                AND ($3::text IS NULL OR i.invoice_type = $3)
             JOIN purchase_order_lines pol
                 ON pol._id = il.purchase_order_line_id
             JOIN purchase_orders po ON po._id = pol.purchase_order_id
             LEFT JOIN products p ON p._id = il.product_id
             WHERE il.company_id = $1
               AND il.soft_delete = false
               AND pol.purchase_order_id = $2
             ORDER BY i.invoice_date, i.voucher_no, il.seq`,
            [companyId, soId, invType]
        );
        return mapDocStatusBreakdown(raw);
    }

    /**
     * Drill-down: EVERY line of ONE Sales Order (not just lines an invoice has
     * touched) with its own ordered vs invoiced-so-far qty — so a line that
     * hasn't been invoiced at all still shows up as fully pending, rather than
     * being invisible the way `salesOrderStatusBreakdown`'s coverage-driven
     * list would leave it.
     */
    async salesOrderStatusLineBreakdown(
        companyId: string,
        soId: string,
        invoiceType?: string
    ): Promise<DocStatusLineBreakdownRowDto[]> {
        const typeRaw = (invoiceType || 'export').toLowerCase();
        const invType = typeRaw === 'all' ? null : typeRaw;
        const raw: any[] = await this.dataSource.query(
            `SELECT pol._id                                   AS line_id,
                    pol.product_id                            AS product_id,
                    COALESCE(p.name, pol.description, '—')    AS product_name,
                    p.code                                    AS product_code,
                    pol.hsn_code                               AS hsn_code,
                    pol.unit                                  AS unit,
                    COALESCE(pol.qty, 0)::float8              AS ordered_qty,
                    COALESCE(cov.covered_qty, 0)::float8      AS covered_qty,
                    -- SO per-unit selling rate — same formula as
                    -- salesOrderStatusBreakdown's order_rate, native SO currency.
                    (CASE
                        WHEN COALESCE(pol.qty, 0) = 0 THEN NULL
                        ELSE (COALESCE(pol.taxable, 0)
                              + COALESCE(pol.product_expenses_amount, 0)
                              - COALESCE(pol.product_rebates_amount, 0)
                              + COALESCE(pol.margin_amount, 0)) / pol.qty
                     END)::float8                             AS rate
             FROM purchase_order_lines pol
             LEFT JOIN products p ON p._id = pol.product_id
             LEFT JOIN (
                 SELECT il.purchase_order_line_id AS line_id,
                        SUM(COALESCE(il.qty, 0))  AS covered_qty
                 FROM invoice_lines il
                 JOIN invoices i
                     ON i._id = il.invoice_id
                    AND i.soft_delete = false
                    -- Draft invoices already reserve qty against the SO (see
                    -- the same note in salesOrderStatus above) — only
                    -- cancelled frees it back up.
                    AND i.status <> 'cancelled'
                    AND ($3::text IS NULL OR i.invoice_type = $3)
                 WHERE il.company_id = $1 AND il.soft_delete = false
                 GROUP BY il.purchase_order_line_id
             ) cov ON cov.line_id = pol._id
             WHERE pol.purchase_order_id = $2
             ORDER BY pol.seq`,
            [companyId, soId, invType]
        );
        return mapDocStatusLineBreakdown(raw);
    }

    /** Same rows as `salesOrderStatusLineBreakdown`, batched across MANY SOs
     *  in one query (`purchase_order_id = ANY(...)`) instead of one query per
     *  SO — used only by `salesOrderStatusExcel`, which previously fired one
     *  query per row in the export. */
    private async salesOrderStatusLineBreakdownBatch(
        companyId: string,
        soIds: string[],
        invoiceType?: string
    ): Promise<Map<string, DocStatusLineBreakdownRowDto[]>> {
        const byDoc = new Map<string, DocStatusLineBreakdownRowDto[]>();
        if (!soIds.length) return byDoc;
        const typeRaw = (invoiceType || 'export').toLowerCase();
        const invType = typeRaw === 'all' ? null : typeRaw;
        const raw: any[] = await this.dataSource.query(
            `SELECT pol.purchase_order_id                     AS so_id,
                    pol._id                                   AS line_id,
                    pol.product_id                            AS product_id,
                    COALESCE(p.name, pol.description, '—')    AS product_name,
                    p.code                                    AS product_code,
                    pol.hsn_code                               AS hsn_code,
                    pol.unit                                  AS unit,
                    COALESCE(pol.qty, 0)::float8              AS ordered_qty,
                    COALESCE(cov.covered_qty, 0)::float8      AS covered_qty,
                    (CASE
                        WHEN COALESCE(pol.qty, 0) = 0 THEN NULL
                        ELSE (COALESCE(pol.taxable, 0)
                              + COALESCE(pol.product_expenses_amount, 0)
                              - COALESCE(pol.product_rebates_amount, 0)
                              + COALESCE(pol.margin_amount, 0)) / pol.qty
                     END)::float8                             AS rate
             FROM purchase_order_lines pol
             LEFT JOIN products p ON p._id = pol.product_id
             LEFT JOIN (
                 SELECT il.purchase_order_line_id AS line_id,
                        SUM(COALESCE(il.qty, 0))  AS covered_qty
                 FROM invoice_lines il
                 JOIN invoices i
                     ON i._id = il.invoice_id
                    AND i.soft_delete = false
                    AND i.status <> 'cancelled'
                    AND ($3::text IS NULL OR i.invoice_type = $3)
                 WHERE il.company_id = $1 AND il.soft_delete = false
                 GROUP BY il.purchase_order_line_id
             ) cov ON cov.line_id = pol._id
             WHERE pol.purchase_order_id = ANY($2::uuid[])
             ORDER BY pol.purchase_order_id, pol.seq`,
            [companyId, soIds, invType]
        );
        const grouped = new Map<string, any[]>();
        for (const r of raw) {
            const key = r.so_id;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(r);
        }
        for (const [soId, rawRows] of grouped) {
            byDoc.set(soId, mapDocStatusLineBreakdown(rawRows));
        }
        return byDoc;
    }

    /** The Sales Order Status list as an .xlsx Buffer. */
    async salesOrderStatusExcel(
        companyId: string,
        query: ISalesOrderStatusQuery
    ): Promise<Buffer> {
        const result = await this.salesOrderStatus(companyId, {
            ...query,
            page: 1,
            perPage: 100000,
        });
        const linesByDoc = await this.salesOrderStatusLineBreakdownBatch(
            companyId,
            result.rows.map((r) => r.doc_id),
            query.invoice_type
        );
        const lineRows = result.rows.flatMap((r) =>
            (linesByDoc.get(r.doc_id) || []).map((l) => ({
                doc_no: r.doc_no,
                party_name: r.party_name,
                currency_code: r.currency_code,
                ...l,
            }))
        );
        return this.docStatusExcel(
            result,
            {
                title: 'Sales Order Status',
                docNoLabel: 'SO No',
                partyLabel: 'Customer',
                coverCountLabel: 'Invoices',
                note: `Coverage by ${query.invoice_type || 'export'} invoices; values are ₹-normalised.`,
            },
            lineRows
        );
    }

    // ── Purchase Order (Vendor PO) Status ────────────────────────────────
    /**
     * One row per non-draft/cancelled Vendor PO, classified Open / Partially
     * Closed / Closed by how much of its ordered qty has been RECEIVED on GRNs
     * (linked via `grn_lines.po_vendor_line_id`; received = accepted/good qty).
     * The `grn_scope` filter (confirmed|all, default confirmed) chooses which
     * GRNs count. A POV has no order-date column, so it is dated by
     * `dispatch_date || createdAt`. POV amounts are native to the vendor
     * currency; the INR roll-up uses the POV's own `exchange_rate` (INR-per-unit,
     * = 1 for a home-currency POV) so figures stay summable.
     */
    async purchaseOrderStatus(
        companyId: string,
        query: IPurchaseOrderStatusQuery
    ): Promise<DocStatusResponseDto> {
        const today = new Date();
        const from = query.date_from || isoDate(this.currentFyStart(today));
        const to = query.date_to || isoDate(today);
        const vendorId = query.vendor_id || null;
        const search = query.search?.trim() ? query.search.trim() : null;
        const statusFilter = query.status?.trim() || null;
        // 'all' → every non-cancelled GRN; else confirmed only.
        const grnScope =
            (query.grn_scope || 'confirmed').toLowerCase() === 'all'
                ? 'all'
                : 'confirmed';
        const perPage = query.perPage || 25;
        const page = query.page || 1;

        // Value model mirrors the POV payable (goods + GST + vendor charges):
        //   goods  = Σ ordered_qty × price × (1−disc)
        //   GST    = goods × line tax_pct   (0 on a foreign POV — tax_pct is 0)
        //   charges= Σ expenses_snapshot amount × (1 + its gst_pct)  [header jsonb]
        // Coverage allocates GST with its goods and charges proportionally to the
        // received goods value, so pending_value shrinks as goods arrive.
        const raw: any[] = await this.dataSource.query(
            `SELECT po._id                                          AS doc_id,
                    po.voucher_no                                   AS doc_no,
                    COALESCE(po.dispatch_date, po."createdAt"::date) AS doc_date,
                    po.vendor_id                                    AS party_id,
                    v.company_name                                  AS party_name,
                    COALESCE(po.currency_code, 'INR')               AS currency_code,
                    SUM(COALESCE(pol.ordered_qty, 0))::float8        AS ordered_qty,
                    (( SUM(COALESCE(pol.ordered_qty, 0)
                           * COALESCE(pol.unit_price, 0)
                           * (1 - COALESCE(pol.discount_pct, 0) / 100)
                           * (1 + COALESCE(pol.tax_pct, 0) / 100))
                       + COALESCE(MAX(exp.expenses_total), 0) )
                     * MAX(COALESCE(po.exchange_rate, '1')::float8)
                    )::float8                                       AS ordered_value_inr,
                    COALESCE(MAX(grn.covered_qty), 0)::float8       AS covered_qty,
                    (( COALESCE(MAX(grn.covered_goodsgst), 0)
                       + COALESCE(
                           COALESCE(MAX(exp.expenses_total), 0)
                           * (COALESCE(MAX(grn.covered_goods), 0)
                              / NULLIF(SUM(COALESCE(pol.ordered_qty, 0)
                                           * COALESCE(pol.unit_price, 0)
                                           * (1 - COALESCE(pol.discount_pct, 0) / 100)), 0)),
                           0) )
                     * MAX(COALESCE(po.exchange_rate, '1')::float8)
                    )::float8                                       AS covered_value_inr,
                    COALESCE(MAX(grn.cover_count), 0)::int          AS cover_count
             FROM po_vendors po
             JOIN po_vendor_lines pol
                 ON pol.po_vendor_id = po._id
             LEFT JOIN vendors v ON v._id = po.vendor_id
             LEFT JOIN LATERAL (
                 -- Vendor charges (+ their GST) from the POV's expense snapshot.
                 SELECT COALESCE(SUM(
                            COALESCE(NULLIF(e->>'amount', '')::float8, 0)
                            * (1 + COALESCE(NULLIF(e->>'gst_pct', '')::float8, 0) / 100)
                        ), 0) AS expenses_total
                 FROM jsonb_array_elements(
                          COALESCE(po.expenses_snapshot, '[]'::jsonb)) e
             ) exp ON true
             LEFT JOIN (
                 SELECT pol2.po_vendor_id AS doc_id,
                        SUM(COALESCE(gl.accepted_qty, 0)) AS covered_qty,
                        -- Received goods taxable (for the charge-allocation ratio).
                        SUM(COALESCE(gl.accepted_qty, 0)
                            * COALESCE(pol2.unit_price, 0)
                            * (1 - COALESCE(pol2.discount_pct, 0) / 100))
                                                 AS covered_goods,
                        -- Received goods + their GST.
                        SUM(COALESCE(gl.accepted_qty, 0)
                            * COALESCE(pol2.unit_price, 0)
                            * (1 - COALESCE(pol2.discount_pct, 0) / 100)
                            * (1 + COALESCE(pol2.tax_pct, 0) / 100))
                                                 AS covered_goodsgst,
                        COUNT(DISTINCT g._id)    AS cover_count
                 FROM grn_lines gl
                 JOIN grns g
                     ON g._id = gl.grn_id
                    AND g.soft_delete = false
                    AND g.status <> 'cancelled'
                    AND ($6::text = 'all' OR g.status = $6)
                 JOIN po_vendor_lines pol2
                     ON pol2._id = gl.po_vendor_line_id
                 WHERE gl.company_id = $1 AND gl.soft_delete = false
                 GROUP BY pol2.po_vendor_id
             ) grn ON grn.doc_id = po._id
             WHERE po.company_id = $1
               AND po.soft_delete = false
               AND po.status NOT IN ('draft', 'cancelled')
               AND COALESCE(po.dispatch_date, po."createdAt"::date) BETWEEN $2 AND $3
               AND ($4::uuid IS NULL OR po.vendor_id = $4)
               AND ($5::text IS NULL
                    OR po.voucher_no ILIKE '%' || $5 || '%'
                    OR v.company_name ILIKE '%' || $5 || '%')
             GROUP BY po._id, po.voucher_no, po.dispatch_date, po."createdAt",
                      po.vendor_id, v.company_name, po.currency_code
             ORDER BY COALESCE(po.dispatch_date, po."createdAt"::date) DESC,
                      po.voucher_no`,
            [companyId, from, to, vendorId, search, grnScope]
        );

        return this.assembleDocStatusResponse(
            raw,
            from,
            to,
            statusFilter,
            page,
            perPage
        );
    }

    /** Drill-down: the GRN lines received against ONE Vendor PO. */
    async purchaseOrderStatusBreakdown(
        companyId: string,
        povId: string,
        grnScope?: string
    ): Promise<DocStatusBreakdownRowDto[]> {
        const scope =
            (grnScope || 'confirmed').toLowerCase() === 'all'
                ? 'all'
                : 'confirmed';
        const raw: any[] = await this.dataSource.query(
            `SELECT g._id                                    AS cover_id,
                    g.voucher_no                             AS cover_no,
                    g.status                                 AS cover_type,
                    g.grn_date                               AS cover_date,
                    COALESCE(po.currency_code, 'INR')        AS currency_code,
                    COALESCE(po.currency_code, 'INR')        AS currency_symbol,
                    COALESCE(pr.name, '—')                    AS product_name,
                    pr.code                                  AS product_code,
                    COALESCE(gl.hsn_code, pr.hsn_code)       AS hsn_code,
                    gl.seq                                   AS seq,
                    COALESCE(gl.accepted_qty, 0)::float8    AS cover_qty,
                    -- Taxable (goods) amount, GST, and GST-inclusive total.
                    (COALESCE(gl.accepted_qty, 0)
                       * COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                    )::float8                                AS cover_amount,
                    (COALESCE(gl.accepted_qty, 0)
                       * COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                       * COALESCE(pol.tax_pct, 0) / 100
                    )::float8                                AS cover_gst,
                    (COALESCE(gl.accepted_qty, 0)
                       * COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                       * (1 + COALESCE(pol.tax_pct, 0) / 100)
                    )::float8                                AS cover_total,
                    (COALESCE(gl.accepted_qty, 0)
                       * COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                       * COALESCE(po.exchange_rate, '1')::float8
                    )::float8                                AS cover_amount_inr,
                    COALESCE(pol.ordered_qty, 0)::float8    AS order_qty,
                    (COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                    )::float8                                AS order_rate
             FROM grn_lines gl
             JOIN grns g
                 ON g._id = gl.grn_id
                AND g.soft_delete = false
                AND g.status <> 'cancelled'
                AND ($3::text = 'all' OR g.status = $3)
             JOIN po_vendor_lines pol ON pol._id = gl.po_vendor_line_id
             JOIN po_vendors po ON po._id = pol.po_vendor_id
             LEFT JOIN products pr ON pr._id = gl.product_id
             WHERE gl.company_id = $1
               AND gl.soft_delete = false
               AND pol.po_vendor_id = $2
             ORDER BY g.grn_date, g.voucher_no, gl.seq`,
            [companyId, povId, scope]
        );
        return mapDocStatusBreakdown(raw);
    }

    /**
     * Drill-down: EVERY line of ONE Vendor PO (not just lines a GRN has
     * touched) with its own ordered vs received-so-far qty — mirrors
     * `salesOrderStatusLineBreakdown` for the purchase side.
     */
    async purchaseOrderStatusLineBreakdown(
        companyId: string,
        povId: string,
        grnScope?: string
    ): Promise<DocStatusLineBreakdownRowDto[]> {
        const scope =
            (grnScope || 'confirmed').toLowerCase() === 'all'
                ? 'all'
                : 'confirmed';
        const raw: any[] = await this.dataSource.query(
            `SELECT pol._id                                    AS line_id,
                    pol.product_id                             AS product_id,
                    COALESCE(pr.name, pol.description, '—')    AS product_name,
                    pr.code                                    AS product_code,
                    COALESCE(pol.hsn_code, pr.hsn_code)        AS hsn_code,
                    pol.unit                                   AS unit,
                    COALESCE(pol.ordered_qty, 0)::float8       AS ordered_qty,
                    COALESCE(cov.covered_qty, 0)::float8       AS covered_qty,
                    -- Same formula as purchaseOrderStatusBreakdown's order_rate.
                    (COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                    )::float8                                  AS rate
             FROM po_vendor_lines pol
             LEFT JOIN products pr ON pr._id = pol.product_id
             LEFT JOIN (
                 SELECT gl.po_vendor_line_id AS line_id,
                        SUM(COALESCE(gl.accepted_qty, 0)) AS covered_qty
                 FROM grn_lines gl
                 JOIN grns g
                     ON g._id = gl.grn_id
                    AND g.soft_delete = false
                    AND g.status <> 'cancelled'
                    AND ($3::text = 'all' OR g.status = $3)
                 WHERE gl.company_id = $1 AND gl.soft_delete = false
                 GROUP BY gl.po_vendor_line_id
             ) cov ON cov.line_id = pol._id
             WHERE pol.po_vendor_id = $2
             ORDER BY pol.seq`,
            [companyId, povId, scope]
        );
        return mapDocStatusLineBreakdown(raw);
    }

    /** Same rows as `purchaseOrderStatusLineBreakdown`, batched across MANY
     *  POVs in one query (`po_vendor_id = ANY(...)`) instead of one query per
     *  POV — used only by `purchaseOrderStatusExcel`, which previously fired
     *  one query per row in the export. */
    private async purchaseOrderStatusLineBreakdownBatch(
        companyId: string,
        povIds: string[],
        grnScope?: string
    ): Promise<Map<string, DocStatusLineBreakdownRowDto[]>> {
        const byDoc = new Map<string, DocStatusLineBreakdownRowDto[]>();
        if (!povIds.length) return byDoc;
        const scope =
            (grnScope || 'confirmed').toLowerCase() === 'all'
                ? 'all'
                : 'confirmed';
        const raw: any[] = await this.dataSource.query(
            `SELECT pol.po_vendor_id                           AS pov_id,
                    pol._id                                    AS line_id,
                    pol.product_id                             AS product_id,
                    COALESCE(pr.name, pol.description, '—')    AS product_name,
                    pr.code                                    AS product_code,
                    COALESCE(pol.hsn_code, pr.hsn_code)        AS hsn_code,
                    pol.unit                                   AS unit,
                    COALESCE(pol.ordered_qty, 0)::float8       AS ordered_qty,
                    COALESCE(cov.covered_qty, 0)::float8       AS covered_qty,
                    (COALESCE(pol.unit_price, 0)
                       * (1 - COALESCE(pol.discount_pct, 0) / 100)
                    )::float8                                  AS rate
             FROM po_vendor_lines pol
             LEFT JOIN products pr ON pr._id = pol.product_id
             LEFT JOIN (
                 SELECT gl.po_vendor_line_id AS line_id,
                        SUM(COALESCE(gl.accepted_qty, 0)) AS covered_qty
                 FROM grn_lines gl
                 JOIN grns g
                     ON g._id = gl.grn_id
                    AND g.soft_delete = false
                    AND g.status <> 'cancelled'
                    AND ($3::text = 'all' OR g.status = $3)
                 WHERE gl.company_id = $1 AND gl.soft_delete = false
                 GROUP BY gl.po_vendor_line_id
             ) cov ON cov.line_id = pol._id
             WHERE pol.po_vendor_id = ANY($2::uuid[])
             ORDER BY pol.po_vendor_id, pol.seq`,
            [companyId, povIds, scope]
        );
        const grouped = new Map<string, any[]>();
        for (const r of raw) {
            const key = r.pov_id;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(r);
        }
        for (const [povId, rawRows] of grouped) {
            byDoc.set(povId, mapDocStatusLineBreakdown(rawRows));
        }
        return byDoc;
    }

    /** The Purchase Order Status list as an .xlsx Buffer. */
    async purchaseOrderStatusExcel(
        companyId: string,
        query: IPurchaseOrderStatusQuery
    ): Promise<Buffer> {
        const result = await this.purchaseOrderStatus(companyId, {
            ...query,
            page: 1,
            perPage: 100000,
        });
        const linesByDoc = await this.purchaseOrderStatusLineBreakdownBatch(
            companyId,
            result.rows.map((r) => r.doc_id),
            query.grn_scope
        );
        const lineRows = result.rows.flatMap((r) =>
            (linesByDoc.get(r.doc_id) || []).map((l) => ({
                doc_no: r.doc_no,
                party_name: r.party_name,
                currency_code: r.currency_code,
                ...l,
            }))
        );
        return this.docStatusExcel(
            result,
            {
                title: 'Purchase Order Status',
                docNoLabel: 'PO No',
                partyLabel: 'Vendor',
                coverCountLabel: 'GRNs',
                note: `Coverage by ${query.grn_scope || 'confirmed'} GRNs; values are ₹-normalised at the POV rate.`,
            },
            lineRows
        );
    }

    // ── Stock Turnover Ratio ─────────────────────────────────────────────
    /**
     * How many times inventory is sold & replaced over the period, per product
     * and overall. Everything is valued in INR at each product's WEIGHTED-AVERAGE
     * vendor cost (Σ accepted GRN qty × POV unit_price × POV rate→INR ÷ Σ accepted
     * qty) — multi-currency POVs are converted to INR at their own frozen rate so
     * the value is a single basis. The per-product ratio/DIO are currency-free
     * anyway (unit cost cancels). The two sides of the ratio stay consistent:
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
                 -- Multi-currency: a POV is priced in the vendor's own currency,
                 -- so convert each receipt to INR at the POV's frozen rate
                 -- (exchange_rate = INR per 1 unit of the PO currency; 1 for a
                 -- domestic INR POV) — otherwise USD + EUR + INR costs would be
                 -- summed into one meaningless "value". This analytical ratio
                 -- report needs a single basis to aggregate across products.
                 SELECT gl.product_id,
                        SUM(gl.accepted_qty::numeric * povl.unit_price::numeric
                            * COALESCE(NULLIF(pov.exchange_rate::numeric, 0), 1)) AS cost_sum,
                        SUM(gl.accepted_qty::numeric)                            AS qty_sum
                 FROM grn_lines gl
                 JOIN grns g
                   ON g._id = gl.grn_id
                  AND g.company_id = $1
                  AND g.soft_delete = false
                  AND g.status <> 'cancelled'
                 JOIN po_vendor_lines povl ON povl._id = gl.po_vendor_line_id
                 JOIN po_vendors pov ON pov._id = povl.po_vendor_id
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
                        SUM(CASE WHEN movement_date < $2::date
                                 THEN qty::numeric ELSE 0 END) AS opening,
                        SUM(CASE WHEN movement_date < ($3::date + INTERVAL '1 day')
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

    // ── Inventory Aging ──────────────────────────────────────────────────
    /**
     * Aging of CLOSING stock as of a snapshot date. The on-hand qty is
     * FIFO-attributed to its GRN receipt cohorts (oldest left first, so what
     * remains is the newest receipts); any remaining unit whose receipt is
     * ≥ `aging_days` old counts as AGED (slow-moving). Value = qty × the
     * product's weighted-average vendor cost, each receipt converted to INR at
     * its POV's frozen rate (so multi-currency sourcing values on one basis).
     *
     * Reconciliation: the FIFO leftover is trimmed/topped-up to the true
     * `stock_movements` on-hand. A shortfall (opening / non-GRN inflow with no
     * receipt date) becomes `undated_qty` — treated as oldest, always aged.
     */
    async inventoryAging(
        companyId: string,
        query: IInventoryAgingQuery
    ): Promise<InventoryAgingResponseDto> {
        const asOf = query.as_of || isoDate(new Date());

        // Fixed age buckets (days). Undated stock lands in the oldest (>120).
        const BUCKETS = [
            { key: 'd0_30', label: '0-30', max: 30 },
            { key: 'd31_60', label: '31-60', max: 60 },
            { key: 'd61_90', label: '61-90', max: 90 },
            { key: 'd91_120', label: '91-120', max: 120 },
            { key: 'd120_plus', label: '>120', max: Infinity },
        ];
        const bucketIndex = (age: number): number => {
            for (let i = 0; i < BUCKETS.length; i += 1) {
                if (age <= BUCKETS[i].max) return i;
            }
            return BUCKETS.length - 1;
        };

        // Product metadata + weighted-avg cost + filters.
        const params: any[] = [companyId];
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
        const prods: any[] = await this.dataSource.query(
            `SELECT p._id                       AS product_id,
                    p.code                      AS product_code,
                    p.name                      AS product_name,
                    cat.name                    AS category_name,
                    COALESCE(cost.cost_sum, 0)  AS cost_sum,
                    COALESCE(cost.qty_sum, 0)   AS cost_qty_sum
             FROM products p
             LEFT JOIN categories cat ON cat._id = p.category_id
             LEFT JOIN (
                 -- Multi-currency: convert each receipt to INR at the POV's
                 -- frozen rate (INR per 1 unit of the PO currency; 1 for a
                 -- domestic INR POV) so a product sourced in USD/EUR isn't
                 -- valued in mixed currencies. Aged-stock value needs one basis.
                 SELECT gl.product_id,
                        SUM(gl.accepted_qty::numeric * povl.unit_price::numeric
                            * COALESCE(NULLIF(pov.exchange_rate::numeric, 0), 1)) AS cost_sum,
                        SUM(gl.accepted_qty::numeric)                            AS qty_sum
                 FROM grn_lines gl
                 JOIN grns g
                   ON g._id = gl.grn_id
                  AND g.company_id = $1
                  AND g.soft_delete = false
                  AND g.status = 'confirmed'
                 JOIN po_vendor_lines povl ON povl._id = gl.po_vendor_line_id
                 JOIN po_vendors pov ON pov._id = povl.po_vendor_id
                 WHERE gl.accepted_qty::numeric > 0
                 GROUP BY gl.product_id
             ) cost ON cost.product_id = p._id
             WHERE p.company_id = $1 AND p.soft_delete = false
             ${filters.join('\n             ')}`,
            params
        );
        const metaById = new Map<string, any>(
            prods.map((r) => [r.product_id, r])
        );

        // Closing on-hand + total outflow as of the snapshot, per product.
        const ohRaw: any[] = metaById.size
            ? await this.dataSource.query(
                  `SELECT product_id,
                          SUM(CASE WHEN movement_date < ($2::date + INTERVAL '1 day')
                                   THEN qty::numeric ELSE 0 END) AS closing,
                          SUM(CASE WHEN qty::numeric < 0
                                    AND movement_date < ($2::date + INTERVAL '1 day')
                                   THEN -qty::numeric ELSE 0 END) AS out_qty
                   FROM stock_movements
                   WHERE company_id = $1 AND deleted = false
                   GROUP BY product_id`,
                  [companyId, asOf]
              )
            : [];
        const ohById = new Map<string, { closing: number; out: number }>(
            ohRaw.map((r) => [
                r.product_id,
                { closing: n(r.closing), out: n(r.out_qty) },
            ])
        );

        // Receipt cohorts up to the snapshot, per product + grn_date.
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
                  [companyId, asOf]
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

        const recvByProduct = new Map<string, Array<{ d: string; qty: number }>>();
        for (const r of recvRaw) {
            const arr = recvByProduct.get(r.product_id) || [];
            arr.push({ d: isoOf(r.d), qty: n(r.qty) });
            recvByProduct.set(r.product_id, arr);
        }

        let rows: InventoryAgingRowDto[] = [];
        for (const [pid, meta] of metaById.entries()) {
            const oh = ohById.get(pid) || { closing: 0, out: 0 };
            const closing = round4(oh.closing);
            if (closing <= 1e-9) continue; // aging is about stock ON HAND

            const costQty = n(meta.cost_qty_sum);
            const unitCost = costQty > 0 ? r2(n(meta.cost_sum) / costQty) : 0;

            // FIFO: consume the oldest receipt cohorts by the total outflow.
            const cohorts = (recvByProduct.get(pid) || [])
                .map((c) => ({ d: c.d, qty: c.qty }))
                .sort((a, b) => (a.d < b.d ? -1 : 1));
            let out = round4(oh.out);
            for (let i = 0; i < cohorts.length && out > 1e-9; i += 1) {
                const take = Math.min(cohorts[i].qty, out);
                cohorts[i].qty = round4(cohorts[i].qty - take);
                out = round4(out - take);
            }
            let leftover = cohorts.filter((c) => c.qty > 1e-9);
            let datedQty = round4(leftover.reduce((s, c) => s + c.qty, 0));

            // Reconcile the FIFO leftover with the true on-hand.
            let undated = round4(closing - datedQty);
            if (undated < 0) {
                // More dated stock than the ledger shows on hand → the excess
                // left untracked; drop it from the OLDEST leftover cohorts.
                let excess = -undated;
                undated = 0;
                for (const c of leftover) {
                    if (excess <= 1e-9) break;
                    const take = Math.min(c.qty, excess);
                    c.qty = round4(c.qty - take);
                    excess = round4(excess - take);
                }
                leftover = leftover.filter((c) => c.qty > 1e-9);
                datedQty = round4(leftover.reduce((s, c) => s + c.qty, 0));
            }

            // Distribute the remaining on-hand across the fixed age buckets.
            const bq = BUCKETS.map(() => 0);
            for (const c of leftover) {
                const age = Math.max(0, dayDiff(c.d, asOf));
                const i = bucketIndex(age);
                bq[i] = round4(bq[i] + c.qty);
            }
            // Undated (opening / non-GRN) stock has no receipt date → oldest.
            bq[BUCKETS.length - 1] = round4(bq[BUCKETS.length - 1] + undated);

            const buckets = BUCKETS.map((b, i) => ({
                key: b.key,
                label: b.label,
                qty: r2(bq[i]),
                value: r2(bq[i] * unitCost),
            }));
            const closingValue = r2(closing * unitCost);

            rows.push({
                product_id: pid,
                product_code: meta.product_code || undefined,
                product_name: meta.product_name,
                category_name: meta.category_name || undefined,
                closing_qty: r2(closing),
                closing_value_inr: closingValue,
                unit_cost: unitCost,
                undated_qty: r2(undated),
                buckets,
            });
        }

        const dir = query.order_direction === 'asc' ? 1 : -1;
        const orderBy = query.order_by || 'oldest';
        // >120 (oldest) bucket value — the slow-mover signal — is the default sort.
        const over120 = (r: InventoryAgingRowDto): number =>
            r.buckets[r.buckets.length - 1]?.value || 0;
        rows.sort((a, b) => {
            switch (orderBy) {
                case 'name':
                    return (
                        (a.product_name || '').localeCompare(
                            b.product_name || ''
                        ) * dir
                    );
                case 'closing_value':
                    return (a.closing_value_inr - b.closing_value_inr) * dir;
                case 'oldest':
                default:
                    return (over120(a) - over120(b)) * dir;
            }
        });

        const totalBuckets = BUCKETS.map((b, i) => ({
            key: b.key,
            label: b.label,
            qty: r2(rows.reduce((s, r) => s + (r.buckets[i]?.qty || 0), 0)),
            value: r2(rows.reduce((s, r) => s + (r.buckets[i]?.value || 0), 0)),
        }));
        const totals = {
            product_count: rows.length,
            closing_qty: r2(rows.reduce((s, r) => s + r.closing_qty, 0)),
            closing_value_inr: r2(
                rows.reduce((s, r) => s + r.closing_value_inr, 0)
            ),
            undated_qty: r2(rows.reduce((s, r) => s + r.undated_qty, 0)),
            buckets: totalBuckets,
        };

        const perPage = Math.max(
            1,
            Math.min(100000, Number(query.perPage) || 25)
        );
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * perPage;

        return {
            as_of_label: isoToDdmmyyyy(asOf),
            rows: rows.slice(start, start + perPage),
            totals,
            currency: 'INR',
            pagination: {
                total: rows.length,
                perPage,
                orderBy,
            },
        };
    }

    /** The same report as an .xlsx Buffer, same column order + TOTAL row. */
    async inventoryAgingExcel(
        companyId: string,
        query: IInventoryAgingQuery
    ): Promise<Buffer> {
        const result = await this.inventoryAging(companyId, {
            ...query,
            page: 1,
            perPage: 100000,
        });
        const bucketLabels = (result.totals.buckets || []).map((b) => b.label);
        const header = [
            'Product',
            'Code',
            'Category',
            'Closing Qty',
            'Closing Value (INR)',
            ...bucketLabels.flatMap((l) => [
                `${l}d Qty`,
                `${l}d Value (INR)`,
            ]),
            'Undated Qty',
        ];
        const body = result.rows.map((r) => [
            r.product_name,
            r.product_code || '',
            r.category_name || '',
            r.closing_qty,
            r.closing_value_inr,
            ...r.buckets.flatMap((b) => [b.qty, b.value]),
            r.undated_qty,
        ]);
        const totalRow = [
            'TOTAL',
            '',
            '',
            result.totals.closing_qty,
            result.totals.closing_value_inr,
            ...result.totals.buckets.flatMap((b) => [b.qty, b.value]),
            result.totals.undated_qty,
        ];
        const aoa: (string | number)[][] = [
            [`Inventory Aging — as of ${result.as_of_label} (INR)`],
            [
                'Closing stock FIFO-aged from GRN receipts into 0-30 / 31-60 / 61-90 / 91-120 / >120 day buckets, valued at weighted-avg vendor cost. Undated = opening / non-GRN stock, treated as oldest.',
            ],
            [],
            header,
            ...body,
            [],
            totalRow,
        ];
        return this.fileService.writeExcelFromArray(aoa);
    }

    /**
     * Drill-down behind ONE product's closing inventory in the aging report:
     * the PURCHASES (confirmed GRN receipts, qty + INR rate) and the SALES
     * (issued invoice lines, qty + INR selling rate) that net to the CLOSING
     * stock. Closing qty comes from the stock ledger (matches the report);
     * closing value = closing qty × weighted-average purchase cost (the same
     * basis the aging report values stock at). All money is INR.
     */
    async inventoryAgingBreakdown(
        companyId: string,
        productId: string,
        asOf?: string
    ): Promise<any> {
        const cutoff = asOf || isoDate(new Date());

        // Purchases — confirmed GRN receipts up to the snapshot, native cost
        // converted to INR at the POV's frozen rate.
        const purchasesRaw = await this.dataSource.query(
            `SELECT g._id::text                        AS grn_id,
                    g.voucher_no                       AS grn_voucher_no,
                    TO_CHAR(g.grn_date, 'DD-MM-YYYY')  AS date,
                    pov._id::text                      AS pov_id,
                    pov.voucher_no                     AS pov_voucher_no,
                    COALESCE(v.company_name, '—')      AS vendor_name,
                    gl.accepted_qty::float8            AS qty,
                    (povl.unit_price::float8
                        * COALESCE(NULLIF(pov.exchange_rate::float8, 0), 1))
                                                       AS rate_inr
             FROM grn_lines gl
             JOIN grns g
               ON g._id = gl.grn_id
              AND g.company_id = $1
              AND g.soft_delete = false
              AND g.status = 'confirmed'
             JOIN po_vendor_lines povl ON povl._id = gl.po_vendor_line_id
             JOIN po_vendors pov ON pov._id = povl.po_vendor_id
             LEFT JOIN vendors v ON v._id = pov.vendor_id
             WHERE gl.product_id = $2
               AND gl.accepted_qty::numeric > 0
               AND g.grn_date <= $3
             ORDER BY g.grn_date ASC, g.voucher_no ASC`,
            [companyId, productId, cutoff]
        );
        const purchases = purchasesRaw.map((r: any) => {
            const qty = r2(n(r.qty));
            const rate = r2(n(r.rate_inr));
            return {
                date: r.date,
                grn_id: r.grn_id,
                grn_voucher_no: r.grn_voucher_no,
                pov_id: r.pov_id,
                pov_voucher_no: r.pov_voucher_no,
                vendor_name: r.vendor_name,
                qty,
                rate_inr: rate,
                value_inr: r2(qty * rate),
            };
        });

        // Sales — issued invoice lines up to the snapshot, selling value in INR
        // (taxable_amount ÷ the invoice's frozen doc-per-₹1 rate).
        const salesRaw = await this.dataSource.query(
            `SELECT i._id::text                          AS invoice_id,
                    i.voucher_no                          AS invoice_voucher_no,
                    TO_CHAR(i.invoice_date, 'DD-MM-YYYY')  AS date,
                    COALESCE(c.company_name,
                             i.customer_snapshot->>'company_name', '—')
                                                          AS customer_name,
                    il.qty::float8                        AS qty,
                    (il.taxable_amount::float8
                        / COALESCE(NULLIF(i.exchange_rate::float8, 0), 1))
                                                          AS value_inr
             FROM invoice_lines il
             JOIN invoices i
               ON i._id = il.invoice_id
              AND i.company_id = $1
              AND i.soft_delete = false
              AND i.status NOT IN ('draft', 'cancelled')
             LEFT JOIN customers c ON c._id = i.customer_id
             WHERE il.product_id = $2
               AND i.invoice_date <= $3
             ORDER BY i.invoice_date ASC, i.voucher_no ASC`,
            [companyId, productId, cutoff]
        );
        const sales = salesRaw.map((r: any) => {
            const qty = r2(n(r.qty));
            const value = r2(n(r.value_inr));
            return {
                date: r.date,
                invoice_id: r.invoice_id,
                invoice_voucher_no: r.invoice_voucher_no,
                customer_name: r.customer_name,
                qty,
                rate_inr: qty > 0 ? r2(value / qty) : 0,
                value_inr: value,
            };
        });

        // Closing on-hand from the stock ledger (matches the aging report).
        const ohRaw = await this.dataSource.query(
            `SELECT COALESCE(SUM(CASE
                        WHEN movement_date < ($2::date + INTERVAL '1 day')
                        THEN qty::numeric ELSE 0 END), 0)::float8 AS closing
             FROM stock_movements
             WHERE company_id = $1 AND deleted = false AND product_id = $3`,
            [companyId, cutoff, productId]
        );
        const closingQty = r2(n(ohRaw?.[0]?.closing));

        const purchasedQty = r2(purchases.reduce((s, p) => s + p.qty, 0));
        const purchasedValue = r2(
            purchases.reduce((s, p) => s + p.value_inr, 0)
        );
        const soldQty = r2(sales.reduce((s, x) => s + x.qty, 0));
        const soldValue = r2(sales.reduce((s, x) => s + x.value_inr, 0));
        const avgCost = purchasedQty > 0 ? purchasedValue / purchasedQty : 0;
        const closingValue = r2(Math.max(0, closingQty) * avgCost);

        const ph = await this.dataSource.query(
            `SELECT p.code AS product_code, p.name AS product_name
             FROM products p WHERE p._id = $1`,
            [productId]
        );

        return {
            product: ph?.[0] || null,
            as_of: cutoff,
            purchases,
            sales,
            summary: {
                purchased_qty: purchasedQty,
                purchased_value_inr: purchasedValue,
                sold_qty: soldQty,
                sold_value_inr: soldValue,
                avg_cost_inr: r2(avgCost),
                closing_qty: closingQty,
                closing_value_inr: closingValue,
            },
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

// ── Document coverage status helpers (shared: SO Status + POV Status) ─────
// Pure — the per-report SQL already hands over INR-normalised values, so these
// only classify + total. Reused by `salesOrderStatus` and `purchaseOrderStatus`.
const DOC_STATUS_EPS = 1e-6;
function mapDocStatusRows(raw: any[]): DocStatusRowDto[] {
    return raw.map((r) => {
        const orderedQty = n(r.ordered_qty);
        const coveredQty = n(r.covered_qty);
        const orderedValueInr = r2(n(r.ordered_value_inr));
        const coveredValueInr = r2(n(r.covered_value_inr));
        const pendingQty = r2(Math.max(0, orderedQty - coveredQty));
        const pendingValueInr = r2(
            Math.max(0, orderedValueInr - coveredValueInr)
        );
        const status: 'open' | 'partial' | 'closed' =
            coveredQty <= DOC_STATUS_EPS
                ? 'open'
                : coveredQty + DOC_STATUS_EPS >= orderedQty
                ? 'closed'
                : 'partial';
        const coveragePct =
            orderedQty > 0
                ? Math.min(100, r2((coveredQty / orderedQty) * 100))
                : 0;
        return {
            doc_id: r.doc_id,
            doc_no: r.doc_no,
            doc_date: r.doc_date,
            party_id: r.party_id ?? null,
            party_name: r.party_name ?? null,
            currency_code: r.currency_code || 'INR',
            status,
            ordered_qty: r2(orderedQty),
            covered_qty: r2(coveredQty),
            pending_qty: pendingQty,
            ordered_value_inr: orderedValueInr,
            covered_value_inr: coveredValueInr,
            pending_value_inr: pendingValueInr,
            coverage_pct: coveragePct,
            cover_count: n(r.cover_count),
        };
    });
}
function docStatusPartyOptions(rows: DocStatusRowDto[]): DocStatusOptionDto[] {
    const map = new Map<string, string>();
    for (const r of rows) {
        if (r.party_id && !map.has(r.party_id))
            map.set(r.party_id, r.party_name || '—');
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
    );
}
function docStatusTotals(rows: DocStatusRowDto[]): DocStatusTotalsDto {
    const t = rows.reduce(
        (acc, r) => {
            acc.total_docs += 1;
            if (r.status === 'open') acc.open_count += 1;
            else if (r.status === 'partial') acc.partial_count += 1;
            else acc.closed_count += 1;
            acc.ordered_value_inr += r.ordered_value_inr;
            acc.covered_value_inr += r.covered_value_inr;
            acc.pending_value_inr += r.pending_value_inr;
            return acc;
        },
        {
            total_docs: 0,
            open_count: 0,
            partial_count: 0,
            closed_count: 0,
            ordered_value_inr: 0,
            covered_value_inr: 0,
            pending_value_inr: 0,
        }
    );
    t.ordered_value_inr = r2(t.ordered_value_inr);
    t.covered_value_inr = r2(t.covered_value_inr);
    t.pending_value_inr = r2(t.pending_value_inr);
    return t;
}
function mapDocStatusBreakdown(raw: any[]): DocStatusBreakdownRowDto[] {
    return raw.map((r) => {
        const coverQty = n(r.cover_qty);
        const coverAmount = n(r.cover_amount);
        return {
            cover_id: r.cover_id,
            cover_no: r.cover_no,
            cover_type: r.cover_type,
            cover_date: r.cover_date,
            currency_code: r.currency_code || 'INR',
            currency_symbol: r.currency_symbol || r.currency_code || 'INR',
            product_name: r.product_name,
            product_code: r.product_code ?? null,
            hsn_code: r.hsn_code ?? null,
            order_qty: n(r.order_qty) || null,
            order_rate: r.order_rate != null ? r2(n(r.order_rate)) : null,
            cover_qty: coverQty,
            cover_rate: coverQty > 0 ? r2(coverAmount / coverQty) : 0,
            cover_amount: r2(coverAmount),
            cover_amount_inr: r2(n(r.cover_amount_inr)),
            // GST split — only reports that carry GST (POV Status) emit these.
            cover_gst: r.cover_gst != null ? r2(n(r.cover_gst)) : null,
            cover_total: r.cover_total != null ? r2(n(r.cover_total)) : null,
        };
    });
}
function mapDocStatusLineBreakdown(
    raw: any[]
): DocStatusLineBreakdownRowDto[] {
    return raw.map((r) => {
        const orderedQty = n(r.ordered_qty);
        const coveredQty = n(r.covered_qty);
        const pendingQty = r2(Math.max(0, orderedQty - coveredQty));
        const status: 'open' | 'partial' | 'closed' =
            coveredQty <= DOC_STATUS_EPS
                ? 'open'
                : coveredQty + DOC_STATUS_EPS >= orderedQty
                ? 'closed'
                : 'partial';
        const rate = r.rate != null ? r2(n(r.rate)) : null;
        return {
            line_id: r.line_id,
            product_id: r.product_id ?? null,
            product_name: r.product_name || '—',
            product_code: r.product_code ?? null,
            hsn_code: r.hsn_code ?? null,
            unit: r.unit ?? null,
            ordered_qty: r2(orderedQty),
            covered_qty: r2(coveredQty),
            pending_qty: pendingQty,
            rate,
            pending_amount: r2(pendingQty * (rate || 0)),
            status,
        };
    });
}
