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
        private readonly productRepository: ProductRepository
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
        const aggByPoLine = new Map<
            string,
            {
                covered: number;
                dispatched: number;
                received: number;
                lost: number;
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
                };
            cur.covered += num(pl.ordered_qty);
            cur.dispatched += num(pl.dispatched_qty);
            cur.received += num(pl.received_qty);
            // Loss is only booked on closed POVs (§19.6).
            if (closedPovIds.has(pl.po_vendor_id?.toString())) {
                cur.lost += num(pl.dispatched_qty) - num(pl.received_qty);
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

        // ── Build per-line response ────────────────────────────────────
        const lines: PoCoverageLineDto[] = [];
        const totals: PoCoverageTotalsDto = {
            ordered: '0',
            covered: '0',
            dispatched: '0',
            received: '0',
            lost: '0',
            pending: '0',
        };
        let totOrd = 0,
            totCov = 0,
            totDis = 0,
            totRec = 0,
            totLost = 0,
            totPend = 0,
            totUncov = 0;

        for (const pol of poLines as any[]) {
            const k = pol._id.toString();
            const a =
                aggByPoLine.get(k) || {
                    covered: 0,
                    dispatched: 0,
                    received: 0,
                    lost: 0,
                };
            const ordered = num(pol.qty);
            // "Pending" is what the vendor still owes us — outstanding
            // procurement qty. Lost is permanently accounted for, so it
            // counts as closed even though never received.
            const pending = round4(ordered - a.received - a.lost);
            // "Uncovered" is the planning gap — qty with no POV yet. Used
            // internally to gate the "Create POV" button; not displayed.
            const uncovered = round4(ordered - a.covered);
            const product = pol.product_id
                ? productMap.get(pol.product_id.toString())
                : null;

            lines.push({
                purchase_order_line_id: k,
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
                pending: String(pending),
            });

            totOrd += ordered;
            totCov += a.covered;
            totDis += a.dispatched;
            totRec += a.received;
            totLost += a.lost;
            totPend += pending;
            totUncov += uncovered;
        }

        totals.ordered = String(round4(totOrd));
        totals.covered = String(round4(totCov));
        totals.dispatched = String(round4(totDis));
        totals.received = String(round4(totRec));
        totals.lost = String(round4(totLost));
        totals.pending = String(round4(totPend));

        return {
            purchase_order_id: purchaseOrderId,
            purchase_order_voucher_no: po.voucher_no,
            status: po.status,
            // `has_pending` gates the "Create POV" button — it must reflect
            // *uncovered* qty (no POV yet), not unreceived qty. A line that
            // is fully covered by an in-progress POV should NOT re-open the
            // button.
            has_pending: totUncov > 1e-6,
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
