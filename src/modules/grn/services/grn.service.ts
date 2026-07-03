import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { In } from 'typeorm';
import { GrnRepository } from '../repository/repositories/grn.repository';
import { GrnLineRepository } from '../repository/repositories/grn-line.repository';
import { DebitNoteRepository } from '../repository/repositories/debit-note.repository';
import { ENUM_DEBIT_NOTE_STATUS } from '../enums/debit-note.enum';
import { GrnDoc } from '../repository/entities/grn.entity';
import { ENUM_GRN_STATUS } from '../enums/grn.enum';
import { DependencyCheckService } from '@modules/dependency-check/dependency-check.service';
import {
    GrnCreateFromPovDto,
    GrnUpdateDto,
} from '../dtos/request/grn.request.dto';
import {
    GrnGetResponseDto,
    GrnListResponseDto,
    GrnSourcePovResponseDto,
    GrnStatsResponseDto,
} from '../dtos/response/grn.response.dto';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { PdfService } from '@common/pdf/pdf.service';
import {
    buildPdfLetterhead,
    buildPdfHeaderTemplate,
    buildPdfFooterTemplate,
    loadCompanyLogoDataUri,
} from '@common/pdf/pdf-letterhead.util';
import { PoVendorTrackingEventRepository } from '@modules/tracking-event/repository/repositories/po-vendor-tracking-event.repository';
import { ENUM_TRACKING_EVENT_TYPE } from '@modules/tracking-event/enums/tracking-event.enum';
import { StockLedgerService } from '@modules/inventory/services/stock-ledger.service';
import { ENUM_STOCK_MOVEMENT_TYPE } from '@modules/inventory/enums/stock-movement.enum';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class GrnService {
    private readonly logger = new Logger(GrnService.name);

    constructor(
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly debitNoteRepository: DebitNoteRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly productRepository: ProductRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companySettingsRepository: CompanySettingsRepository,
        private readonly voucherService: VoucherService,
        private readonly pdfService: PdfService,
        private readonly trackingEventRepository: PoVendorTrackingEventRepository,
        private readonly stockLedger: StockLedgerService,
        private readonly dependencyCheckService: DependencyCheckService
    ) {}

    /**
     * Delete policy: block if any Debit-Note references this GRN; otherwise
     * only a DRAFT may be deleted (a confirmed GRN must be cancelled), and it
     * is HARD-deleted with its lines. A draft GRN still counts toward the POV's
     * received qty, so recompute the POV after removal (no stock reversal —
     * only confirmed GRNs post stock). `softDelete` above stays for internal use.
     */
    async deleteWithGuard(companyId: string, grnId: string): Promise<void> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        await this.dependencyCheckService.assertNoDependents('grn', grnId, 'GRN');
        if (grn.status !== ENUM_GRN_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only a draft GRN can be deleted. Cancel it instead.'
            );
        }
        const povId = grn.po_vendor_id ? grn.po_vendor_id.toString() : null;
        await this.grnLineRepository.deleteMany({ grn_id: grnId } as any);
        await this.grnRepository.delete({ _id: grnId } as any);
        if (povId) {
            await this.recomputePovFromGrns(companyId, povId);
        }
    }

    /**
     * Emit a system tracking event onto a POV's timeline. Best-effort — a
     * failure here never breaks the GRN action that triggered it.
     */
    private async emitPovEvent(
        companyId: string,
        povId: string,
        eventType: ENUM_TRACKING_EVENT_TYPE,
        userId?: string,
        notes?: string
    ): Promise<void> {
        if (!povId || !userId) return;
        try {
            await this.trackingEventRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                event_at: new Date(),
                event_type: eventType,
                location: null,
                notes: notes || null,
                is_post_closure: false,
                is_system: true,
                created_by: userId,
            } as any);
        } catch (err) {
            this.logger.warn(
                `emitPovEvent(${eventType}) failed for POV ${povId}: ${
                    (err as any)?.message || err
                }`
            );
        }
    }

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company: any = await this.companyRepository.findOneById(companyId);
        const explicit = company?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        return (
            company?.company_name
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO'
        );
    }

    private async getOrThrow(companyId: string, id: string): Promise<GrnDoc> {
        const grn: any = await this.grnRepository.findOne({
            _id: id,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!grn) throw new NotFoundException('GRN not found');
        return grn;
    }

    // ─── Create from a dispatched POV ────────────────────────────────────
    // A GRN receives goods against a DISPATCHED Vendor PO. Multiple GRNs are
    // allowed per POV (partial deliveries) — each new GRN seeds the qty still
    // to be received = dispatched − Σ(received on other non-cancelled GRNs).
    async createFromPov(
        companyId: string,
        povId: string,
        dto: GrnCreateFromPovDto,
        createdBy: string
    ): Promise<GrnDoc> {
        const pov: any = await this.povRepository.findOne({
            _id: povId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pov) throw new NotFoundException('Vendor PO not found');
        if (
            pov.status !== ENUM_PO_VENDOR_STATUS.DISPATCHED &&
            pov.status !== ENUM_PO_VENDOR_STATUS.CLOSED
        ) {
            throw new BadRequestException(
                'A GRN can only be raised against a dispatched Vendor PO.'
            );
        }

        const povLines = (await this.povLineRepository.findAll({
            po_vendor_id: povId,
        } as any)) as any[];

        // Qty already received on other (non-cancelled) GRNs for this POV.
        const otherReceived = await this.receivedByPovLineExcluding(
            companyId,
            povId,
            null
        );
        // Lines that still have something left to receive.
        const pendingLines = povLines
            .map((l) => {
                const dispatched = round4(num(l.dispatched_qty));
                const already = round4(otherReceived.get(l._id.toString()) || 0);
                const remaining = round4(dispatched - already);
                return { l, remaining };
            })
            .filter((x) => x.remaining > 1e-6);
        if (!pendingLines.length) {
            throw new BadRequestException(
                'This Vendor PO is fully received — nothing left to receipt.'
            );
        }

        // Reference-chain snapshot: POV → PO.
        const po: any = pov.purchase_order_id
            ? await this.poRepository.findOneById(
                  pov.purchase_order_id.toString()
              )
            : null;

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.GRN,
            prefix
        );

        const grn = await this.grnRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            po_vendor_id: povId,
            po_vendor_voucher_no: pov.voucher_no || null,
            purchase_order_id: pov.purchase_order_id || null,
            purchase_order_voucher_no: po?.voucher_no || null,
            customer_po_number: po?.customer_po_number || null,
            vendor_id: pov.vendor_id || null,
            grn_date:
                dto.grn_date ||
                pov.actual_arrival_date ||
                new Date().toISOString().slice(0, 10),
            notes: dto.notes || null,
            status: ENUM_GRN_STATUS.DRAFT,
        } as any);
        const grnId = grn._id.toString();

        let seq = 0;
        for (const { l, remaining } of pendingLines.sort(
            (a, b) => (a.l.seq || 0) - (b.l.seq || 0)
        )) {
            seq += 1;
            await this.grnLineRepository.create({
                company_id: companyId,
                grn_id: grnId,
                po_vendor_line_id: l._id?.toString() || null,
                product_id: l.product_id,
                description: l.description || null,
                part_no: l.part_no || null,
                hsn_code: l.hsn_code || null,
                unit: l.unit || null,
                ordered_qty: String(round4(num(l.ordered_qty))),
                dispatched_qty: String(round4(num(l.dispatched_qty))),
                // Default: receive the full remaining, all accepted; operator
                // adjusts received / accepted / rejected before confirming.
                received_qty: String(remaining),
                accepted_qty: String(remaining),
                rejected_qty: '0',
                seq,
            } as any);
        }

        this.logger.log(`GRN ${voucher_no} created from POV ${povId}`);
        return this.grnRepository.findOneById(grnId);
    }

    // ─── Update (quality check + header) ─────────────────────────────────
    async update(
        companyId: string,
        grnId: string,
        dto: GrnUpdateDto,
        userId?: string
    ): Promise<GrnDoc> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        const prevStatus = grn.status;
        const povId = grn.po_vendor_id?.toString();

        if (dto.grn_date !== undefined) grn.grn_date = dto.grn_date;
        if (dto.notes !== undefined) grn.notes = dto.notes;
        if (dto.internal_notes !== undefined)
            grn.internal_notes = dto.internal_notes;
        if (dto.status !== undefined) grn.status = dto.status;
        await this.grnRepository.save(grn);

        if (Array.isArray(dto.lines) && dto.lines.length) {
            const lines = await this.grnLineRepository.findByGrnId(grnId);
            // Received on the OTHER non-cancelled GRNs of this POV — so the
            // edited received qty can't push the POV over its dispatched qty.
            const otherReceived = await this.receivedByPovLineExcluding(
                companyId,
                povId,
                grnId
            );
            const byId = new Map<string, any>(
                lines.map((l: any) => [l._id.toString(), l])
            );
            for (const item of dto.lines) {
                const row = byId.get(item._id);
                if (!row) continue;
                const dispatched = round4(num(row.dispatched_qty));
                const other = round4(
                    otherReceived.get(row.po_vendor_line_id?.toString()) || 0
                );
                const received =
                    item.received_qty !== undefined
                        ? round4(num(item.received_qty))
                        : round4(num(row.received_qty));
                if (received < 0) {
                    throw new BadRequestException(
                        'Received quantity cannot be negative.'
                    );
                }
                if (round4(received + other) > round4(dispatched) + 1e-6) {
                    throw new BadRequestException(
                        `Received (${received}) + already received on other GRNs (${other}) exceeds dispatched (${dispatched}) on a line.`
                    );
                }
                let accepted =
                    item.accepted_qty !== undefined
                        ? round4(num(item.accepted_qty))
                        : round4(num(row.accepted_qty));
                let rejected =
                    item.rejected_qty !== undefined
                        ? round4(num(item.rejected_qty))
                        : round4(num(row.rejected_qty));
                if (accepted < 0 || rejected < 0) {
                    throw new BadRequestException(
                        'Accepted / rejected quantities cannot be negative.'
                    );
                }
                if (round4(accepted + rejected) > round4(received) + 1e-6) {
                    throw new BadRequestException(
                        `Accepted + rejected (${accepted + rejected}) exceeds received (${received}) on a line.`
                    );
                }
                row.received_qty = String(received);
                row.accepted_qty = String(accepted);
                row.rejected_qty = String(rejected);
                if (item.batch_no !== undefined) row.batch_no = item.batch_no;
                if (item.remarks !== undefined) row.remarks = item.remarks;
                await this.grnLineRepository.save(row);
            }
        }

        // Any GRN edit (draft save, confirm, or cancel) can change the POV's
        // received qty → roll it into the POV (and close / re-open it).
        // recompute counts draft + confirmed receipts, so a saved draft already
        // shows on the POV Line Items tab.
        if (povId) {
            await this.recomputePovFromGrns(companyId, povId);
        }

        // ── Stock ledger (Goods In) ──────────────────────────────────────
        // Keep the stock ledger in lock-step with the GRN's CONFIRMED receipt.
        // A confirm (or an accepted-qty edit while confirmed) reverses any prior
        // grn_in rows for this GRN and re-posts from the current accepted qty;
        // leaving CONFIRMED (cancel / back to draft) reverses them out.
        const linesChanged = Array.isArray(dto.lines) && dto.lines.length > 0;
        const isConfirmed = grn.status === ENUM_GRN_STATUS.CONFIRMED;
        const newlyConfirmed =
            isConfirmed && prevStatus !== ENUM_GRN_STATUS.CONFIRMED;
        const leftConfirmed =
            prevStatus === ENUM_GRN_STATUS.CONFIRMED && !isConfirmed;
        try {
            if (isConfirmed && (newlyConfirmed || linesChanged)) {
                await this.stockLedger.reverse(
                    companyId,
                    'grn',
                    grnId,
                    ENUM_STOCK_MOVEMENT_TYPE.GRN_REVERSAL,
                    'resync on confirm/edit',
                    userId
                );
                const locationId = povId
                    ? (await this.povRepository.findOneById(povId) as any)
                          ?.delivery_address_id || null
                    : null;
                const ledgerLines = await this.grnLineRepository.findByGrnId(grnId);
                for (const l of ledgerLines as any[]) {
                    const acceptedQty = round4(num(l.accepted_qty));
                    if (acceptedQty > 0) {
                        await this.stockLedger.post(companyId, {
                            product_id: l.product_id,
                            location_id: locationId,
                            qty: acceptedQty,
                            movement_type: ENUM_STOCK_MOVEMENT_TYPE.GRN_IN,
                            source_type: 'grn',
                            source_id: grnId,
                            source_line_id: l._id.toString(),
                            source_voucher_no: grn.voucher_no,
                            created_by: userId,
                        });
                    }
                }
            } else if (leftConfirmed) {
                await this.stockLedger.reverse(
                    companyId,
                    'grn',
                    grnId,
                    ENUM_STOCK_MOVEMENT_TYPE.GRN_REVERSAL,
                    'GRN no longer confirmed',
                    userId
                );
            }
        } catch (e: any) {
            this.logger.error(
                `[GRN ${grnId}] stock ledger sync failed: ${e?.message}`
            );
        }

        // Surface only the confirm / un-confirm transition on the POV timeline.
        const crossesConfirm =
            dto.status !== undefined &&
            dto.status !== prevStatus &&
            (dto.status === ENUM_GRN_STATUS.CONFIRMED ||
                prevStatus === ENUM_GRN_STATUS.CONFIRMED);
        if (povId && crossesConfirm) {
            // Surface the GRN lifecycle change on the parent POV's timeline.
            if (dto.status === ENUM_GRN_STATUS.CONFIRMED) {
                const glines = await this.grnLineRepository.findByGrnId(grnId);
                let acc = 0;
                let rej = 0;
                for (const l of glines as any[]) {
                    acc += num(l.accepted_qty);
                    rej += num(l.rejected_qty);
                }
                // "Received" = the good (accepted) qty, matching the UI.
                const bits = [`received ${round4(acc)}`];
                if (rej > 1e-6) bits.push(`rejected ${round4(rej)}`);
                await this.emitPovEvent(
                    companyId,
                    povId,
                    ENUM_TRACKING_EVENT_TYPE.GRN_CONFIRMED,
                    userId,
                    `GRN ${grn.voucher_no || grnId} confirmed — ${bits.join(', ')}.`
                );
            } else if (prevStatus === ENUM_GRN_STATUS.CONFIRMED) {
                await this.emitPovEvent(
                    companyId,
                    povId,
                    ENUM_TRACKING_EVENT_TYPE.GRN_CANCELLED,
                    userId,
                    `GRN ${grn.voucher_no || grnId} cancelled — its receipt was rolled back from the POV.`
                );
            }
        }

        return this.grnRepository.findOneById(grnId);
    }

    /**
     * Sum received_qty per POV line across this POV's non-cancelled GRNs,
     * optionally excluding one GRN (when re-validating that GRN's own edit).
     */
    private async receivedByPovLineExcluding(
        companyId: string,
        povId: string | null,
        excludeGrnId: string | null
    ): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        if (!povId) return out;
        const grns = (await this.grnRepository.findAll({
            po_vendor_id: povId,
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const grnIds = grns
            .filter(
                (g) =>
                    g.status !== ENUM_GRN_STATUS.CANCELLED &&
                    g._id.toString() !== excludeGrnId
            )
            .map((g) => g._id.toString());
        if (!grnIds.length) return out;
        const glines = (await this.grnLineRepository.findAll({
            grn_id: { $in: grnIds },
        } as any)) as any[];
        for (const gl of glines) {
            const k = gl.po_vendor_line_id?.toString();
            if (!k) continue;
            out.set(k, round4((out.get(k) || 0) + num(gl.received_qty)));
        }
        return out;
    }

    /**
     * Recompute a POV's per-line received_qty from the sum of its CONFIRMED
     * GRNs, then close the POV when every dispatched qty is fully received
     * (or re-open it to dispatched if a confirmed GRN was later cancelled).
     */
    private async recomputePovFromGrns(
        companyId: string,
        povId: string
    ): Promise<void> {
        const pov: any = await this.povRepository.findOne({
            _id: povId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pov) return;

        // All non-cancelled GRNs (draft + confirmed). Draft receipts already
        // update the POV line (so the Line Items tab reflects a saved GRN
        // immediately); only CONFIRMED receipts decide when the POV closes.
        const grns = (
            (await this.grnRepository.findAll({
                po_vendor_id: povId,
                company_id: companyId,
                soft_delete: false,
            } as any)) as any[]
        ).filter((g) => g.status !== ENUM_GRN_STATUS.CANCELLED);
        const confirmedIds = new Set(
            grns
                .filter((g) => g.status === ENUM_GRN_STATUS.CONFIRMED)
                .map((g) => g._id.toString())
        );
        const grnIds = grns.map((g) => g._id.toString());
        const glines = grnIds.length
            ? ((await this.grnLineRepository.findAll({
                  grn_id: { $in: grnIds },
              } as any)) as any[])
            : [];

        // received_qty on the POV line = good (accepted) qty across all
        // non-cancelled GRNs, so it matches the GRN tab's "Received". A POV
        // line is "accounted" (and the POV closes) once its CONFIRMED receipts
        // cover the dispatch as good + rejected (rejected → Debit Note).
        const goodByPovLine = new Map<string, number>();
        const accountedByPovLine = new Map<string, number>();
        for (const gl of glines) {
            const k = gl.po_vendor_line_id?.toString();
            if (!k) continue;
            goodByPovLine.set(
                k,
                round4((goodByPovLine.get(k) || 0) + num(gl.accepted_qty))
            );
            if (confirmedIds.has(gl.grn_id.toString())) {
                accountedByPovLine.set(
                    k,
                    round4(
                        (accountedByPovLine.get(k) || 0) +
                            num(gl.accepted_qty) +
                            num(gl.rejected_qty)
                    )
                );
            }
        }

        const povLines = (await this.povLineRepository.findAll({
            po_vendor_id: povId,
        } as any)) as any[];
        let allFull = povLines.length > 0;
        for (const pl of povLines) {
            const dispatched = round4(num(pl.dispatched_qty));
            const good = round4(
                Math.min(goodByPovLine.get(pl._id.toString()) || 0, dispatched)
            );
            const accounted = round4(accountedByPovLine.get(pl._id.toString()) || 0);
            pl.received_qty = String(good);
            await this.povLineRepository.save(pl);
            if (accounted < dispatched - 1e-6) allFull = false;
        }

        if (allFull && pov.status === ENUM_PO_VENDOR_STATUS.DISPATCHED) {
            pov.status = ENUM_PO_VENDOR_STATUS.CLOSED;
            if (!pov.actual_arrival_date) {
                const latest = grns
                    .filter((g) => confirmedIds.has(g._id.toString()))
                    .map((g) => g.grn_date)
                    .filter(Boolean)
                    .sort()
                    .pop();
                if (latest) pov.actual_arrival_date = latest;
            }
            await this.povRepository.save(pov);
        } else if (!allFull && pov.status === ENUM_PO_VENDOR_STATUS.CLOSED) {
            pov.status = ENUM_PO_VENDOR_STATUS.DISPATCHED;
            await this.povRepository.save(pov);
        }
    }

    async softDelete(
        companyId: string,
        grnId: string,
        userId?: string
    ): Promise<void> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        const povId = grn.po_vendor_id ? grn.po_vendor_id.toString() : null;
        const wasConfirmed = grn.status === ENUM_GRN_STATUS.CONFIRMED;
        grn.soft_delete = true;
        await this.grnRepository.save(grn);
        // Deleting any non-cancelled GRN (draft or confirmed) un-receives its
        // quantities → recompute the POV's received qty (and reopen it if it
        // had been closed).
        if (povId) {
            await this.recomputePovFromGrns(companyId, povId);
        }
        // A confirmed GRN also posted grn_in rows into the stock ledger. Deleting
        // it must reverse those rows so on-hand / Coverage "In Stock" no longer
        // counts the un-received qty. reverse() is idempotent (only reverses
        // un-reversed original rows) and never blocks the delete.
        if (wasConfirmed) {
            try {
                await this.stockLedger.reverse(
                    companyId,
                    'grn',
                    grnId,
                    ENUM_STOCK_MOVEMENT_TYPE.GRN_REVERSAL,
                    'GRN deleted',
                    userId
                );
            } catch (e: any) {
                this.logger.error(
                    `[GRN ${grnId}] stock ledger reverse on delete failed: ${e?.message}`
                );
            }
        }
    }

    // ─── List / count / stats ────────────────────────────────────────────
    buildListFind(
        companyId: string,
        filters: {
            status?: string | string[];
            vendor_id?: string;
            po_vendor_id?: string;
            search?: string;
        }
    ): Record<string, any> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;
        if (filters.vendor_id) find.vendor_id = filters.vendor_id;
        if (filters.po_vendor_id) find.po_vendor_id = filters.po_vendor_id;
        if (filters.status) find.status = filters.status;
        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { po_vendor_voucher_no: { $regex: searchTerm, $options: 'i' } },
                {
                    purchase_order_voucher_no: {
                        $regex: searchTerm,
                        $options: 'i',
                    },
                },
            ];
        }
        return find;
    }

    async count(
        companyId: string,
        filters: {
            status?: string | string[];
            vendor_id?: string;
            po_vendor_id?: string;
            search?: string;
        }
    ): Promise<number> {
        return this.grnRepository.getTotal(
            this.buildListFind(companyId, filters) as any
        );
    }

    async list(
        companyId: string,
        options?: { find?: Record<string, any>; paging?: any; order?: any }
    ): Promise<GrnListResponseDto[]> {
        const find = options?.find || {
            company_id: companyId,
            soft_delete: false,
        };
        const rows = await this.grnRepository.findAll(find as any, {
            paging: options?.paging,
            order: options?.order,
        });
        if (!rows.length) return [];
        const ids = rows.map((r: any) => r._id.toString());
        const vendorIds = Array.from(
            new Set(
                (rows as any[]).map((r) => r.vendor_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const [lines, vendors, dnotes] = await Promise.all([
            this.grnLineRepository.findAll({
                grn_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            this.debitNoteRepository.findAll({
                grn_id: { $in: ids },
                soft_delete: false,
            } as any) as Promise<any[]>,
        ]);
        const lineCount = new Map<string, number>();
        const rejectedByGrn = new Map<string, number>();
        // "Received" shown on the GRN list = the good qty (accepted).
        const receivedByGrn = new Map<string, number>();
        for (const l of lines) {
            const k = l.grn_id.toString();
            lineCount.set(k, (lineCount.get(k) || 0) + 1);
            rejectedByGrn.set(k, (rejectedByGrn.get(k) || 0) + num(l.rejected_qty));
            receivedByGrn.set(k, (receivedByGrn.get(k) || 0) + num(l.accepted_qty));
        }
        // Active (non-cancelled) Debit Note per GRN — one per GRN by design.
        const activeDnByGrn = new Map<string, string>();
        for (const d of dnotes) {
            if (d.status !== ENUM_DEBIT_NOTE_STATUS.CANCELLED) {
                activeDnByGrn.set(d.grn_id.toString(), d._id.toString());
            }
        }
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
        );
        return rows.map((r: any) => {
            const dto = plainToInstance(GrnListResponseDto, r);
            const k = r._id.toString();
            dto.line_count = lineCount.get(k) || 0;
            dto.received_qty = String(round4(receivedByGrn.get(k) || 0));
            dto.rejected_qty = String(round4(rejectedByGrn.get(k) || 0));
            const dnId = activeDnByGrn.get(k);
            dto.debit_note_id = dnId || undefined;
            dto.has_debit_note = !!dnId;
            dto.vendor_name = r.vendor_id
                ? vendorById.get(r.vendor_id.toString())?.company_name
                : undefined;
            return dto;
        });
    }

    async stats(
        companyId: string,
        filters: { status?: string | string[]; vendor_id?: string; search?: string }
    ): Promise<GrnStatsResponseDto> {
        const rows = await this.grnRepository.aggregate<{
            status: string;
            count: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            if (filters.vendor_id) {
                qb.andWhere('entity.vendor_id = :vid', { vid: filters.vendor_id });
            }
            if (filters.status) {
                if (Array.isArray(filters.status)) {
                    qb.andWhere('entity.status IN (:...st)', {
                        st: filters.status,
                    });
                } else {
                    qb.andWhere('entity.status = :st', { st: filters.status });
                }
            }
            const searchTerm =
                typeof filters.search === 'string' ? filters.search.trim() : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.po_vendor_voucher_no ILIKE :q OR entity.purchase_order_voucher_no ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .groupBy('entity.status');
        });
        const by_status: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
            const cnt = Number(r.count) || 0;
            by_status[r.status] = cnt;
            total += cnt;
        }
        return { total, by_status };
    }

    // ─── Source-POV picker (dispatched POVs with qty still to receive) ───
    async sourcePovs(companyId: string): Promise<GrnSourcePovResponseDto[]> {
        const povs = (await this.povRepository.findAll({
            company_id: companyId,
            status: ENUM_PO_VENDOR_STATUS.DISPATCHED,
            soft_delete: false,
        } as any)) as any[];
        if (!povs.length) return [];

        const candidates = povs;
        const povIds = candidates.map((p) => p._id.toString());
        const vendorIds = Array.from(
            new Set(candidates.map((p) => p.vendor_id?.toString()).filter(Boolean))
        ) as string[];
        const poIds = Array.from(
            new Set(
                candidates
                    .map((p) => p.purchase_order_id?.toString())
                    .filter(Boolean)
            )
        ) as string[];
        // Received-so-far per POV line across non-cancelled GRNs, so we only
        // surface POVs that still have dispatched qty left to receipt.
        const grns = (await this.grnRepository.findAll({
            po_vendor_id: { $in: povIds },
            company_id: companyId,
            soft_delete: false,
        } as any)) as any[];
        const liveGrnIds = grns
            .filter((g) => g.status !== ENUM_GRN_STATUS.CANCELLED)
            .map((g) => g._id.toString());
        const grnLines = liveGrnIds.length
            ? ((await this.grnLineRepository.findAll({
                  grn_id: { $in: liveGrnIds },
              } as any)) as any[])
            : [];
        const receivedByPovLine = new Map<string, number>();
        for (const gl of grnLines) {
            const k = gl.po_vendor_line_id?.toString();
            if (!k) continue;
            receivedByPovLine.set(
                k,
                round4((receivedByPovLine.get(k) || 0) + num(gl.received_qty))
            );
        }
        const [lines, vendors, pos] = await Promise.all([
            this.povLineRepository.findAll({
                po_vendor_id: { $in: povIds },
            } as any) as Promise<any[]>,
            vendorIds.length
                ? (this.vendorRepository.findAll({
                      _id: In(vendorIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            poIds.length
                ? (this.poRepository.findAll({
                      _id: In(poIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        // Count POV lines that still have qty pending to receive.
        const lineCount = new Map<string, number>();
        for (const l of lines) {
            const pending = round4(
                num(l.dispatched_qty) -
                    (receivedByPovLine.get(l._id.toString()) || 0)
            );
            if (pending > 1e-6)
                lineCount.set(
                    l.po_vendor_id.toString(),
                    (lineCount.get(l.po_vendor_id.toString()) || 0) + 1
                );
        }
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
        );
        const poById = new Map<string, any>(
            pos.map((p: any) => [p._id.toString(), p])
        );
        return candidates
            .filter((p) => (lineCount.get(p._id.toString()) || 0) > 0)
            .map((p) => ({
                _id: p._id.toString(),
                voucher_no: p.voucher_no,
                vendor_id: p.vendor_id?.toString(),
                vendor_name: p.vendor_id
                    ? vendorById.get(p.vendor_id.toString())?.company_name
                    : undefined,
                purchase_order_voucher_no: p.purchase_order_id
                    ? poById.get(p.purchase_order_id.toString())?.voucher_no
                    : undefined,
                actual_arrival_date: p.actual_arrival_date,
                line_count: lineCount.get(p._id.toString()) || 0,
            }));
    }

    // ─── Map ─────────────────────────────────────────────────────────────
    async mapGet(companyId: string, grnId: string): Promise<GrnGetResponseDto> {
        const grn: any = await this.getOrThrow(companyId, grnId);
        const lines = (await this.grnLineRepository.findByGrnId(grnId)) as any[];

        const productIds = Array.from(
            new Set(lines.map((l) => l.product_id?.toString()).filter(Boolean))
        ) as string[];
        const [products, vendor] = await Promise.all([
            productIds.length
                ? (this.productRepository.findAll({
                      _id: In(productIds),
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            grn.vendor_id
                ? this.vendorRepository.findOneById(grn.vendor_id.toString())
                : Promise.resolve(null),
        ]);
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        const dto = plainToInstance(GrnGetResponseDto, grn);
        dto.vendor_name = (vendor as any)?.company_name;
        dto.vendor_code = (vendor as any)?.vendor_code;
        dto.lines = lines.map((l) => {
            const prod = l.product_id
                ? productById.get(l.product_id.toString())
                : null;
            return {
                _id: l._id.toString(),
                po_vendor_line_id: l.po_vendor_line_id?.toString(),
                product_id: l.product_id?.toString(),
                product_name: prod?.name,
                product_code: prod?.code,
                description: l.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                part_no: l.part_no || prod?.part_no,
                unit: l.unit,
                ordered_qty: l.ordered_qty,
                dispatched_qty: l.dispatched_qty,
                received_qty: l.received_qty,
                accepted_qty: l.accepted_qty,
                rejected_qty: l.rejected_qty,
                batch_no: l.batch_no,
                remarks: l.remarks,
                seq: l.seq,
            };
        });
        return dto;
    }

    // ─── PDF ─────────────────────────────────────────────────────────────
    async generatePdf(
        companyId: string,
        grnId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const data = await this.mapGet(companyId, grnId);
        const company: any = await this.companyRepository.findOneById(companyId);

        // Letterhead logo — from company-settings (same source as the other
        // sales/purchase PDFs), falling back to the bundled brand logo.
        let logoDataUri = '';
        try {
            const settingsRows: any[] =
                await this.companySettingsRepository.findAll({
                    company_id: companyId,
                } as any);
            const setting =
                (settingsRows || []).find((r) => !r.location_id) ||
                (settingsRows || [])[0];
            logoDataUri = loadCompanyLogoDataUri(setting?.logo_url);
        } catch {
            logoDataUri = loadCompanyLogoDataUri();
        }

        // GSTIN — prefer the corporate address, fall back to tax number.
        let gstin = company?.tax_number || '';
        try {
            const addresses =
                await this.companyAddressRepository.findByCompanyId(companyId);
            const corp: any =
                (addresses || []).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a: any) => a.type === 'corporate') ||
                (addresses || []).find((a: any) => a.is_default) ||
                (addresses || [])[0];
            gstin = corp?.gstin || company?.tax_number || '';
        } catch {
            /* graceful */
        }

        const idLine = [
            gstin ? `GSTIN: ${gstin}` : '',
            company?.pan ? `PAN: ${company.pan}` : '',
            company?.cin ? `CIN: ${company.cin}` : '',
            company?.iec ? `IEC: ${company.iec}` : '',
            company?.website || '',
        ]
            .filter(Boolean)
            .join('  ·  ');

        const html = this.renderHtml(data, company, logoDataUri);
        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: {
                top: '18mm',
                right: '12mm',
                bottom: '18mm',
                left: '12mm',
            },
            displayHeaderFooter: true,
            headerTemplate: buildPdfHeaderTemplate({
                companyName: company?.company_name,
                docLabel: 'GOODS RECEIPT NOTE',
                voucherNo: data.voucher_no,
            }),
            footerTemplate: buildPdfFooterTemplate({
                voucherNo: data.voucher_no,
                addressLine: company?.footer_address || '',
                idLine,
            }),
        });
        const safe = (data.voucher_no || grnId).replace(/[^A-Za-z0-9_-]+/g, '_');
        return { buffer, filename: `GRN-${safe}.pdf` };
    }

    /** Generate the PDF from the GRN id alone — resolves the company from the
     *  GRN row. Used by the no-auth public ticket route (new-tab open). */
    async generatePdfById(
        grnId: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const row: any = await this.grnRepository.findOneById(grnId);
        if (!row) throw new NotFoundException('GRN not found');
        return this.generatePdf(row.company_id.toString(), grnId);
    }

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private renderHtml(
        grn: GrnGetResponseDto,
        company: any,
        logoDataUri = ''
    ): string {
        // Shared letterhead — logo + company identity in the header; address
        // + tax IDs print in the footer (via the running footer template).
        const letterhead = buildPdfLetterhead(
            {
                logoDataUri,
                name: company?.company_name,
                phone: company?.mobile,
                email: company?.email,
            },
            {
                title: 'Goods Receipt Note',
                voucherNo: grn.voucher_no || '-',
                statusBadge: (grn as any).status || '',
            }
        );
        const rows = grn.lines
            .map(
                (l, i) => `<tr>
                <td>${i + 1}</td>
                <td>${this.esc(l.product_name || l.product_code || '-')}${
                    l.description
                        ? `<br/><small style="color:#666">${this.esc(l.description)}</small>`
                        : ''
                }</td>
                <td>${this.esc(l.part_no || '-')}</td>
                <td>${this.esc(l.hsn_code || '-')}</td>
                <td style="text-align:right">${num(l.accepted_qty).toFixed(2)} ${this.esc(l.unit || '')}</td>
                <td style="text-align:right">${num(l.rejected_qty).toFixed(2)}</td>
                <td>${this.esc(l.batch_no || '')}</td>
                <td>${this.esc(l.remarks || '')}</td>
            </tr>`
            )
            .join('');
        return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;}
          h1{font-size:18px;color:#09418B;margin:0 0 2px;}
          table{width:100%;border-collapse:collapse;margin-top:10px;}
          th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top;}
          th{background:#f4f5f7;}
          .muted{color:#666;}
        </style></head><body>
          ${letterhead}
          <div style="margin-top:8px">
            <strong>GRN No:</strong> ${this.esc(grn.voucher_no || '-')} &nbsp;
            <strong>Date:</strong> ${this.esc(grn.grn_date || '-')}<br/>
            <strong>Vendor:</strong> ${this.esc(grn.vendor_name || '-')}<br/>
            <strong>VPO:</strong> ${this.esc(grn.po_vendor_voucher_no || '-')} &nbsp;
            <strong>SO:</strong> ${this.esc(grn.purchase_order_voucher_no || '-')} &nbsp;
            <strong>Customer PO:</strong> ${this.esc(grn.customer_po_number || '-')}
          </div>
          <table>
            <thead><tr>
              <th>#</th><th>Item</th><th>Part No</th><th>HSN</th><th>Received</th>
              <th>Rejected</th><th>Batch</th><th>Remarks</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          ${grn.notes ? `<p class="muted"><strong>Notes:</strong> ${this.esc(grn.notes)}</p>` : ''}
        </body></html>`;
    }
}
