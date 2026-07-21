import { Injectable, NotFoundException } from '@nestjs/common';

import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '../repository/repositories/po-vendor-line.repository';
import { ENUM_PO_VENDOR_STATUS } from '../enums/po-vendor.enum';
import {
    PoCoverageLineDto,
    PoCoverageResponseDto,
    PoCoverageTotalsDto,
} from '../dtos/response/po-coverage.response.dto';

import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { StockLedgerService } from '@modules/inventory/services/stock-ledger.service';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Read-only per-PO coverage roll-up (POV plan §4, §14).
 * Source of truth: PO line.qty (ordered) + aggregated POV line columns
 * (covered, dispatched, received, lost). Computed live — no
 * denormalized columns on PO (§19.12).
 */
@Injectable()
export class PoCoverageService {
    constructor(
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly productRepository: ProductRepository,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly stockLedger: StockLedgerService
    ) {}

    async getCoverage(
        companyId: string,
        purchaseOrderId: string
    ): Promise<PoCoverageResponseDto> {
        const po: any = await this.poRepository.findOne({
            _id: purchaseOrderId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!po) throw new NotFoundException('Purchase Order not found');

        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: purchaseOrderId,
        } as any);

        // ── Collect all non-cancelled POVs for this PO ─────────────────
        const povs = await this.povRepository.findAll({
            purchase_order_id: purchaseOrderId,
            soft_delete: false,
        } as any);
        const activePovs = (povs as any[]).filter(
            p => p.status !== ENUM_PO_VENDOR_STATUS.CANCELLED
        );
        const activePovIds = activePovs.map(p => p._id.toString());
        const closedPovIds = new Set(
            activePovs
                .filter(p => p.status === ENUM_PO_VENDOR_STATUS.CLOSED)
                .map(p => p._id.toString())
        );

        const povLines = activePovIds.length
            ? await this.povLineRepository.findAll({
                  po_vendor_id: { $in: activePovIds },
              } as any)
            : [];

        // ── Bucket POV lines by purchase_order_line_id ─────────────────
        // `consumed` is the qty this PO line is still "owed" to non-cancelled
        // POVs — status-aware so shortfalls release back to pending:
        //   DRAFT      → ordered_qty
        //   DISPATCHED → dispatched_qty (under-dispatch → pending)
        //   CLOSED     → received_qty   (short receipt → pending)
        // Mirrors `computePendingByPoLineId` in po-vendor.service.
        const povStatusById = new Map<string, string>();
        for (const p of activePovs) {
            povStatusById.set(p._id.toString(), p.status);
        }
        const aggByPoLine = new Map<
            string,
            {
                covered: number;
                dispatched: number;
                received: number;
                lost: number;
                consumed: number;
            }
        >();
        for (const pl of povLines as any[]) {
            const k = pl.purchase_order_line_id?.toString();
            if (!k) continue;
            const cur =
                aggByPoLine.get(k) || {
                    covered: 0,
                    dispatched: 0,
                    received: 0,
                    lost: 0,
                    consumed: 0,
                };
            cur.covered += num(pl.ordered_qty);
            cur.dispatched += num(pl.dispatched_qty);
            cur.received += num(pl.received_qty);
            const status = povStatusById.get(pl.po_vendor_id?.toString());
            if (status === ENUM_PO_VENDOR_STATUS.CLOSED) {
                cur.consumed += num(pl.received_qty);
                // Display-only: shortfall recorded as loss.
                cur.lost += num(pl.dispatched_qty) - num(pl.received_qty);
            } else if (status === ENUM_PO_VENDOR_STATUS.DISPATCHED) {
                cur.consumed += num(pl.dispatched_qty);
            } else {
                cur.consumed += num(pl.ordered_qty);
            }
            aggByPoLine.set(k, cur);
        }

        // ── Cost aggregate (cost-variance reporting ONLY) ──────────────
        // Deliberately separate from the qty aggregation above, which must not
        // change: the pending/coverage guards are computed from it.
        //
        // A POV created by the bulk importer (or any standalone POV later
        // linked to this PO) has `purchase_order_line_id = NULL` on its lines,
        // so those lines are invisible to `aggByPoLine`. For COST purposes we
        // fall back to matching on product_id — but only when that product
        // appears on exactly ONE PO line, so an ambiguous match is skipped
        // rather than attributed to the wrong line.
        const poLineIdByProduct = new Map<string, string | null>();
        for (const pol of poLines as any[]) {
            const pid = pol.product_id?.toString();
            if (!pid) continue;
            poLineIdByProduct.set(
                pid,
                poLineIdByProduct.has(pid) ? null : pol._id.toString()
            );
        }
        const costByPoLine = new Map<string, { qty: number; value: number }>();
        for (const pl of povLines as any[]) {
            let k = pl.purchase_order_line_id?.toString();
            if (!k) {
                const pid = pl.product_id?.toString();
                k = pid ? poLineIdByProduct.get(pid) || undefined : undefined;
            }
            if (!k) continue;
            const cur = costByPoLine.get(k) || { qty: 0, value: 0 };
            cur.qty += num(pl.ordered_qty);
            cur.value += num(pl.ordered_qty) * num(pl.unit_price);
            costByPoLine.set(k, cur);
        }

        // ── Hydrate product info for line labels ───────────────────────
        const productIds = unique(
            (poLines as any[])
                .map(l => l.product_id?.toString())
                .filter((v): v is string => !!v)
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)
            : [];
        const productMap = toMap(products as any[]);

        // ── FREE on-hand stock per product (single ledger pool) ────────
        // Lets the Coverage tab flag pending qty that can be served straight
        // from stock instead of raising a new POV. Uses FREE stock only —
        // goods already received against (non-cancelled) POV lines are reserved
        // to their own SO lines, so they must not be offered "from stock" (that
        // double-counted a partially-received order). `stockRemaining` is
        // decremented as we allocate across lines so a product appearing on
        // multiple PO lines never double-counts its shared pool.
        const onHandMap = productIds.length
            ? await this.stockLedger.freeOnHandMap(companyId, productIds)
            : new Map<string, number>();
        const stockRemaining = new Map<string, number>(onHandMap);

        // ── Per-PO-line invoiced totals (drives Generate Invoice gate).
        // sumQtyByPoLineId already excludes CANCELLED invoices. We can
        // safely subtract `invoiced` from `dispatched` to get what's still
        // available to invoice.
        const invoicedByPoLine = new Map<string, number>();
        for (const pol of poLines as any[]) {
            const k = pol._id.toString();
            const invoiced = await this.invoiceRepository.sumQtyByPoLineId(k);
            invoicedByPoLine.set(k, invoiced);
        }

        // ── Build per-line response ────────────────────────────────────
        const lines: PoCoverageLineDto[] = [];
        const totals: PoCoverageTotalsDto = {
            ordered: '0',
            covered: '0',
            dispatched: '0',
            received: '0',
            lost: '0',
            short: '0',
            pending: '0',
            invoiced: '0',
            invoiceable: '0',
            from_stock: '0',
        };
        let totOrd = 0,
            totCov = 0,
            totDis = 0,
            totRec = 0,
            totLost = 0,
            totShort = 0,
            totPend = 0,
            totInv = 0,
            totInvoiceable = 0,
            totFromStock = 0;

        for (const pol of poLines as any[]) {
            const k = pol._id.toString();
            const a =
                aggByPoLine.get(k) || {
                    covered: 0,
                    dispatched: 0,
                    received: 0,
                    lost: 0,
                    consumed: 0,
                };
            const cost = costByPoLine.get(k);
            const ordered = num(pol.qty);
            const pending = round4(ordered - a.consumed);
            // Short = physical loss that actually leaves the ORDER unfulfilled:
            // qty that left the vendor on a CLOSED POV but never arrived
            // (dispatched − received), capped at the line's still-pending qty.
            // The cap prevents an over-dispatch loss (vendor dispatched MORE
            // than ordered, the excess lost) from showing as "short" when the
            // ordered qty was fully received — that excess was never needed.
            // Under-dispatch isn't counted (those units never left the vendor;
            // the recovery POV flow surfaces them via `pending`). The raw,
            // uncapped figure is still exposed separately as `lost`.
            const short = round4(Math.min(a.lost, Math.max(0, pending)));
            const product = pol.product_id
                ? productMap.get(pol.product_id.toString())
                : null;

            const invoiced = invoicedByPoLine.get(k) || 0;
            const invoiceable = Math.max(0, round4(a.dispatched - invoiced));

            // FREE stock that can cover this line's pending demand, capped by
            // the remaining shared free pool for this product.
            const pid = pol.product_id ? pol.product_id.toString() : null;
            const inStock = pid ? Math.max(0, num(onHandMap.get(pid))) : 0;
            const avail = pid ? Math.max(0, num(stockRemaining.get(pid))) : 0;
            const fromStock = round4(Math.min(Math.max(0, pending), avail));
            if (pid && fromStock > 0)
                stockRemaining.set(pid, round4(avail - fromStock));

            // Net out the free stock that covers this line: what's still left
            // to procure (pending) and still short after pulling from stock.
            // Fully covered from free stock → both read 0.
            const pendingNet = Math.max(0, round4(pending - fromStock));
            const shortNet = Math.max(0, round4(short - fromStock));

            // Weighted-average vendor rate actually ordered for this line
            // across non-cancelled POVs; null when no POV covers it yet.
            const soRate = num(pol.unit_price);
            const vendorRate =
                cost && cost.qty > 0 ? cost.value / cost.qty : null;

            lines.push({
                purchase_order_line_id: k,
                vendor_id: pol.vendor_id?.toString(),
                product_id: pol.product_id?.toString(),
                product_name: (product as any)?.name,
                product_code: (product as any)?.code,
                part_no: pol.part_no || (product as any)?.part_no || undefined,
                hsn_code: pol.hsn_code || undefined,
                unit: pol.unit || undefined,
                // Same precedence the POV PDF uses: the PO line's snapshot
                // first, product master as fallback. Anything else would let the
                // live preview and the printed GST disagree.
                tax_pct: String(
                    Number(pol.tax_pct) || Number((product as any)?.tax_pct) || 0
                ),
                ordered: String(round4(ordered)),
                covered: String(round4(a.covered)),
                dispatched: String(round4(a.dispatched)),
                received: String(round4(a.received)),
                lost: String(round4(a.lost)),
                short: String(shortNet),
                pending: String(pendingNet),
                invoiced: String(round4(invoiced)),
                invoiceable: String(invoiceable),
                in_stock: String(round4(inStock)),
                from_stock: String(fromStock),
                // ── Cost variance (client #3, option C) ──
                // The SO line's rate is the COST this order was costed at
                // (margin sits on top of it). When a vendor revises their rate
                // on the POV, the two diverge — surfaced here rather than
                // silently rewriting the customer-facing SO line.
                so_unit_price: String(round4(soRate)),
                vendor_unit_price:
                    vendorRate == null ? undefined : String(round4(vendorRate)),
                cost_variance:
                    vendorRate == null
                        ? undefined
                        : String(round4(vendorRate - soRate)),
                cost_variance_total:
                    vendorRate == null
                        ? undefined
                        : String(
                              round4((vendorRate - soRate) * (cost?.qty || 0))
                          ),
            });

            totOrd += ordered;
            totCov += a.covered;
            totDis += a.dispatched;
            totRec += a.received;
            totLost += a.lost;
            totShort += shortNet;
            totPend += pendingNet;
            totInv += invoiced;
            totInvoiceable += invoiceable;
            totFromStock += fromStock;
        }

        totals.ordered = String(round4(totOrd));
        totals.covered = String(round4(totCov));
        totals.dispatched = String(round4(totDis));
        totals.received = String(round4(totRec));
        totals.lost = String(round4(totLost));
        totals.short = String(round4(totShort));
        totals.pending = String(round4(totPend));
        totals.invoiced = String(round4(totInv));
        totals.invoiceable = String(round4(totInvoiceable));
        totals.from_stock = String(round4(totFromStock));

        return {
            purchase_order_id: purchaseOrderId,
            purchase_order_voucher_no: po.voucher_no,
            status: po.status,
            // `has_pending` gates the "Create POV" button. Re-opens on:
            //  - a POV cancel (lines released)
            //  - a CLOSED POV with short receipt (shortfall released for
            //    damaged / lost recovery)
            //  - a new PO line added post-PO-creation that has no POV
            has_pending: totPend > 1e-6,
            lines,
            totals,
        };
    }
}

// ─── Module-private utilities ───────────────────────────────────────────

function unique(arr: (string | undefined)[]): string[] {
    return Array.from(
        new Set(arr.filter((v): v is string => typeof v === 'string' && !!v))
    );
}

function toMap<T extends { _id: any }>(arr: T[]): Map<string, T> {
    const m = new Map<string, T>();
    for (const item of arr) {
        const k = item._id?.toString();
        if (k) m.set(k, item);
    }
    return m;
}
