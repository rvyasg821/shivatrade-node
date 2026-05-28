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
        private readonly invoiceRepository: InvoiceRepository
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
        };
        let totOrd = 0,
            totCov = 0,
            totDis = 0,
            totRec = 0,
            totLost = 0,
            totShort = 0,
            totPend = 0,
            totInv = 0,
            totInvoiceable = 0;

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
            const ordered = num(pol.qty);
            const pending = round4(ordered - a.consumed);
            // Short = physical loss only: qty that left the vendor on a
            // CLOSED POV but never arrived (dispatched − received). Under-
            // dispatch is NOT counted here — those units never left the
            // vendor, and the recovery POV flow makes them visible via
            // `pending` instead. Keeps the column intuitive: Short ≈ GRN
            // loss number, no historical accumulation.
            const short = round4(a.lost);
            const product = pol.product_id
                ? productMap.get(pol.product_id.toString())
                : null;

            const invoiced = invoicedByPoLine.get(k) || 0;
            const invoiceable = Math.max(0, round4(a.dispatched - invoiced));

            lines.push({
                purchase_order_line_id: k,
                vendor_id: pol.vendor_id?.toString(),
                product_id: pol.product_id?.toString(),
                product_name: (product as any)?.name,
                product_code: (product as any)?.code,
                hsn_code: pol.hsn_code || undefined,
                unit: pol.unit || undefined,
                ordered: String(round4(ordered)),
                covered: String(round4(a.covered)),
                dispatched: String(round4(a.dispatched)),
                received: String(round4(a.received)),
                lost: String(round4(a.lost)),
                short: String(short),
                pending: String(pending),
                invoiced: String(round4(invoiced)),
                invoiceable: String(invoiceable),
            });

            totOrd += ordered;
            totCov += a.covered;
            totDis += a.dispatched;
            totRec += a.received;
            totLost += a.lost;
            totShort += short;
            totPend += pending;
            totInv += invoiced;
            totInvoiceable += invoiceable;
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
