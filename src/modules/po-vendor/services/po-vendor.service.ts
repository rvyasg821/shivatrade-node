import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '../repository/repositories/po-vendor-line.repository';
import { PoVendorDoc } from '../repository/entities/po-vendor.entity';
import { ENUM_PO_VENDOR_STATUS } from '../enums/po-vendor.enum';
import { PoVendorCreateRequestDto } from '../dtos/request/po-vendor.create.request.dto';
import { PoVendorUpdateRequestDto } from '../dtos/request/po-vendor.update.request.dto';
import { PoVendorDispatchRequestDto } from '../dtos/request/po-vendor.dispatch.request.dto';
import { PoVendorReceiveRequestDto } from '../dtos/request/po-vendor.receive.request.dto';
import {
    PoVendorGetResponseDto,
    PoVendorLineResponseDto,
} from '../dtos/response/po-vendor.get.response.dto';

import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { ENUM_PURCHASE_ORDER_STATUS } from '@modules/purchase-order/enums/purchase-order.enum';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { VendorContactRepository } from '@modules/vendor/repository/repositories/vendor-contact.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { formatCompanyAddress } from '@modules/company/utils/format-address';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { formatLocationAddress } from '@modules/location/utils/format-address';
import { CurrencyService } from '@modules/currency/services/currency.service';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PoVendorService {
    private readonly logger = new Logger(PoVendorService.name);

    constructor(
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly vendorContactRepository: VendorContactRepository,
        private readonly productRepository: ProductRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly locationRepository: LocationRepository,
        private readonly currencyService: CurrencyService,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Voucher prefix ─────────────────────────────────────────────────

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company: any = await this.companyService.findOneById(companyId);
        const explicit = company?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        const fallback =
            (company?.company_name as string | undefined)
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO';
        return fallback;
    }

    // ─── Pending-qty calculator (POV plan §8 over-shipment guard) ───────

    /**
     * Returns a Map<po_line_id, pending_qty> for the given PO. Pending is
     * the PO line's ordered_qty minus the sum of `ordered_qty` across all
     * non-cancelled POVs for that line. Cancelled POVs release their
     * reservation back to pending (decision §10).
     *
     * Pass `excludePoVendorId` when computing pending for an EDIT - the
     * row being edited shouldn't count itself.
     */
    async computePendingByPoLineId(
        purchaseOrderId: string,
        excludePoVendorId?: string
    ): Promise<Map<string, number>> {
        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: purchaseOrderId,
        } as any);

        const pending = new Map<string, number>();
        for (const l of poLines as any[]) {
            pending.set(l._id.toString(), num(l.qty));
        }

        // Subtract every non-cancelled POV line's ordered_qty for this PO.
        const povs = await this.povRepository.findAll({
            purchase_order_id: purchaseOrderId,
            soft_delete: false,
        } as any);

        const activePovIds = (povs as any[])
            .filter(p => p.status !== ENUM_PO_VENDOR_STATUS.CANCELLED)
            .filter(p =>
                excludePoVendorId
                    ? p._id.toString() !== excludePoVendorId
                    : true
            )
            .map(p => p._id.toString());

        if (activePovIds.length) {
            const povLines = await this.povLineRepository.findAll({
                po_vendor_id: { $in: activePovIds },
            } as any);
            for (const pl of povLines as any[]) {
                const k = pl.purchase_order_line_id?.toString();
                if (!k) continue;
                pending.set(k, (pending.get(k) || 0) - num(pl.ordered_qty));
            }
        }

        return pending;
    }

    // ─── Status transitions (POV plan §7) ───────────────────────────────

    private assertStatusTransitionAllowed(
        from: ENUM_PO_VENDOR_STATUS,
        to: ENUM_PO_VENDOR_STATUS
    ): void {
        // draft → dispatched → closed
        // (draft | dispatched) → cancelled
        // No "Revert to Draft" - qty audit trail is immutable (§19.11).
        const map: Record<string, ENUM_PO_VENDOR_STATUS[]> = {
            [ENUM_PO_VENDOR_STATUS.DRAFT]: [
                ENUM_PO_VENDOR_STATUS.DISPATCHED,
                ENUM_PO_VENDOR_STATUS.CANCELLED,
            ],
            [ENUM_PO_VENDOR_STATUS.DISPATCHED]: [
                ENUM_PO_VENDOR_STATUS.CLOSED,
                ENUM_PO_VENDOR_STATUS.CANCELLED,
            ],
            [ENUM_PO_VENDOR_STATUS.CLOSED]: [],
            [ENUM_PO_VENDOR_STATUS.CANCELLED]: [],
        };
        const allowed = map[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition POV from ${from} to ${to}.`
            );
        }
    }

    // ─── Create from PO ─────────────────────────────────────────────────

    /**
     * Creates a POV against a PO. PO must be `confirmed` or `in_process`
     * (POV plan §2: "After a Purchase Order is confirmed, Shivatrade
     * tracks fulfillment... one PO can spawn many POVs over its life").
     * Enforces the over-shipment guard (§8).
     */
    async createFromPo(
        companyId: string,
        purchaseOrderId: string,
        data: PoVendorCreateRequestDto,
        createdBy: string
    ): Promise<PoVendorDoc> {
        const po: any = await this.poRepository.findOne({
            _id: purchaseOrderId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!po) throw new NotFoundException('Source PO not found');

        const allowedSourceStatuses = new Set([
            ENUM_PURCHASE_ORDER_STATUS.CONFIRMED,
            ENUM_PURCHASE_ORDER_STATUS.IN_PROCESS,
        ]);
        if (!allowedSourceStatuses.has(po.status)) {
            throw new BadRequestException(
                `Cannot create POV: PO must be confirmed or in_process (current status: ${po.status}).`
            );
        }

        // ── Load PO lines for snapshot + over-shipment guard ───────────
        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: purchaseOrderId,
        } as any);
        const poLineById = new Map<string, any>();
        for (const l of poLines as any[]) {
            poLineById.set(l._id.toString(), l);
        }

        const pending = await this.computePendingByPoLineId(purchaseOrderId);

        // ── Validate every requested line ───────────────────────────────
        for (const ln of data.lines) {
            const poLine = poLineById.get(ln.purchase_order_line_id);
            if (!poLine) {
                throw new BadRequestException(
                    `PO line ${ln.purchase_order_line_id} does not belong to PO ${po.voucher_no}.`
                );
            }
            const req = num(ln.ordered_qty);
            if (req <= 0) {
                throw new BadRequestException(
                    `Line ordered_qty must be > 0 (line ${ln.purchase_order_line_id}).`
                );
            }
            const avail = pending.get(ln.purchase_order_line_id) || 0;
            if (req > avail + 1e-6) {
                throw new BadRequestException(
                    `Cannot create POV: ordered_qty (${req}) exceeds pending (${round4(
                        avail
                    )}) for PO line ${ln.purchase_order_line_id}.`
                );
            }
        }

        // ── Build header ────────────────────────────────────────────────
        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.PO_VENDOR,
            prefix
        );

        // ── Resolve delivery address (POV plan Addendum 5) ─────────────
        // Priority:
        //   1. data.delivery_address (manual text override) - used as-is.
        //   2. data.delivery_address_id - load row, format, snapshot both.
        //   3. Inherit from PO (text + id) when neither provided.
        let delivery_address: string;
        let delivery_address_id: string | null = null;
        if (data.delivery_address && data.delivery_address.trim()) {
            delivery_address = data.delivery_address.trim();
            // Preserve the source FK when caller passes both text + id
            // (inheritance path from createPoAndPovsFromSource).
            if ((data as any).delivery_address_id) {
                delivery_address_id = (
                    data as any
                ).delivery_address_id.toString();
            }
        } else if ((data as any).delivery_address_id) {
            // Ship-to is now sourced from `locations`. Legacy
            // `company_addresses` lookup retained as fallback.
            const locId = (data as any).delivery_address_id;
            const loc: any = await this.locationRepository.findOne({
                _id: locId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (loc) {
                delivery_address = formatLocationAddress(loc);
                delivery_address_id = locId;
            } else {
                const addr: any = await this.companyAddressRepository.findOne({
                    _id: locId,
                    company_id: companyId,
                    soft_delete: false,
                } as any);
                if (!addr) {
                    throw new BadRequestException(
                        `delivery_address_id ${locId} not found in locations or company addresses.`
                    );
                }
                delivery_address = formatCompanyAddress(addr);
                delivery_address_id = locId;
            }
        } else {
            // Inherit from PO.
            delivery_address = (po.delivery_address || '').toString();
            delivery_address_id =
                po.delivery_address_id?.toString() || null;
        }
        if (!delivery_address) {
            throw new BadRequestException(
                'delivery_address is required (PO had no delivery_address and none provided).'
            );
        }

        // Vendor comes from the request body (PO is multi-vendor at line
        // level; header-level vendor_id was deprecated 2026-05-21).
        const vendorId = (data as any).vendor_id;
        if (!vendorId) {
            throw new BadRequestException('vendor_id is required.');
        }
        let vendorAddressId =
            (data as any).vendor_address_id ||
            po.vendor_address_id?.toString() ||
            null;
        // If still null, try the vendor's default bill-from address.
        if (!vendorAddressId) {
            try {
                const defaultAddr: any =
                    await this.vendorAddressRepository.findOne({
                        vendor_id: vendorId,
                        is_default: true,
                        soft_delete: false,
                    } as any);
                if (defaultAddr) vendorAddressId = defaultAddr._id?.toString();
            } catch {
                // non-fatal — leave null
            }
        }

        // Snapshot the company's home currency. POV is always in home
        // currency; storing it lets historical POVs render correctly
        // even if the company later switches base currency.
        const homeCurrency = await this.currencyService
            .getDefaultCurrency(companyId)
            .catch(() => null);
        const currency_code = homeCurrency?.code || 'INR';

        const header = await this.povRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            purchase_order_id: purchaseOrderId,
            vendor_id: vendorId,
            vendor_address_id: vendorAddressId,
            delivery_address,
            delivery_address_id,
            notes: data.notes || null,
            internal_notes: data.internal_notes || null,
            currency_code,
            exchange_rate: '1',
            status: ENUM_PO_VENDOR_STATUS.DRAFT,
        } as any);

        // ── Create lines (snapshot product/HSN/price/tax from PO line) ──
        let seq = 0;
        for (const ln of data.lines) {
            seq += 1;
            const poLine = poLineById.get(ln.purchase_order_line_id);
            const ordered = num(ln.ordered_qty);
            // Caller may override unit_price (e.g. PFI→PO flow passes the
            // vendor's INR price because the PO holds customer-currency
            // pricing). Fall back to the PO line snapshot otherwise.
            const unitPriceStr =
                (ln as any).unit_price != null && (ln as any).unit_price !== ''
                    ? String((ln as any).unit_price)
                    : String(poLine.unit_price || '0');
            const unitPrice = num(unitPriceStr);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: header._id.toString(),
                purchase_order_line_id: ln.purchase_order_line_id,
                product_id: poLine.product_id?.toString(),
                description: poLine.description || null,
                hsn_code: poLine.hsn_code || null,
                unit: poLine.unit || null,
                tax_pct: String(poLine.tax_pct || '0'),
                unit_price: unitPriceStr,
                ordered_qty: String(ordered),
                dispatched_qty: '0',
                received_qty: '0',
                line_total: String(round2(ordered * unitPrice)),
                seq: ln.seq != null ? Number(ln.seq) : seq,
            } as any);
        }

        this.logger.log(
            `POV created: ${header._id} (${voucher_no}) against PO ${po.voucher_no}`
        );
        return this.povRepository.findOneById(header._id.toString());
    }

    // ─── Read ───────────────────────────────────────────────────────────

    async findOneById(id: string): Promise<PoVendorDoc> {
        const row = await this.povRepository.findOne({
            _id: id,
            soft_delete: false,
        } as any);
        if (!row) throw new NotFoundException('POV not found');
        return row;
    }

    async list(filters: {
        companyId: string;
        purchaseOrderId?: string;
        vendorId?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
        page?: number;
        perPage?: number;
        orderBy?: string;
        orderDirection?: 'asc' | 'desc';
    }): Promise<{ rows: PoVendorDoc[]; total: number }> {
        const where: any = {
            company_id: filters.companyId,
            soft_delete: false,
        };
        if (filters.purchaseOrderId)
            where.purchase_order_id = filters.purchaseOrderId;
        if (filters.vendorId) where.vendor_id = filters.vendorId;
        if (filters.status) where.status = filters.status;
        // dateFrom/dateTo + search are intentionally handled by repository
        // helpers if needed; for Phase 2 the basic where suffices.

        const total = await this.povRepository.getTotal(where);
        const rows = await this.povRepository.findAll(where, {
            order: {
                [filters.orderBy || 'createdAt']:
                    filters.orderDirection === 'asc' ? 'ASC' : 'DESC',
            },
            ...(filters.page && filters.perPage
                ? {
                      skip: (filters.page - 1) * filters.perPage,
                      take: filters.perPage,
                  }
                : {}),
        } as any);
        return { rows, total };
    }

    // ─── Update (status-locked) ─────────────────────────────────────────

    async update(
        row: PoVendorDoc,
        data: PoVendorUpdateRequestDto
    ): Promise<PoVendorDoc> {
        const companyId = row.company_id.toString();
        const fromStatus = row.status;

        // ── Edit lock per status (POV plan §11) ─────────────────────────
        const draftEditable = new Set([
            'delivery_address',
            'delivery_address_id',
            'lines',
            'expected_arrival_date',
            'transporter_name',
            'vehicle_no',
            'lr_no',
            'lr_date',
            'eway_bill_no',
            'eway_bill_date',
            'notes',
            'internal_notes',
            'status',
        ]);
        const dispatchedEditable = new Set([
            'expected_arrival_date',
            'transporter_name',
            'vehicle_no',
            'lr_no',
            'lr_date',
            'eway_bill_no',
            'eway_bill_date',
            'notes',
            'internal_notes',
            'status',
        ]);
        const terminalEditable = new Set(['internal_notes', 'status']);

        const allowed =
            fromStatus === ENUM_PO_VENDOR_STATUS.DRAFT
                ? draftEditable
                : fromStatus === ENUM_PO_VENDOR_STATUS.DISPATCHED
                ? dispatchedEditable
                : terminalEditable;

        const incomingKeys = Object.keys(data || {}).filter(
            k => (data as any)[k] !== undefined
        );
        const blocked = incomingKeys.filter(k => !allowed.has(k));
        if (blocked.length) {
            throw new BadRequestException(
                `POV is ${fromStatus}. These fields are read-only at this status: ${blocked.join(
                    ', '
                )}.`
            );
        }

        // ── Status transition (if any) ──────────────────────────────────
        if (data.status && data.status !== fromStatus) {
            this.assertStatusTransitionAllowed(fromStatus, data.status);
        }

        // ── Re-snapshot delivery address if a new id was picked (draft) ──
        if (
            (data as any).delivery_address_id &&
            fromStatus === ENUM_PO_VENDOR_STATUS.DRAFT
        ) {
            const locId = (data as any).delivery_address_id;
            const loc: any = await this.locationRepository.findOne({
                _id: locId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (loc) {
                (data as any).delivery_address = formatLocationAddress(loc);
                (data as any).delivery_address_id = locId;
            } else {
                const addr: any = await this.companyAddressRepository.findOne({
                    _id: locId,
                    company_id: companyId,
                    soft_delete: false,
                } as any);
                if (!addr) {
                    throw new BadRequestException(
                        `delivery_address_id ${locId} not found in locations or company addresses.`
                    );
                }
                (data as any).delivery_address = formatCompanyAddress(addr);
            }
        }

        // ── Apply scalar changes ────────────────────────────────────────
        const { lines, status, ...scalar } = data as any;
        Object.assign(row, scalar);
        if (status) row.status = status;
        await this.povRepository.save(row);

        // ── Replace-on-update for lines (DRAFT only - already gated) ────
        if (Array.isArray(lines) && fromStatus === ENUM_PO_VENDOR_STATUS.DRAFT) {
            await this.replaceLinesOnDraft(
                companyId,
                row._id.toString(),
                row.purchase_order_id.toString(),
                lines
            );
        }

        this.logger.log(`POV updated: ${row._id}`);
        return this.povRepository.findOneById(row._id.toString());
    }

    private async replaceLinesOnDraft(
        companyId: string,
        povId: string,
        purchaseOrderId: string,
        lines: any[]
    ): Promise<void> {
        // Recompute pending excluding this POV (so editing its own qty
        // doesn't trip the guard against itself).
        const pending = await this.computePendingByPoLineId(
            purchaseOrderId,
            povId
        );
        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: purchaseOrderId,
        } as any);
        const poLineById = new Map<string, any>();
        for (const l of poLines as any[]) {
            poLineById.set(l._id.toString(), l);
        }

        for (const ln of lines || []) {
            if (!ln.purchase_order_line_id) {
                throw new BadRequestException(
                    'Each POV line requires purchase_order_line_id.'
                );
            }
            const poLine = poLineById.get(ln.purchase_order_line_id);
            if (!poLine) {
                throw new BadRequestException(
                    `PO line ${ln.purchase_order_line_id} does not belong to this PO.`
                );
            }
            const req = num(ln.ordered_qty);
            if (req <= 0) {
                throw new BadRequestException(
                    `Line ordered_qty must be > 0.`
                );
            }
            const avail = pending.get(ln.purchase_order_line_id) || 0;
            if (req > avail + 1e-6) {
                throw new BadRequestException(
                    `ordered_qty (${req}) exceeds pending (${round4(
                        avail
                    )}) for PO line ${ln.purchase_order_line_id}.`
                );
            }
        }

        await this.povLineRepository.deleteByPoVendorId(povId);
        let seq = 0;
        for (const ln of lines || []) {
            seq += 1;
            const poLine = poLineById.get(ln.purchase_order_line_id);
            const ordered = num(ln.ordered_qty);
            const unitPrice = num(poLine.unit_price);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                purchase_order_line_id: ln.purchase_order_line_id,
                product_id: poLine.product_id?.toString(),
                description: poLine.description || null,
                hsn_code: poLine.hsn_code || null,
                unit: poLine.unit || null,
                tax_pct: String(poLine.tax_pct || '0'),
                unit_price: String(poLine.unit_price || '0'),
                ordered_qty: String(ordered),
                dispatched_qty: '0',
                received_qty: '0',
                line_total: String(round2(ordered * unitPrice)),
                seq,
            } as any);
        }
    }

    // ─── Soft delete (DRAFT only per §10) ───────────────────────────────

    async softDelete(row: PoVendorDoc): Promise<void> {
        if (row.status !== ENUM_PO_VENDOR_STATUS.DRAFT) {
            throw new BadRequestException(
                `Only draft POVs can be deleted. Cancel non-draft POVs instead.`
            );
        }
        row.soft_delete = true;
        await this.povRepository.save(row);
        this.logger.log(`POV soft-deleted: ${row._id}`);
    }

    // ─── Action: Dispatch (POV plan §15.2) ──────────────────────────────

    /**
     * Records dispatch quantities + transport details and transitions
     * the POV from `draft` → `dispatched`. After dispatch, qty fields
     * lock; tracking fields stay editable via update() until close.
     */
    async dispatch(
        row: PoVendorDoc,
        data: PoVendorDispatchRequestDto
    ): Promise<PoVendorDoc> {
        if (row.status !== ENUM_PO_VENDOR_STATUS.DRAFT) {
            throw new BadRequestException(
                `Only draft POVs can be dispatched (current status: ${row.status}).`
            );
        }

        const lines = await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any);
        const lineById = new Map<string, any>();
        for (const l of lines as any[]) lineById.set(l._id.toString(), l);

        // Validate: every provided line belongs to this POV; dispatched
        // qty must be > 0 and ≤ ordered_qty.
        const seen = new Set<string>();
        for (const dl of data.lines) {
            const ln = lineById.get(dl._id);
            if (!ln) {
                throw new BadRequestException(
                    `Line ${dl._id} does not belong to this POV.`
                );
            }
            if (seen.has(dl._id)) {
                throw new BadRequestException(
                    `Duplicate line in dispatch payload: ${dl._id}.`
                );
            }
            seen.add(dl._id);
            const req = num(dl.dispatched_qty);
            const ordered = num(ln.ordered_qty);
            if (req < 0) {
                throw new BadRequestException(
                    `dispatched_qty cannot be negative (line ${dl._id}).`
                );
            }
            if (req > ordered + 1e-6) {
                throw new BadRequestException(
                    `dispatched_qty (${req}) exceeds ordered_qty (${round4(
                        ordered
                    )}) on line ${dl._id}.`
                );
            }
        }

        // Apply: write dispatched_qty for each line.
        for (const dl of data.lines) {
            const ln = lineById.get(dl._id);
            ln.dispatched_qty = String(round4(num(dl.dispatched_qty)));
            await this.povLineRepository.save(ln);
        }

        // Apply: header fields + status flip.
        row.dispatch_date = data.dispatch_date;
        if (data.expected_arrival_date !== undefined)
            row.expected_arrival_date = data.expected_arrival_date;
        if (data.transporter_name !== undefined)
            row.transporter_name = data.transporter_name;
        if (data.vehicle_no !== undefined) row.vehicle_no = data.vehicle_no;
        if (data.lr_no !== undefined) row.lr_no = data.lr_no;
        if (data.lr_date !== undefined) row.lr_date = data.lr_date;
        if (data.eway_bill_no !== undefined)
            row.eway_bill_no = data.eway_bill_no;
        if (data.eway_bill_date !== undefined)
            row.eway_bill_date = data.eway_bill_date;
        if (data.notes !== undefined) row.notes = data.notes;
        if (data.internal_notes !== undefined)
            row.internal_notes = data.internal_notes;
        row.status = ENUM_PO_VENDOR_STATUS.DISPATCHED;

        await this.povRepository.save(row);
        this.logger.log(`POV dispatched: ${row._id}`);
        return this.povRepository.findOneById(row._id.toString());
    }

    // ─── Action: Receive (POV plan §15.3) ───────────────────────────────

    /**
     * Records received quantities and transitions the POV
     * `dispatched` → `closed`. Follow-up POVs for any remaining qty
     * are created manually from the parent PO (industry-standard
     * flat-siblings model — SAP / Tally / Zoho).
     */
    async receive(
        row: PoVendorDoc,
        data: PoVendorReceiveRequestDto,
        // createdBy retained for signature compat with controller; unused.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _createdBy: string
    ): Promise<{ parent: PoVendorDoc }> {
        if (row.status !== ENUM_PO_VENDOR_STATUS.DISPATCHED) {
            throw new BadRequestException(
                `Only dispatched POVs can be received (current status: ${row.status}).`
            );
        }

        const lines = await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any);
        const lineById = new Map<string, any>();
        for (const l of lines as any[]) lineById.set(l._id.toString(), l);

        const seen = new Set<string>();
        for (const rl of data.lines) {
            const ln = lineById.get(rl._id);
            if (!ln) {
                throw new BadRequestException(
                    `Line ${rl._id} does not belong to this POV.`
                );
            }
            if (seen.has(rl._id)) {
                throw new BadRequestException(
                    `Duplicate line in receive payload: ${rl._id}.`
                );
            }
            seen.add(rl._id);
            const req = num(rl.received_qty);
            const dispatched = num(ln.dispatched_qty);
            if (req < 0) {
                throw new BadRequestException(
                    `received_qty cannot be negative (line ${rl._id}).`
                );
            }
            if (req > dispatched + 1e-6) {
                throw new BadRequestException(
                    `received_qty (${req}) exceeds dispatched_qty (${round4(
                        dispatched
                    )}) on line ${rl._id}. Short receipts are losses; you cannot receive more than was dispatched.`
                );
            }
        }

        // Apply: write received_qty for each line.
        for (const rl of data.lines) {
            const ln = lineById.get(rl._id);
            ln.received_qty = String(round4(num(rl.received_qty)));
            await this.povLineRepository.save(ln);
        }

        // Apply: header + status flip → closed.
        row.actual_arrival_date = data.actual_arrival_date;
        if (data.notes !== undefined) row.notes = data.notes;
        if (data.internal_notes !== undefined)
            row.internal_notes = data.internal_notes;
        row.status = ENUM_PO_VENDOR_STATUS.CLOSED;
        await this.povRepository.save(row);
        this.logger.log(`POV closed (received): ${row._id}`);

        const parent = await this.povRepository.findOneById(
            row._id.toString()
        );
        return { parent };
    }

    // ─── Action: Cancel (POV plan §15.4) ────────────────────────────────

    /**
     * Cancels a POV from `draft` or `dispatched`. Releases the
     * reservation: cancelled POVs are excluded from the pending-qty
     * calculation, so PO line pending immediately reflects the released
     * qty. Not allowed from `closed`.
     */
    async cancel(
        row: PoVendorDoc,
        reason?: string
    ): Promise<PoVendorDoc> {
        if (
            row.status !== ENUM_PO_VENDOR_STATUS.DRAFT &&
            row.status !== ENUM_PO_VENDOR_STATUS.DISPATCHED
        ) {
            throw new BadRequestException(
                `POV cannot be cancelled from status ${row.status}.`
            );
        }
        row.status = ENUM_PO_VENDOR_STATUS.CANCELLED;
        if (reason) {
            const stamp = `\n[Cancelled] ${reason}`;
            row.internal_notes = (row.internal_notes || '') + stamp;
        }
        await this.povRepository.save(row);
        this.logger.log(`POV cancelled: ${row._id}`);
        return this.povRepository.findOneById(row._id.toString());
    }

    // ─── Hydration / mappers ────────────────────────────────────────────

    async mapList(rows: PoVendorDoc[]): Promise<PoVendorGetResponseDto[]> {
        if (!rows.length) return [];

        const povIds = rows.map(r => r._id.toString());
        const poIds = unique(rows.map(r => (r as any).purchase_order_id?.toString()));
        const vendorIds = unique(rows.map(r => (r as any).vendor_id?.toString()));

        const allLines = await this.povLineRepository.findAll({
            po_vendor_id: { $in: povIds },
        } as any);

        const productIds = unique(
            (allLines as any[])
                .map(l => l.product_id?.toString())
                .filter((v: any): v is string => !!v)
        );

        const [vendors, pos, products, vendorContacts] = await Promise.all([
            vendorIds.length
                ? this.vendorRepository.findAll({
                      _id: { $in: vendorIds },
                  } as any)
                : Promise.resolve([] as any[]),
            poIds.length
                ? this.poRepository.findAll({
                      _id: { $in: poIds },
                  } as any)
                : Promise.resolve([] as any[]),
            productIds.length
                ? this.productRepository.findAll({
                      _id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
            vendorIds.length
                ? this.vendorContactRepository.findAll({
                      vendor_id: { $in: vendorIds },
                      is_primary: true,
                  } as any)
                : Promise.resolve([] as any[]),
        ]);

        const vendorMap = toMap(vendors as any[]);
        const poMap = toMap(pos as any[]);
        const productMap = toMap(products as any[]);
        const vendorPrimaryByVendor = new Map<string, any>();
        for (const c of vendorContacts as any[]) {
            const k = c.vendor_id?.toString();
            if (k && !vendorPrimaryByVendor.has(k))
                vendorPrimaryByVendor.set(k, c);
        }
        const linesByPov = new Map<string, any[]>();
        for (const l of allLines as any[]) {
            const k = l.po_vendor_id?.toString();
            if (!k) continue;
            if (!linesByPov.has(k)) linesByPov.set(k, []);
            linesByPov.get(k).push(l);
        }

        const out: PoVendorGetResponseDto[] = [];
        for (const r of rows as any[]) {
            const vendor: any = r.vendor_id
                ? vendorMap.get(r.vendor_id.toString())
                : null;
            const vc: any = r.vendor_id
                ? vendorPrimaryByVendor.get(r.vendor_id.toString())
                : null;
            const po: any = r.purchase_order_id
                ? poMap.get(r.purchase_order_id.toString())
                : null;

            const linesRaw = (linesByPov.get(r._id.toString()) || []).sort(
                (a, b) => Number(a.seq || 0) - Number(b.seq || 0)
            );
            const lines: PoVendorLineResponseDto[] = linesRaw.map((l: any) => {
                const ordered = num(l.ordered_qty);
                const dispatched = num(l.dispatched_qty);
                const received = num(l.received_qty);
                const product = l.product_id
                    ? productMap.get(l.product_id.toString())
                    : null;
                return {
                    _id: l._id.toString(),
                    purchase_order_line_id: l.purchase_order_line_id?.toString(),
                    product_id: l.product_id?.toString(),
                    product_name: (product as any)?.name,
                    product_code: (product as any)?.code,
                    description: l.description || undefined,
                    hsn_code: l.hsn_code || undefined,
                    unit: l.unit || undefined,
                    tax_pct: String(l.tax_pct ?? '0'),
                    unit_price: String(l.unit_price ?? '0'),
                    ordered_qty: String(ordered),
                    dispatched_qty: String(dispatched),
                    received_qty: String(received),
                    undispatched_qty: String(round4(ordered - dispatched)),
                    short_qty: String(round4(dispatched - received)),
                    line_total: String(l.line_total ?? '0'),
                    seq: Number(l.seq || 0),
                };
            });

            out.push({
                _id: r._id.toString(),
                voucher_no: r.voucher_no,

                purchase_order_id: r.purchase_order_id?.toString(),
                purchase_order_voucher_no: po?.voucher_no,

                vendor_id: r.vendor_id?.toString(),
                vendor_name: (vendor as any)?.company_name,
                vendor_contact_name: vc?.name,
                vendor_contact_email: vc?.email,
                vendor_contact_phone: vc?.phone,
                vendor_address_id: r.vendor_address_id?.toString(),

                dispatch_date: r.dispatch_date || undefined,
                expected_arrival_date: r.expected_arrival_date || undefined,
                actual_arrival_date: r.actual_arrival_date || undefined,

                transporter_name: r.transporter_name || undefined,
                vehicle_no: r.vehicle_no || undefined,
                lr_no: r.lr_no || undefined,
                lr_date: r.lr_date || undefined,
                eway_bill_no: r.eway_bill_no || undefined,
                eway_bill_date: r.eway_bill_date || undefined,

                delivery_address: r.delivery_address,
                delivery_address_id: r.delivery_address_id?.toString(),
                notes: r.notes || undefined,
                internal_notes: r.internal_notes || undefined,

                currency_code: r.currency_code || 'INR',
                currency_symbol: getCurrencySymbol(r.currency_code || 'INR'),
                exchange_rate: String(r.exchange_rate ?? '1'),

                status: r.status,

                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,

                lines,
            });
        }
        return out;
    }

    async mapGet(row: PoVendorDoc): Promise<PoVendorGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
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
