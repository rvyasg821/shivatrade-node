import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { PoVendorRepository } from '../repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '../repository/repositories/po-vendor-line.repository';
import { PoVendorPaymentRepository } from '../repository/repositories/po-vendor-payment.repository';
import { PoVendorDoc } from '../repository/entities/po-vendor.entity';
import { PoVendorPaymentDoc } from '../repository/entities/po-vendor-payment.entity';
import {
    ENUM_PO_VENDOR_STATUS,
    ENUM_PO_VENDOR_PAYMENT_STATUS,
} from '../enums/po-vendor.enum';
import { PoVendorPaymentCreateRequestDto } from '../dtos/request/po-vendor-payment.request.dto';
import { PoVendorCreateRequestDto } from '../dtos/request/po-vendor.create.request.dto';
import { PoVendorStandaloneCreateRequestDto } from '../dtos/request/po-vendor.standalone-create.request.dto';
import { PoVendorUpdateRequestDto } from '../dtos/request/po-vendor.update.request.dto';
import { PoVendorDispatchRequestDto } from '../dtos/request/po-vendor.dispatch.request.dto';
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
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { formatCompanyAddress } from '@modules/company/utils/format-address';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { formatLocationAddress } from '@modules/location/utils/format-address';
import { CurrencyService } from '@modules/currency/services/currency.service';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { ImportContext } from '@common/import/import-context.interface';

import { PoVendorTrackingEventRepository } from '@modules/tracking-event/repository/repositories/po-vendor-tracking-event.repository';
import { DependencyCheckService } from '@modules/dependency-check/dependency-check.service';
import { ENUM_TRACKING_EVENT_TYPE } from '@modules/tracking-event/enums/tracking-event.enum';
import { StockLedgerService } from '@modules/inventory/services/stock-ledger.service';
import { AdjustmentNoteRepository } from '@modules/adjustment-note/repository/repositories/adjustment-note.repository';
import { sumAdjustmentEffect } from '@modules/adjustment-note/helpers/adjustment-balance.helper';

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
        private readonly povPaymentRepository: PoVendorPaymentRepository,
        private readonly adjustmentNoteRepository: AdjustmentNoteRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly vendorContactRepository: VendorContactRepository,
        private readonly productRepository: ProductRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly priceListRepository: PriceListRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository,
        private readonly locationRepository: LocationRepository,
        private readonly currencyService: CurrencyService,
        private readonly voucherService: VoucherService,
        private readonly trackingEventRepository: PoVendorTrackingEventRepository,
        private readonly stockLedger: StockLedgerService,
        private readonly dependencyCheckService: DependencyCheckService
    ) {}

    /**
     * Delete policy: block if any GRN / Debit-Note references this POV;
     * otherwise only a DRAFT may be deleted (a dispatched POV must be
     * cancelled), and it is HARD-deleted with its lines + payments.
     * `softDelete` above stays for internal use.
     */
    async deleteWithGuard(row: PoVendorDoc): Promise<void> {
        await this.dependencyCheckService.assertNoDependents(
            'po_vendor',
            row._id.toString(),
            'Vendor PO'
        );
        if (row.status !== ENUM_PO_VENDOR_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only draft POVs can be deleted. Cancel non-draft POVs instead.'
            );
        }
        await this.povPaymentRepository.deleteMany({
            po_vendor_id: row._id.toString(),
        } as any);
        await this.povLineRepository.deleteMany({
            po_vendor_id: row._id.toString(),
        } as any);
        await this.povRepository.delete({ _id: row._id } as any);
    }

    /**
     * Append an auto-generated lifecycle event to a POV's tracking timeline.
     * Failures are logged but never rethrown — tracking is observability,
     * not part of the transactional invariant of the action that triggered
     * it (we don't want a logging glitch to fail a real POV dispatch).
     */
    private async emitSystemEvent(
        companyId: string,
        povId: string,
        eventType: ENUM_TRACKING_EVENT_TYPE,
        userId: string,
        notes?: string,
        location?: string
    ): Promise<void> {
        try {
            await this.trackingEventRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                event_at: new Date(),
                event_type: eventType,
                location: location || null,
                notes: notes || null,
                is_post_closure: false,
                is_system: true,
                created_by: userId,
            } as any);
        } catch (err) {
            this.logger.warn(
                `emitSystemEvent(${eventType}) failed for POV ${povId}: ${
                    (err as any)?.message || err
                }`
            );
        }
    }

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

    // ─── Vendor expense snapshot builder ────────────────────────────────

    /**
     * Resolve a list of expense picks against the expense master and
     * return the snapshot rows (with code/name filled, amount computed
     * on subtotal). Validates:
     *   - no duplicate expense_id in the same list
     *   - each expense_id exists and belongs to the company
     *
     * `subtotal` is the running line total used as the percent base.
     * For `fixed` rows, `value` is taken as the amount directly.
     */
    private async buildExpensesSnapshot(
        companyId: string,
        picks: Array<{
            expense_id: string;
            type?: 'percent' | 'fixed';
            value?: string;
            gst_pct?: string;
        }>,
        subtotal: number
    ): Promise<
        Array<{
            expense_id: string;
            code: string;
            name: string;
            type: string;
            value: string;
            amount: string;
            gst_pct: string;
        }>
    > {
        if (!picks || picks.length === 0) return [];

        // Reject duplicates up front (per locked-in rule #3).
        const seen = new Set<string>();
        for (const p of picks) {
            const key = p.expense_id;
            if (seen.has(key)) {
                throw new BadRequestException(
                    `Duplicate expense in vendor charges list (expense_id ${key}).`
                );
            }
            seen.add(key);
        }

        const ids = picks.map(p => p.expense_id);
        const masters: any[] = await this.expenseRepository.findAll({
            _id: { $in: ids },
            company_id: companyId,
            soft_delete: false,
        } as any);
        const masterById = new Map<string, any>(
            (masters || []).map(m => [m._id.toString(), m])
        );

        const out: Array<{
            expense_id: string;
            code: string;
            name: string;
            type: string;
            value: string;
            amount: string;
            gst_pct: string;
        }> = [];
        for (const p of picks) {
            const m = masterById.get(p.expense_id);
            if (!m) {
                throw new BadRequestException(
                    `Expense ${p.expense_id} not found in master.`
                );
            }
            const type = (p.type || m.type) as 'percent' | 'fixed';
            const value =
                p.value != null && p.value !== ''
                    ? String(p.value)
                    : String(m.value || '0');
            const amount =
                type === 'percent'
                    ? round2((subtotal * num(value)) / 100)
                    : round2(num(value));
            // Per-charge GST% (operator-entered). Charge master carries no GST,
            // so default to 0 when not supplied.
            const gstPct =
                p.gst_pct != null && p.gst_pct !== ''
                    ? String(num(p.gst_pct))
                    : '0';
            out.push({
                expense_id: p.expense_id,
                code: m.code,
                name: m.name,
                type,
                value,
                amount: String(amount),
                gst_pct: gstPct,
            });
        }
        return out;
    }

    // ─── Pending-qty calculator (POV plan §8 over-shipment guard) ───────

    /**
     * Returns a Map<po_line_id, pending_qty> for the given PO. Pending is
     * the PO line's ordered_qty minus the qty each non-cancelled POV still
     * holds against that line:
     *  - DRAFT POVs hold their full `ordered_qty` (planned, not yet shipped)
     *  - DISPATCHED POVs hold `dispatched_qty` (under-dispatch returns
     *    to pending so a follow-up POV can cover what the vendor didn't ship)
     *  - CLOSED POVs hold `received_qty` (short receipts return to pending
     *    so a follow-up POV can cover damage / loss)
     *  - CANCELLED POVs hold 0 (decision §10).
     *
     * Pass `excludePoVendorId` when computing pending for an EDIT — the
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

        const povs = await this.povRepository.findAll({
            purchase_order_id: purchaseOrderId,
            soft_delete: false,
        } as any);

        const activePovs = (povs as any[])
            .filter(p => p.status !== ENUM_PO_VENDOR_STATUS.CANCELLED)
            .filter(p =>
                excludePoVendorId
                    ? p._id.toString() !== excludePoVendorId
                    : true
            );
        const povStatusById = new Map<string, string>();
        for (const p of activePovs) {
            povStatusById.set(p._id.toString(), p.status);
        }
        const activePovIds = activePovs.map(p => p._id.toString());

        if (activePovIds.length) {
            const povLines = await this.povLineRepository.findAll({
                po_vendor_id: { $in: activePovIds },
            } as any);
            for (const pl of povLines as any[]) {
                const k = pl.purchase_order_line_id?.toString();
                if (!k) continue;
                const status = povStatusById.get(
                    pl.po_vendor_id?.toString()
                );
                let consumed = 0;
                if (status === ENUM_PO_VENDOR_STATUS.CLOSED) {
                    consumed = num(pl.received_qty);
                } else if (status === ENUM_PO_VENDOR_STATUS.DISPATCHED) {
                    consumed = num(pl.dispatched_qty);
                } else {
                    consumed = num(pl.ordered_qty);
                }
                pending.set(k, (pending.get(k) || 0) - consumed);
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
            // `allow_over_pending` is set only when the operator deliberately
            // adjusted the quantity above the SO's pending on the Generate-POV
            // screen (over-procurement / MOQ). Every other caller leaves it
            // unset, so the over-shipment guard still applies there.
            if (!(ln as any).allow_over_pending && req > avail + 1e-6) {
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
        // Delivery address is optional — a Sales Order may have none, and the
        // Generate POV flow shouldn't force one. Default to empty (the column
        // is non-null) so creation proceeds; it can be filled later.
        if (!delivery_address) {
            delivery_address = '';
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

        // Pre-compute the subtotal so percent-typed expenses snapshot
        // against the right base.
        let preSubtotal = 0;
        for (const ln of data.lines) {
            const poLine = poLineById.get(ln.purchase_order_line_id);
            const ordered = num(ln.ordered_qty);
            const unitPriceStr =
                (ln as any).unit_price != null && (ln as any).unit_price !== ''
                    ? String((ln as any).unit_price)
                    : String(poLine.unit_price || '0');
            preSubtotal += ordered * num(unitPriceStr);
        }
        const expenses_snapshot = await this.buildExpensesSnapshot(
            companyId,
            (data as any).expenses || [],
            preSubtotal
        );

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
            // The POV's own vendor-side terms — never inherited from the PO,
            // whose terms belong to the customer.
            dispatched_through: (data as any).dispatched_through || null,
            payment_terms: (data as any).payment_terms || null,
            delivery_terms: (data as any).delivery_terms || null,
            currency_code,
            exchange_rate: '1',
            status: ENUM_PO_VENDOR_STATUS.DRAFT,
            expenses_snapshot,
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
                part_no: poLine.part_no || null,
                // Caller may override the HSN (generate-POV screen), same as
                // GST% below. LOCAL to this POV — the SO line and the product
                // master are left alone.
                hsn_code:
                    (ln as any).hsn_code != null &&
                    String((ln as any).hsn_code).trim() !== ''
                        ? String((ln as any).hsn_code).trim()
                        : poLine.hsn_code || null,
                unit: poLine.unit || null,
                // Caller may override GST% (generate-POV screen lets the
                // operator correct a wrong/blank master rate). Fall back to the
                // PO line snapshot otherwise.
                tax_pct:
                    (ln as any).tax_pct != null && (ln as any).tax_pct !== ''
                        ? String((ln as any).tax_pct)
                        : String(poLine.tax_pct || '0'),
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
        await this.emitSystemEvent(
            companyId,
            header._id.toString(),
            ENUM_TRACKING_EVENT_TYPE.POV_CREATED,
            createdBy,
            `Created from PO ${po.voucher_no}`
        );
        return this.povRepository.findOneById(header._id.toString());
    }

    /**
     * Creates a standalone POV — no source Sales Order. The lines carry
     * their own product + qty + vendor (INR) price; descriptive fields
     * fall back to the product master. `purchase_order_id` and each line's
     * `purchase_order_line_id` are null, so it never appears in any PO
     * coverage roll-up.
     */
    async createStandalone(
        companyId: string,
        data: PoVendorStandaloneCreateRequestDto,
        createdBy: string,
        ctx?: ImportContext
    ): Promise<PoVendorDoc> {
        const silent = !!ctx?.silent;
        const vendorId = data.vendor_id;
        if (!vendorId) throw new BadRequestException('vendor_id is required.');

        // ── Resolve delivery address (no PO to inherit from) ───────────
        let delivery_address = '';
        let delivery_address_id: string | null = null;
        if (data.delivery_address && data.delivery_address.trim()) {
            delivery_address = data.delivery_address.trim();
        } else if (data.delivery_address_id) {
            const locId = data.delivery_address_id;
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
        }
        if (!delivery_address) {
            throw new BadRequestException('delivery_address is required.');
        }

        // ── Load product master snapshots for all requested lines ──────
        const productIds = Array.from(
            new Set((data.lines || []).map(l => l.product_id))
        );
        const products = await this.productRepository.findAll({
            _id: { $in: productIds },
            company_id: companyId,
            soft_delete: false,
        } as any);
        const productById = new Map<string, any>();
        for (const p of products as any[])
            productById.set(p._id.toString(), p);
        for (const ln of data.lines) {
            if (!productById.has(ln.product_id)) {
                throw new BadRequestException(
                    `Product ${ln.product_id} not found.`
                );
            }
            if (num(ln.ordered_qty) <= 0) {
                throw new BadRequestException(
                    'Each line ordered_qty must be > 0.'
                );
            }
            // Guard: the product must be in the SELECTED VENDOR's price list —
            // a POV line can only reference a product the vendor actually
            // quotes (mirrors the create form's product-pick validation).
            // Relaxed in import mode (§12.2): a historical VPO legitimately
            // references a product that may no longer be in the vendor's
            // CURRENT price list — the line carries its own historical price.
            if (!silent) {
                let priceRow: any = null;
                try {
                    priceRow = await this.priceListRepository.findCurrentPrice(
                        companyId,
                        vendorId,
                        ln.product_id
                    );
                } catch {
                    priceRow = null;
                }
                if (!priceRow) {
                    const p = productById.get(ln.product_id);
                    throw new BadRequestException(
                        `Product ${p?.code || p?.name || ln.product_id} is not in the selected vendor's price list.`
                    );
                }
            }
        }

        // ── Vendor address — request value or the vendor's default ─────
        let vendorAddressId = data.vendor_address_id || null;
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

        // ── Voucher + currency + expense snapshot ──────────────────────
        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.assignVoucher(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.PO_VENDOR,
            prefix,
            {
                explicit: ctx?.voucher_no,
                // Live path keeps numbering by "today" (unchanged); only import
                // buckets the voucher into the historical doc's FY.
                asOfDate: ctx?.voucher_no
                    ? (data as any).dispatch_date
                    : undefined,
            }
        );
        const homeCurrency = await this.currencyService
            .getDefaultCurrency(companyId)
            .catch(() => null);
        const currency_code = homeCurrency?.code || 'INR';

        let preSubtotal = 0;
        for (const ln of data.lines) {
            preSubtotal += num(ln.ordered_qty) * num(ln.unit_price);
        }
        const expenses_snapshot = await this.buildExpensesSnapshot(
            companyId,
            (data as any).expenses || [],
            preSubtotal
        );

        // ── Header (purchase_order_id = null) ──────────────────────────
        const header = await this.povRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            purchase_order_id: null,
            vendor_id: vendorId,
            vendor_address_id: vendorAddressId,
            delivery_address,
            delivery_address_id,
            notes: data.notes || null,
            internal_notes: data.internal_notes || null,
            dispatched_through: data.dispatched_through || null,
            payment_terms: data.payment_terms || null,
            delivery_terms: data.delivery_terms || null,
            currency_code,
            exchange_rate: '1',
            status: (ctx?.status as any) || ENUM_PO_VENDOR_STATUS.DRAFT,
            expenses_snapshot,
        } as any);

        // ── Lines (own snapshot; purchase_order_line_id = null) ────────
        let seq = 0;
        for (const ln of data.lines) {
            seq += 1;
            const prod = productById.get(ln.product_id);
            const ordered = num(ln.ordered_qty);
            const unitPrice = num(ln.unit_price);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: header._id.toString(),
                purchase_order_line_id: null,
                product_id: ln.product_id,
                description: ln.description || prod?.description || prod?.name || null,
                part_no: ln.part_no || prod?.part_no || null,
                hsn_code: ln.hsn_code || prod?.hsn_code || null,
                unit: ln.unit || prod?.unit_of_measure || null,
                tax_pct: String(ln.tax_pct ?? prod?.tax_pct ?? '0'),
                unit_price: String(ln.unit_price),
                ordered_qty: String(ordered),
                dispatched_qty: '0',
                received_qty: '0',
                line_total: String(round2(ordered * unitPrice)),
                seq: ln.seq != null ? Number(ln.seq) : seq,
            } as any);
        }

        this.logger.log(
            `Standalone POV created: ${header._id} (${voucher_no})`
        );
        await this.emitSystemEvent(
            companyId,
            header._id.toString(),
            ENUM_TRACKING_EVENT_TYPE.POV_CREATED,
            createdBy,
            'Created standalone (no Sales Order)'
        );

        // Optional advance paid to the vendor — recorded as a normal vendor
        // payment so it shows in the Payments tab + timeline with a PV voucher.
        const advance = data.advance;
        if (advance && num(advance.amount) > 0) {
            const created = await this.povRepository.findOneById(
                header._id.toString()
            );
            await this.recordPayment(
                created,
                {
                    payment_date:
                        advance.payment_date ||
                        new Date().toISOString().slice(0, 10),
                    amount: String(advance.amount),
                    invoice_number: advance.invoice_number,
                    notes: advance.notes,
                },
                createdBy
            );
        }

        return this.povRepository.findOneById(header._id.toString());
    }

    // ─── Balance POV (re-order what this POV never delivered) ──────────
    //
    // A POV can under-deliver two ways: the vendor ships less than ordered
    // (undispatched), or goods are lost/rejected in transit (short). Both leave
    // the order unfulfilled. For a PO-backed POV those units flow back to PO
    // pending; for a STANDALONE POV there is no PO, so they were orphaned. This
    // raises a follow-up DRAFT POV for the balance in both cases.

    /**
     * Per-line balance still worth re-ordering from this POV.
     *
     * `ordered − consumed`, where `consumed` mirrors computePendingByPoLineId:
     * a CLOSED POV consumes what it received, a DISPATCHED one what it
     * dispatched. So a dispatched POV's balance is its undispatched qty, and a
     * closed one's is undispatched + short. Qty already re-ordered on live
     * balance POVs raised from this one is subtracted, so the action is
     * idempotent. A PO-backed line is additionally capped at the parent PO
     * line's pending, so a balance POV can never over-consume the PO.
     */
    private async balancePlan(
        source: any
    ): Promise<Array<{ line: any; qty: number }>> {
        const status = source.status;
        if (
            status !== ENUM_PO_VENDOR_STATUS.CLOSED &&
            status !== ENUM_PO_VENDOR_STATUS.DISPATCHED
        ) {
            return [];
        }
        const srcId = source._id.toString();
        const lines = (await this.povLineRepository.findAll({
            po_vendor_id: srcId,
        } as any)) as any[];
        if (!lines.length) return [];

        // Qty already covered by live balance POVs raised from this one.
        const children = (
            (await this.povRepository.findAll({
                balance_of_po_vendor_id: srcId,
                soft_delete: false,
            } as any)) as any[]
        ).filter(c => c.status !== ENUM_PO_VENDOR_STATUS.CANCELLED);
        const covered = new Map<string, number>();
        if (children.length) {
            const childLines = (await this.povLineRepository.findAll({
                po_vendor_id: { $in: children.map(c => c._id.toString()) },
            } as any)) as any[];
            for (const cl of childLines) {
                const k = cl.balance_of_po_vendor_line_id?.toString();
                if (!k) continue;
                covered.set(
                    k,
                    round4((covered.get(k) || 0) + num(cl.ordered_qty))
                );
            }
        }

        const poPending = source.purchase_order_id
            ? await this.computePendingByPoLineId(
                  source.purchase_order_id.toString()
              )
            : null;

        const plan: Array<{ line: any; qty: number }> = [];
        for (const l of lines) {
            const consumed =
                status === ENUM_PO_VENDOR_STATUS.CLOSED
                    ? num(l.received_qty)
                    : num(l.dispatched_qty);
            let qty = round4(
                num(l.ordered_qty) -
                    consumed -
                    (covered.get(l._id.toString()) || 0)
            );
            const polId = l.purchase_order_line_id?.toString();
            if (poPending && polId) {
                qty = Math.min(qty, round4(poPending.get(polId) || 0));
            }
            if (qty > 1e-6) plan.push({ line: l, qty: round4(qty) });
        }
        return plan;
    }

    /** True when this POV still has un-delivered qty worth re-ordering. */
    async hasBalance(source: any): Promise<boolean> {
        const plan = await this.balancePlan(source);
        return plan.length > 0;
    }

    /**
     * Clone the un-delivered balance of `source` into a new DRAFT POV on the
     * same vendor, keeping the parent-PO links so coverage stays correct.
     */
    async createBalance(source: any, userId: string): Promise<PoVendorDoc> {
        const status = source.status;
        if (
            status !== ENUM_PO_VENDOR_STATUS.CLOSED &&
            status !== ENUM_PO_VENDOR_STATUS.DISPATCHED
        ) {
            throw new BadRequestException(
                'A balance Vendor PO can only be raised from a dispatched or closed Vendor PO.'
            );
        }
        const plan = await this.balancePlan(source);
        if (!plan.length) {
            throw new BadRequestException(
                'This Vendor PO has no un-delivered balance left to re-order.'
            );
        }

        const companyId = source.company_id;
        const srcId = source._id.toString();
        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.PO_VENDOR,
            prefix
        );

        // Charges are per-shipment, so they are NOT carried over — the operator
        // adds them on the new draft.
        const header = await this.povRepository.create({
            company_id: companyId,
            created_by: userId,
            voucher_no,
            purchase_order_id: source.purchase_order_id || null,
            balance_of_po_vendor_id: srcId,
            vendor_id: source.vendor_id,
            vendor_address_id: source.vendor_address_id || null,
            delivery_address: source.delivery_address,
            delivery_address_id: source.delivery_address_id || null,
            notes: source.notes || null,
            internal_notes: source.internal_notes || null,
            dispatched_through: source.dispatched_through || null,
            payment_terms: source.payment_terms || null,
            delivery_terms: source.delivery_terms || null,
            currency_code: source.currency_code || 'INR',
            exchange_rate: String(source.exchange_rate ?? '1'),
            status: ENUM_PO_VENDOR_STATUS.DRAFT,
            expenses_snapshot: [],
        } as any);
        const newId = header._id.toString();

        let seq = 0;
        let totalQty = 0;
        for (const { line, qty } of plan.sort(
            (a, b) => Number(a.line.seq || 0) - Number(b.line.seq || 0)
        )) {
            seq += 1;
            totalQty = round4(totalQty + qty);
            const unitPrice = num(line.unit_price);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: newId,
                purchase_order_line_id: line.purchase_order_line_id || null,
                balance_of_po_vendor_line_id: line._id.toString(),
                product_id: line.product_id,
                description: line.description || null,
                part_no: line.part_no || null,
                hsn_code: line.hsn_code || null,
                unit: line.unit || null,
                tax_pct: String(line.tax_pct ?? '0'),
                unit_price: String(line.unit_price ?? '0'),
                ordered_qty: String(qty),
                dispatched_qty: '0',
                received_qty: '0',
                line_total: String(round2(qty * unitPrice)),
                seq,
            } as any);
        }

        this.logger.log(
            `Balance POV ${voucher_no} created from POV ${source.voucher_no || srcId}`
        );
        await this.emitSystemEvent(
            companyId,
            newId,
            ENUM_TRACKING_EVENT_TYPE.POV_CREATED,
            userId,
            `Created as the balance of ${source.voucher_no || 'the source Vendor PO'} — ${totalQty} un-delivered unit(s) re-ordered.`
        );
        await this.emitSystemEvent(
            companyId,
            srcId,
            ENUM_TRACKING_EVENT_TYPE.POV_UPDATED,
            userId,
            `Balance Vendor PO ${voucher_no} raised for ${totalQty} un-delivered unit(s).`
        );

        return this.povRepository.findOneById(newId);
    }

    // ─── Recover from PO (multi-vendor batch — PFI→PO-style flow) ──────
    //
    // When a POV is cancelled, its PO lines go back to uncovered.
    // `recoverPreviewByPoId` returns those lines + a default suggested
    // vendor (the PO line's current `vendor_id`) + a list of all active
    // company vendors so the operator can switch per line.
    //
    // `recoverFromPo` accepts a flat list of {po_line_id, vendor_id}
    // assignments, groups by vendor_id, and spawns one POV per vendor in
    // one logical call. If the operator picks a different vendor than the
    // line's current `vendor_id`, the PO line is reassigned (po_line.vendor_id
    // updated).

    /**
     * For each PO line, list the active price-list candidate vendors for that
     * product (cheapest-first) so the Generate-POV modal can show ₹ rates and a
     * "Cheapest" suggestion. Returns a Map keyed by purchase_order_line_id.
     */
    private async buildCandidateVendorsByLine(
        companyId: string,
        poLines: any[]
    ): Promise<
        Map<
            string,
            {
                candidate_vendors: Array<{
                    vendor_id: string;
                    vendor_name: string;
                    unit_price: string;
                }>;
                suggested_vendor_id?: string;
            }
        >
    > {
        const out = new Map<string, any>();
        const productIds = unique(
            poLines.map(l => l.product_id?.toString())
        );
        if (!productIds.length) return out;

        const today = new Date().toISOString().slice(0, 10);
        const priceRows = (await this.priceListRepository.findAll({
            company_id: companyId,
            product_id: { $in: productIds },
        } as any)) as any[];
        const activeRows = priceRows.filter(
            r =>
                (!r.effective_date || r.effective_date <= today) &&
                (!r.valid_until || r.valid_until >= today)
        );

        // product → (vendor → cheapest price row).
        const byProduct = new Map<string, Map<string, any>>();
        for (const r of activeRows) {
            const pid = r.product_id?.toString();
            const vid = r.vendor_id?.toString();
            if (!pid || !vid) continue;
            if (!byProduct.has(pid)) byProduct.set(pid, new Map());
            const inner = byProduct.get(pid)!;
            const existing = inner.get(vid);
            if (
                !existing ||
                Number(r.unit_price) < Number(existing.unit_price)
            ) {
                inner.set(vid, r);
            }
        }

        const vendorIds = unique(
            activeRows.map(r => r.vendor_id?.toString())
        );
        const vendors = vendorIds.length
            ? await this.vendorRepository.findAll({
                  _id: { $in: vendorIds },
              } as any)
            : [];
        const vendorMap = new Map<string, any>();
        for (const v of vendors as any[]) {
            vendorMap.set(v._id.toString(), v);
        }

        for (const l of poLines) {
            const pid = l.product_id?.toString();
            const candidates = Array.from(
                (byProduct.get(pid) || new Map()).values()
            )
                .map((r: any) => {
                    const v: any = vendorMap.get(r.vendor_id?.toString());
                    return {
                        vendor_id: r.vendor_id?.toString(),
                        vendor_name: v?.company_name || v?.name || '',
                        unit_price: String(r.unit_price || '0'),
                    };
                })
                .filter(c => !!c.vendor_id)
                .sort(
                    (a, b) => Number(a.unit_price) - Number(b.unit_price)
                );
            out.set(l._id.toString(), {
                candidate_vendors: candidates,
                suggested_vendor_id: candidates[0]?.vendor_id || undefined,
            });
        }
        return out;
    }

    async recoverPreviewByPoId(
        companyId: string,
        purchaseOrderId: string
    ): Promise<any> {
        const po: any = await this.poRepository.findOne({
            _id: purchaseOrderId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!po) throw new NotFoundException('PO not found');

        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: purchaseOrderId,
        } as any);

        const pending = await this.computePendingByPoLineId(purchaseOrderId);

        // Vendor + product hydration for snapshot fields on the response.
        const vendorIds = unique(
            (poLines as any[]).map((l: any) => l.vendor_id?.toString())
        );
        const productIds = unique(
            (poLines as any[]).map((l: any) => l.product_id?.toString())
        );
        const [lineVendors, products, allActiveVendors] = await Promise.all([
            vendorIds.length
                ? this.vendorRepository.findAll({
                      _id: { $in: vendorIds },
                  } as any)
                : Promise.resolve([] as any[]),
            productIds.length
                ? this.productRepository.findAll({
                      _id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
            this.vendorRepository.findAll({
                company_id: companyId,
                soft_delete: false,
                is_active: true,
            } as any),
        ]);
        const lineVendorMap = new Map<string, any>();
        for (const v of lineVendors as any[]) {
            lineVendorMap.set(v._id.toString(), v);
        }
        const productMap = new Map<string, any>();
        for (const p of products as any[]) {
            productMap.set(p._id.toString(), p);
        }

        // Price-list candidate vendors per PO line (cheapest-first), mirroring
        // the quotation → SO preview so the Generate-POV modal can show ₹ rates
        // + a "Cheapest" pick. Keyed by purchase_order_line_id.
        const candidateByLine = await this.buildCandidateVendorsByLine(
            companyId,
            poLines as any[]
        );

        // FREE stock only → drives "In Stock" / "To Procure" on the modal.
        // Excludes goods already received against (non-cancelled) POV lines,
        // which are reserved to their own SO lines — counting them was the
        // double-count that under-procured a partially-received order. Greedy
        // allocation below splits the free pool across lines of the same product.
        const freeStock = await this.stockLedger.freeOnHandMap(
            companyId,
            productIds,
            null
        );
        const stockRemaining = new Map<string, number>(freeStock);

        const lines = (poLines as any[]).map((l: any) => {
            const k = l._id.toString();
            const orderedQty = num(l.qty);
            const pendingQty = pending.get(k) || 0;
            const vendor: any = l.vendor_id
                ? lineVendorMap.get(l.vendor_id.toString())
                : null;
            const product: any = l.product_id
                ? productMap.get(l.product_id.toString())
                : null;
            const cand = candidateByLine.get(k);
            const pid = l.product_id ? l.product_id.toString() : null;
            const avail = pid ? Math.max(0, stockRemaining.get(pid) || 0) : 0;
            // From-stock for this line = min(still needed, free stock left).
            const inStock = Math.max(0, round4(Math.min(pendingQty, avail)));
            if (pid && inStock > 0)
                stockRemaining.set(pid, round4(avail - inStock));
            const toProcure = Math.max(0, round4(pendingQty - inStock));
            return {
                purchase_order_line_id: k,
                product_id: l.product_id?.toString(),
                product_name: product?.name,
                product_code: product?.code,
                part_no: l.part_no || product?.part_no || undefined,
                hsn_code: l.hsn_code || product?.hsn_code || undefined,
                tax_pct: String(l.tax_pct ?? product?.tax_pct ?? '0'),
                unit: l.unit || product?.unit_of_measure || undefined,
                ordered_qty: String(round4(orderedQty)),
                pending_qty: String(round4(pendingQty)),
                in_stock: String(round4(inStock)),
                to_procure: String(toProcure),
                fully_covered: pendingQty <= 1e-6,
                current_vendor_id: l.vendor_id?.toString(),
                current_vendor_name: vendor?.company_name,
                // Cheapest-first price-list candidates for this product.
                candidate_vendors: cand?.candidate_vendors || [],
                suggested_vendor_id:
                    l.vendor_id?.toString() ||
                    cand?.suggested_vendor_id ||
                    undefined,
            };
        });

        const active_vendors = (allActiveVendors as any[])
            .map((v: any) => ({
                vendor_id: v._id.toString(),
                vendor_name: v.company_name,
            }))
            .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));

        return {
            purchase_order_id: po._id.toString(),
            purchase_order_voucher_no: po.voucher_no,
            status: po.status,
            lines,
            active_vendors,
        };
    }

    async recoverFromPo(
        companyId: string,
        purchaseOrderId: string,
        data: {
            assignments: Array<{
                purchase_order_line_id: string;
                vendor_id: string;
                tax_pct?: string;
                hsn_code?: string;
                ordered_qty?: string;
            }>;
            delivery_address_id?: string;
            delivery_address?: string;
            notes?: string;
            internal_notes?: string;
            /** Per-vendor expense picks (charges). Key = vendor_id. */
            vendor_expenses?: Record<
                string,
                Array<{
                    expense_id: string;
                    type?: 'percent' | 'fixed';
                    value?: string;
                    gst_pct?: string;
                }>
            >;
            /** Per-vendor advance paid, recorded on the spawned POV. */
            vendor_advances?: Record<
                string,
                {
                    payment_date?: string;
                    amount?: string;
                    invoice_number?: string;
                    notes?: string;
                }
            >;
            /** Per-vendor deliver-to location (Locations-master id). Sets the
             *  spawned POV's `delivery_address_id`. Key = vendor_id. */
            vendor_delivery_locations?: Record<string, string>;
            /** Per-vendor terms stamped onto the spawned POV. Key = vendor_id. */
            vendor_terms?: Record<
                string,
                {
                    dispatched_through?: string;
                    payment_terms?: string;
                    delivery_terms?: string;
                }
            >;
        },
        createdBy: string
    ): Promise<{ created: PoVendorDoc[]; all_from_stock?: boolean }> {
        if (!data.assignments?.length) {
            throw new BadRequestException(
                'At least one line assignment is required.'
            );
        }

        // Group assignments by vendor_id.
        const byVendor = new Map<string, string[]>();
        const seenLines = new Set<string>();
        // Per-line GST% override (operator-edited on the generate-POV screen).
        const taxOverrideByLine = new Map<string, string>();
        // Per-line HSN override, same screen, same rule. Kept in its own map
        // for the same reason as tax: `linesPayload` below is rebuilt from the
        // PO line, so anything the operator typed has to be carried across
        // explicitly or it is silently dropped on the way to createFromPo.
        const hsnOverrideByLine = new Map<string, string>();
        // Per-line quantity override (operator edited the "To Procure" column).
        // When set, it replaces the computed pending − stock qty for that line
        // and may exceed pending (over-procurement) — see the toProcure loop.
        const qtyOverrideByLine = new Map<string, number>();
        for (const a of data.assignments) {
            if (!a.purchase_order_line_id || !a.vendor_id) {
                throw new BadRequestException(
                    'Each assignment requires purchase_order_line_id + vendor_id.'
                );
            }
            if (seenLines.has(a.purchase_order_line_id)) {
                throw new BadRequestException(
                    `Duplicate assignment for PO line ${a.purchase_order_line_id}.`
                );
            }
            seenLines.add(a.purchase_order_line_id);
            if (a.tax_pct != null && a.tax_pct !== '') {
                taxOverrideByLine.set(a.purchase_order_line_id, String(a.tax_pct));
            }
            if (a.ordered_qty != null && String(a.ordered_qty) !== '') {
                qtyOverrideByLine.set(
                    a.purchase_order_line_id,
                    Math.max(0, round4(num(a.ordered_qty)))
                );
            }
            if (a.hsn_code != null && String(a.hsn_code).trim() !== '') {
                hsnOverrideByLine.set(
                    a.purchase_order_line_id,
                    String(a.hsn_code).trim()
                );
            }
            const arr = byVendor.get(a.vendor_id) || [];
            arr.push(a.purchase_order_line_id);
            byVendor.set(a.vendor_id, arr);
        }

        // Load PO lines once so we can re-assign vendor_id where needed.
        const poLineIds = Array.from(seenLines);
        const poLines = await this.poLineRepository.findAll({
            _id: { $in: poLineIds },
            purchase_order_id: purchaseOrderId,
        } as any);
        if ((poLines as any[]).length !== poLineIds.length) {
            throw new BadRequestException(
                'One or more assignment lines do not belong to this PO.'
            );
        }
        const poLineById = new Map<string, any>();
        for (const l of poLines as any[]) {
            poLineById.set(l._id.toString(), l);
        }

        // Compute pending qty per PO line ONCE upfront. Use this as the
        // POV ordered_qty (not pl.qty) so partially-covered lines work
        // correctly. Also lets us reject 0-qty assignments early — a fully
        // covered line can't be recovered.
        const pending = await this.computePendingByPoLineId(purchaseOrderId);
        const zeroLines: string[] = [];
        for (const a of data.assignments) {
            const p = pending.get(a.purchase_order_line_id) || 0;
            if (p <= 1e-6) {
                zeroLines.push(a.purchase_order_line_id);
            }
        }
        if (zeroLines.length > 0) {
            throw new BadRequestException(
                `Cannot create POV with 0 qty — these PO lines have no pending qty: ${zeroLines.join(', ')}.`
            );
        }

        // Buy only the SHORTFALL: to_procure = max(0, pending − FREE stock).
        // FREE stock excludes goods already received against (non-cancelled)
        // POV lines (reserved to their own SO lines) — so a partially-received
        // order no longer deducts its own received qty again. Greedy allocation
        // splits the free pool across lines of the same product.
        const stockPids = unique(
            data.assignments
                .map((a) =>
                    poLineById
                        .get(a.purchase_order_line_id)
                        ?.product_id?.toString()
                )
                .filter(Boolean) as string[]
        );
        const freeStock = stockPids.length
            ? await this.stockLedger.freeOnHandMap(companyId, stockPids, null)
            : new Map<string, number>();
        const stockRemaining = new Map<string, number>(freeStock);
        const toProcureByLine = new Map<string, number>();
        for (const a of data.assignments) {
            // Operator edited the qty on the Generate-POV screen → trust it
            // verbatim (their default already reflected any stock they wanted to
            // net off). We don't consume the free-stock pool for such lines, so
            // sibling lines of the same product keep their auto-deduct intact.
            if (qtyOverrideByLine.has(a.purchase_order_line_id)) {
                toProcureByLine.set(
                    a.purchase_order_line_id,
                    qtyOverrideByLine.get(a.purchase_order_line_id) || 0
                );
                continue;
            }
            const pl = poLineById.get(a.purchase_order_line_id);
            const pendingQty = pending.get(a.purchase_order_line_id) || 0;
            const pid = pl?.product_id ? pl.product_id.toString() : null;
            const avail = pid ? Math.max(0, stockRemaining.get(pid) || 0) : 0;
            const fromStock = Math.max(0, round4(Math.min(pendingQty, avail)));
            if (pid && fromStock > 0)
                stockRemaining.set(pid, round4(avail - fromStock));
            toProcureByLine.set(
                a.purchase_order_line_id,
                Math.max(0, round4(pendingQty - fromStock))
            );
        }

        // Re-assign po_line.vendor_id where the operator changed it.
        for (const a of data.assignments) {
            const pl = poLineById.get(a.purchase_order_line_id);
            if (!pl) continue;
            if (pl.vendor_id?.toString() !== a.vendor_id) {
                pl.vendor_id = a.vendor_id;
                await this.poLineRepository.save(pl);
            }
        }

        // Deliver-to location fallback — used when a vendor block didn't carry
        // an explicit location. Resolved once so a POV is never created
        // location-less (which would leave its GRN's stock off every
        // location-scoped inventory view). ShivaTrade's default location.
        let defaultLocationId: string | null = null;
        const resolveDeliveryLocation = async (
            vendorId: string
        ): Promise<string | undefined> => {
            const picked = data.vendor_delivery_locations?.[vendorId];
            if (picked) return picked;
            if (defaultLocationId === null) {
                const def =
                    await this.locationRepository.findDefaultLocation(companyId);
                defaultLocationId = def?._id?.toString() || '';
            }
            return defaultLocationId || undefined;
        };

        // For each vendor group, spawn one POV via the existing createFromPo
        // path (re-uses voucher numbering, snapshot logic, system events).
        // The POV line carries the vendor's INR price-list price (procurement
        // side); per-vendor charges flow through as `expenses`.
        const created: PoVendorDoc[] = [];
        for (const [vendorId, lineIds] of byVendor.entries()) {
            const linesPayload = (
                await Promise.all(
                    lineIds.map(async lid => {
                        const toProcure = toProcureByLine.get(lid) || 0;
                        // Fully in stock → no POV line for it.
                        if (toProcure <= 1e-6) return null;
                        const pl = poLineById.get(lid);
                        let unitPrice = String(pl?.unit_price || '0');
                        const productId = pl?.product_id?.toString();
                        if (productId) {
                            let priceRow: any = null;
                            try {
                                priceRow =
                                    await this.priceListRepository.findCurrentPrice(
                                        companyId,
                                        vendorId,
                                        productId
                                    );
                            } catch {
                                priceRow = null;
                            }
                            if (priceRow) {
                                unitPrice = String(priceRow.unit_price || '0');
                            }
                        }
                        // Bypass the over-shipment guard only when the operator's
                        // adjusted qty is above what the SO line still needs.
                        const overPending =
                            toProcure > (pending.get(lid) || 0) + 1e-6;
                        return {
                            purchase_order_line_id: lid,
                            ordered_qty: String(round4(toProcure)),
                            unit_price: unitPrice,
                            tax_pct: taxOverrideByLine.get(lid),
                            hsn_code: hsnOverrideByLine.get(lid),
                            allow_over_pending: overPending || undefined,
                        };
                    })
                )
            ).filter(Boolean) as any[];

            // Whole vendor group covered from stock → spawn no POV.
            if (linesPayload.length === 0) continue;

            const body: any = {
                vendor_id: vendorId,
                lines: linesPayload,
                notes: data.notes,
                internal_notes: data.internal_notes,
                delivery_address: data.delivery_address,
                // Per-vendor deliver-to location (falls back to company default).
                delivery_address_id:
                    (await resolveDeliveryLocation(vendorId)) ||
                    data.delivery_address_id,
                expenses: data.vendor_expenses?.[vendorId] || [],
                // Per-vendor terms typed on the generate-POV screen.
                dispatched_through:
                    data.vendor_terms?.[vendorId]?.dispatched_through,
                payment_terms: data.vendor_terms?.[vendorId]?.payment_terms,
                delivery_terms: data.vendor_terms?.[vendorId]?.delivery_terms,
            };
            const row = await this.createFromPo(
                companyId,
                purchaseOrderId,
                body,
                createdBy
            );

            // Optional advance paid to this vendor → record on the spawned POV.
            const adv = data.vendor_advances?.[vendorId];
            if (adv && num(adv.amount) > 0) {
                await this.recordPayment(
                    row,
                    {
                        payment_date:
                            adv.payment_date ||
                            new Date().toISOString().slice(0, 10),
                        amount: String(adv.amount),
                        invoice_number: adv.invoice_number,
                        notes: adv.notes,
                    },
                    createdBy
                );
                created.push(
                    await this.povRepository.findOneById(row._id.toString())
                );
            } else {
                created.push(row);
            }
        }

        // Every assigned line was fulfilled from stock → no POV needed.
        const allFromStock =
            created.length === 0 &&
            [...toProcureByLine.values()].every((v) => v <= 1e-6);

        this.logger.log(
            `Recovered ${created.length} POV(s) for PO ${purchaseOrderId}` +
                (allFromStock ? ' (all lines fulfilled from stock)' : '')
        );
        return { created, all_from_stock: allFromStock };
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

    /**
     * Assemble a listing-ready country-code object for a vendor contact,
     * mirroring vendor.service's primary_contact_country_code so the POV
     * listing shows the dial code prefixed to the phone (e.g. "+91 98765…").
     * Falls back to +91 when the contact has a phone but no saved code.
     */
    private buildContactCountryCode(vc: any) {
        if (!vc) return undefined;
        let cc: any = vc.country_code || null;
        if (!cc && vc.phone) {
            cc = { dial_code: '+91', phone: vc.phone };
        }
        if (cc && !cc.formatted) {
            const dial = cc.dial_code || cc.dialCode || '';
            const digits = cc.phone || vc.phone || '';
            if (dial || digits) {
                cc.formatted =
                    dial && digits ? `${dial} ${digits}` : dial || digits;
            }
        }
        return cc || undefined;
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
        data: PoVendorUpdateRequestDto,
        userId?: string
    ): Promise<PoVendorDoc> {
        const companyId = row.company_id.toString();
        const fromStatus = row.status;
        const deliveryChanged =
            (data as any).delivery_address_id !== undefined ||
            (data as any).delivery_address !== undefined;
        const linesChanged = Array.isArray((data as any).lines);

        // ── Edit lock per status (POV plan §11) ─────────────────────────
        const draftEditable = new Set([
            'delivery_address',
            'delivery_address_id',
            'lines',
            // GST rates for existing lines. Draft only: once dispatched the PDF
            // is with the vendor and the tax is frozen, same as the terms below.
            'line_taxes',
            // In-place rate / GST edits (supersedes line_taxes).
            'line_edits',
            'expenses',
            // Vendor terms — draft only; once dispatched the PDF is out with
            // the vendor and its terms are frozen.
            'dispatched_through',
            'payment_terms',
            'delivery_terms',
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
            // Vendors revise their rates after the PO has gone out, so a
            // price-only revision stays open once dispatched. The patch loop
            // below rejects a tax_pct change at this status (the PDF's tax is
            // frozen) and blocks the whole thing once a GRN exists.
            'line_edits',
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
        // `line_taxes` must be pulled out here: anything left in `scalar` gets
        // Object.assign'd straight onto the entity, and an array of line patches
        // is not a column.
        const { lines, line_taxes, line_edits, expenses, status, ...scalar } =
            data as any;
        Object.assign(row, scalar);
        if (status) row.status = status;

        // Rebuild expenses_snapshot if the caller sent a new list.
        // Compute subtotal from existing POV lines so the % base is
        // accurate (lines may be replaced below — that path triggers
        // its own re-snapshot via replaceLinesOnDraft if needed).
        if (Array.isArray(expenses)) {
            const existingLines = await this.povLineRepository.findAll({
                po_vendor_id: row._id.toString(),
            } as any);
            const sub = (existingLines || []).reduce(
                (s, l: any) => s + num(l.line_total),
                0
            );
            row.expenses_snapshot = await this.buildExpensesSnapshot(
                companyId,
                expenses,
                sub
            );
        }

        await this.povRepository.save(row);

        // ── Replace-on-update for lines (DRAFT only - already gated) ────
        if (Array.isArray(lines) && fromStatus === ENUM_PO_VENDOR_STATUS.DRAFT) {
            await this.replaceLinesOnDraft(
                companyId,
                row._id.toString(),
                row.purchase_order_id.toString(),
                (row as any).vendor_id?.toString(),
                lines
            );
        }

        // ── GST rate patch (DRAFT only — gated by the allowlist above) ──
        //
        // In place, by POV line id. NOT via `replaceLinesOnDraft`: that deletes
        // and recreates every line, which is destructive for a one-number change
        // and impossible for a standalone POV (its lines have no
        // purchase_order_line_id, which that path demands).
        //
        // Only the RATE is written. `line_total` stays qty × price with no tax in
        // it, and the PDF derives the GST amount from the rate at render time —
        // so there is no stored amount that could fall out of sync.
        //
        // `unit_price` follows the same in-place route (client #3: "prices can
        // be revised when suppliers update their rates after the PO has been
        // created"). Unlike the GST rate it stays editable once DISPATCHED —
        // but only until a GRN exists, because a receipt bakes the cost into
        // stock valuation. Changing it recomputes line_total, the % vendor
        // charges and the payment status.
        const lineEdits = (line_edits ?? line_taxes) as any[] | undefined;
        if (Array.isArray(lineEdits) && lineEdits.length > 0) {
            const povLines = await this.povLineRepository.findAll({
                po_vendor_id: row._id.toString(),
            } as any);
            const byId = new Map<string, any>(
                (povLines as any[]).map(l => [l._id.toString(), l])
            );

            const wantsPrice = lineEdits.some(
                p => p.unit_price != null && p.unit_price !== ''
            );
            const wantsTax = lineEdits.some(
                p => p.tax_pct != null && p.tax_pct !== ''
            );
            // `!= null` only — '' is a real value for these two (clear the
            // field), unlike the numeric ones where '' means "not sent".
            const wantsDescriptive = lineEdits.some(
                p => p.hsn_code != null || p.part_no != null
            );
            const isDraft = fromStatus === ENUM_PO_VENDOR_STATUS.DRAFT;

            if (wantsTax && !isDraft) {
                throw new BadRequestException(
                    `POV is ${fromStatus}. The GST rate is frozen once the PO is with the vendor — only the rate can be revised.`
                );
            }
            // Both print on the vendor PDF, so they freeze with it.
            if (wantsDescriptive && !isDraft) {
                throw new BadRequestException(
                    `POV is ${fromStatus}. HSN and part number are frozen once the PO is with the vendor — only the rate can be revised.`
                );
            }
            // A GRN means the goods are already costed into stock; re-pricing
            // afterwards would silently misstate that valuation.
            if (wantsPrice && !isDraft) {
                const deps = await this.dependencyCheckService.check(
                    'po_vendor',
                    row._id.toString()
                );
                const grn = deps.dependents.find(d => d.label === 'GRN');
                if (grn) {
                    throw new BadRequestException(
                        `Prices cannot be revised — this POV already has ${grn.count} GRN${
                            grn.count > 1 ? 's' : ''
                        }. Raise a Debit Note for the difference instead.`
                    );
                }
            }

            let priceChanges = 0;
            for (const patch of lineEdits) {
                const line = byId.get(String(patch._id));
                // Refuse a line id from a different POV rather than silently
                // ignoring it — a caller sending the wrong id should hear about it.
                if (!line) {
                    throw new BadRequestException(
                        `Line ${patch._id} does not belong to this POV.`
                    );
                }
                if (patch.tax_pct != null && patch.tax_pct !== '') {
                    const pct = num(patch.tax_pct);
                    if (pct < 0 || pct > 100) {
                        throw new BadRequestException(
                            `tax_pct must be between 0 and 100 (line ${patch._id}).`
                        );
                    }
                    line.tax_pct = String(pct);
                }
                if (patch.unit_price != null && patch.unit_price !== '') {
                    const price = num(patch.unit_price);
                    if (price < 0) {
                        throw new BadRequestException(
                            `unit_price cannot be negative (line ${patch._id}).`
                        );
                    }
                    if (price !== num(line.unit_price)) priceChanges += 1;
                    line.unit_price = String(price);
                    // line_total is qty × price with NO tax in it — the PDF
                    // derives GST from tax_pct at render time.
                    line.line_total = String(
                        round2(num(line.ordered_qty) * price)
                    );
                }
                // Descriptive fields: `!= null` is the test, so an empty string
                // clears the field. Stored as null rather than '' to match how
                // every other write path leaves them.
                if (patch.hsn_code != null) {
                    line.hsn_code = String(patch.hsn_code).trim() || null;
                }
                if (patch.part_no != null) {
                    line.part_no = String(patch.part_no).trim() || null;
                }
                await this.povLineRepository.save(line);
            }

            if (priceChanges > 0) {
                // Percentage vendor charges are a % OF THE SUBTOTAL, so they
                // must be re-derived from the new line totals; then the payable
                // and payment status follow.
                await this.resnapshotExpensesFromLines(row);
                await this.applyPaymentDerived(row);
                if (userId) {
                    await this.emitSystemEvent(
                        companyId,
                        row._id.toString(),
                        ENUM_TRACKING_EVENT_TYPE.POV_UPDATED,
                        userId,
                        `Vendor rate revised on ${priceChanges} line(s)`
                    );
                }
            }
            this.logger.log(
                `POV ${row._id}: ${lineEdits.length} line(s) patched (${priceChanges} price change(s))`
            );
        }

        this.logger.log(`POV updated: ${row._id}`);
        if ((deliveryChanged || linesChanged) && userId) {
            const summaryBits: string[] = [];
            if (deliveryChanged) summaryBits.push('delivery address');
            if (linesChanged) summaryBits.push('lines');
            await this.emitSystemEvent(
                companyId,
                row._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_UPDATED,
                userId,
                `Updated: ${summaryBits.join(', ')}`
            );
        }
        return this.povRepository.findOneById(row._id.toString());
    }

    /**
     * Re-derive `expenses_snapshot` from the POV's CURRENT line totals, keeping
     * each charge's own rule (`type` + `value`) so a percentage charge tracks a
     * changed subtotal. Called after a vendor-rate revision.
     */
    private async resnapshotExpensesFromLines(row: PoVendorDoc): Promise<void> {
        const snap = ((row as any).expenses_snapshot || []) as any[];
        if (!snap.length) return;
        const povLines = await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any);
        const subtotal = (povLines as any[]).reduce(
            (s, l) => s + num(l.line_total),
            0
        );
        row.expenses_snapshot = (await this.buildExpensesSnapshot(
            row.company_id.toString(),
            snap.map(e => ({
                expense_id: e.expense_id,
                type: e.type,
                value: e.value,
                gst_pct: e.gst_pct,
            })),
            subtotal
        )) as any;
        await this.povRepository.save(row);
    }

    private async replaceLinesOnDraft(
        companyId: string,
        povId: string,
        purchaseOrderId: string,
        povVendorId: string | undefined,
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
            if (
                povVendorId &&
                poLine.vendor_id &&
                poLine.vendor_id.toString() !== povVendorId
            ) {
                throw new BadRequestException(
                    `PO line ${ln.purchase_order_line_id} belongs to a different vendor and cannot be added to this POV.`
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
            // The caller's rate wins, the SO line is the fallback — mirroring
            // the create path, so a vendor rate revision survives a lines
            // replace instead of silently reverting to the SO's figure.
            const unitPrice =
                ln.unit_price != null && ln.unit_price !== ''
                    ? num(ln.unit_price)
                    : num(poLine.unit_price);
            await this.povLineRepository.create({
                company_id: companyId,
                po_vendor_id: povId,
                purchase_order_line_id: ln.purchase_order_line_id,
                product_id: poLine.product_id?.toString(),
                description: poLine.description || null,
                part_no: poLine.part_no || null,
                hsn_code: poLine.hsn_code || null,
                unit: poLine.unit || null,
                // GST rate: the operator's edit wins, the PO line is the
                // fallback. This used to take the PO line unconditionally, so a
                // rate typed on a draft POV was silently discarded on save —
                // the edit appeared to work and changed nothing.
                //
                // Only the RATE is stored. `line_total` below stays qty × price
                // with no tax in it, and the PDF derives the GST amount from this
                // rate at render time — so changing the rate updates every
                // downstream figure automatically, with nothing to keep in sync.
                tax_pct:
                    ln.tax_pct != null && ln.tax_pct !== ''
                        ? String(num(ln.tax_pct))
                        : String(poLine.tax_pct || '0'),
                unit_price: String(unitPrice),
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
        data: PoVendorDispatchRequestDto,
        userId?: string
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

        // Apply: write dispatched_qty for each line. Track shortfall
        // (ordered − dispatched) to surface in the system event.
        let totalShort = 0;
        let shortLineCount = 0;
        for (const dl of data.lines) {
            const ln = lineById.get(dl._id);
            const dispatched = round4(num(dl.dispatched_qty));
            const ordered = round4(num(ln.ordered_qty));
            const short = round4(ordered - dispatched);
            if (short > 1e-6) {
                totalShort += short;
                shortLineCount += 1;
            }
            ln.dispatched_qty = String(dispatched);
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
        if (userId) {
            const transportBits: string[] = [];
            if (data.lr_no) transportBits.push(`LR# ${data.lr_no}`);
            if (data.vehicle_no) transportBits.push(data.vehicle_no);
            if (data.transporter_name)
                transportBits.push(data.transporter_name);
            const parts: string[] = [`Dispatched on ${data.dispatch_date}`];
            if (transportBits.length) parts.push(transportBits.join(' · '));
            if (totalShort > 0) {
                parts.push(
                    `Under-dispatched by ${round4(totalShort)} across ${shortLineCount} line(s) — returned to PO pending for re-procurement.`
                );
                if (data.short_reason) {
                    parts.push(`Reason: ${data.short_reason}`);
                }
            }
            await this.emitSystemEvent(
                row.company_id.toString(),
                row._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_DISPATCHED,
                userId,
                parts.join(' · ')
            );
        }
        return this.povRepository.findOneById(row._id.toString());
    }

    // ─── Action: Edit Dispatch (correct transport / qty after dispatch) ──

    /**
     * Re-edit a DISPATCHED POV's transport details and per-line
     * `dispatched_qty`. `dispatched_qty` is kept within
     * [received_qty, ordered_qty] — you cannot claim you shipped less than
     * what has already been received via GRN, nor more than was ordered.
     * Status stays `dispatched`; any change to the shortfall
     * (`ordered − dispatched`) re-flows to the parent PO's pending qty
     * automatically (pending is derived from dispatched_qty).
     */
    async editDispatch(
        row: PoVendorDoc,
        data: PoVendorDispatchRequestDto,
        userId?: string
    ): Promise<PoVendorDoc> {
        if (row.status !== ENUM_PO_VENDOR_STATUS.DISPATCHED) {
            throw new BadRequestException(
                `Only dispatched POVs can have their dispatch edited (current status: ${row.status}).`
            );
        }

        const lines = await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any);
        const lineById = new Map<string, any>();
        for (const l of lines as any[]) lineById.set(l._id.toString(), l);

        // Validate every provided line: dispatched_qty within
        // [received_qty, ordered_qty], no duplicates, belongs to this POV.
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
            const received = num(ln.received_qty);
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
            if (req < received - 1e-6) {
                throw new BadRequestException(
                    `dispatched_qty (${req}) cannot be less than already received (${round4(
                        received
                    )}) on line ${dl._id}.`
                );
            }
        }

        // Apply per-line dispatched_qty; track shortfall for the event.
        let totalShort = 0;
        let shortLineCount = 0;
        for (const dl of data.lines) {
            const ln = lineById.get(dl._id);
            const dispatched = round4(num(dl.dispatched_qty));
            const ordered = round4(num(ln.ordered_qty));
            const short = round4(ordered - dispatched);
            if (short > 1e-6) {
                totalShort += short;
                shortLineCount += 1;
            }
            ln.dispatched_qty = String(dispatched);
            await this.povLineRepository.save(ln);
        }

        // Apply header fields — status stays DISPATCHED.
        if (data.dispatch_date !== undefined)
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

        await this.povRepository.save(row);
        this.logger.log(`POV dispatch edited: ${row._id}`);
        if (userId) {
            const parts: string[] = ['Dispatch details edited'];
            const transportBits: string[] = [];
            if (data.lr_no) transportBits.push(`LR# ${data.lr_no}`);
            if (data.vehicle_no) transportBits.push(data.vehicle_no);
            if (data.transporter_name)
                transportBits.push(data.transporter_name);
            if (transportBits.length) parts.push(transportBits.join(' · '));
            if (totalShort > 0) {
                parts.push(
                    `Under-dispatched by ${round4(totalShort)} across ${shortLineCount} line(s) — returned to PO pending.`
                );
            }
            await this.emitSystemEvent(
                row.company_id.toString(),
                row._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_UPDATED,
                userId,
                parts.join(' · ')
            );
        }
        return this.povRepository.findOneById(row._id.toString());
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
        reason?: string,
        userId?: string
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
        if (userId) {
            await this.emitSystemEvent(
                row.company_id.toString(),
                row._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_CANCELLED,
                userId,
                reason ? `Cancelled: ${reason}` : 'Cancelled'
            );
        }
        return this.povRepository.findOneById(row._id.toString());
    }

    /**
     * Revert a CANCELLED POV back to DRAFT. Only permitted when the POV had
     * no dispatch/receipt activity and its ordered quantities still fit the
     * PO line pending (i.e. they weren't re-issued on another POV after the
     * cancel). Symmetric to cancel(): pending is computed dynamically, so no
     * PO recompute is needed.
     */
    async revertToDraft(
        row: PoVendorDoc,
        userId?: string
    ): Promise<PoVendorDoc> {
        if (row.status !== ENUM_PO_VENDOR_STATUS.CANCELLED) {
            throw new BadRequestException(
                `Only a cancelled POV can be reverted to draft (current: ${row.status}).`
            );
        }
        const lines = (await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any)) as any[];

        // Block if the POV ever had dispatch/receipt activity — those qty
        // movements are part of the immutable audit trail.
        const hadActivity = lines.some(
            l => num(l.dispatched_qty) > 0 || num(l.received_qty) > 0
        );
        if (hadActivity) {
            throw new BadRequestException(
                'This POV had dispatch or receipt activity and cannot be reverted to draft.'
            );
        }

        // Re-validate availability. computePendingByPoLineId already excludes
        // cancelled POVs (including this one), so the returned pending is the
        // headroom available if we re-activate this POV's lines.
        const pending = await this.computePendingByPoLineId(
            row.purchase_order_id.toString()
        );
        const over: string[] = [];
        for (const ln of lines) {
            const req = num(ln.ordered_qty);
            const avail = pending.get(ln.purchase_order_line_id) || 0;
            if (req > avail + 1e-6) {
                over.push(
                    `${ln.product_name || ln.purchase_order_line_id} ` +
                        `(need ${round4(req)}, available ${round4(avail)})`
                );
            }
        }
        if (over.length) {
            throw new BadRequestException(
                'Cannot revert to draft — these quantities have been ' +
                    `re-issued on other POVs: ${over.join('; ')}.`
            );
        }

        row.status = ENUM_PO_VENDOR_STATUS.DRAFT;
        row.internal_notes =
            (row.internal_notes || '') + '\n[Reverted to draft]';
        await this.povRepository.save(row);
        this.logger.log(`POV reverted to draft: ${row._id}`);
        if (userId) {
            await this.emitSystemEvent(
                row.company_id.toString(),
                row._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_UPDATED,
                userId,
                'Reverted to draft'
            );
        }
        return this.povRepository.findOneById(row._id.toString());
    }

    // ─── Vendor payments ────────────────────────────────────────────────

    /**
     * Live "Order Value (Payable)" for a POV in its own currency, matching the
     * vendor PO total on the PDF: Σ line_total + vendor charges
     * (expenses_snapshot) + GST (per product tax_pct, charges sharing GST
     * proportionally). Rounded to a whole unit like the PDF grand total.
     * Keep in sync with po-vendor-pdf.service buildContext().
     */
    async computeOrderValue(row: PoVendorDoc): Promise<number> {
        const lines = (await this.povLineRepository.findAll({
            po_vendor_id: row._id.toString(),
        } as any)) as any[];
        const linesInr = lines.reduce((s, l) => s + num(l.line_total), 0);
        const expensesSnapshot: any[] = Array.isArray(
            (row as any).expenses_snapshot
        )
            ? (row as any).expenses_snapshot
            : [];
        const chargesInr = expensesSnapshot.reduce(
            (s, e) => s + num(e.amount),
            0
        );
        const productIds = unique(lines.map((l) => l.product_id?.toString()));
        const taxByProduct = new Map<string, number>();
        if (productIds.length) {
            const products: any[] = await this.productRepository.findAll({
                _id: { $in: productIds },
            } as any);
            for (const p of products)
                taxByProduct.set(p._id.toString(), num(p.tax_pct));
        }
        const chargesPct = linesInr > 0 ? chargesInr / linesInr : 0;
        let gstInr = 0;
        for (const l of lines) {
            const taxPct = taxByProduct.get(l.product_id?.toString()) || 0;
            gstInr += (num(l.line_total) * (1 + chargesPct) * taxPct) / 100;
        }
        // POV is in home currency (exchange_rate = 1); round to a whole unit to
        // match the PDF grand total.
        return Math.round(linesInr + chargesInr + gstInr);
    }

    async listPayments(poVendorId: string): Promise<PoVendorPaymentDoc[]> {
        return this.povPaymentRepository.findActiveByPoVendorId(poVendorId);
    }

    /**
     * Record a vendor payment (advance or part-payment). Allowed in any
     * non-cancelled status (incl. draft). Blocks over-payment beyond the
     * current outstanding balance. Stamps a stable PV voucher number.
     */
    async recordPayment(
        row: PoVendorDoc,
        data: PoVendorPaymentCreateRequestDto,
        userId: string
    ): Promise<PoVendorPaymentDoc> {
        if (row.status === ENUM_PO_VENDOR_STATUS.CANCELLED) {
            throw new BadRequestException(
                'Cannot record a payment on a cancelled vendor PO.'
            );
        }
        const amount = num(data.amount);
        if (amount <= 0) {
            throw new BadRequestException('Payment amount must be > 0.');
        }

        // ── TDS (Gross → TDS → Net) ──
        // `amount` is GROSS (settles the vendor in full). Prefer the UI's
        // rounded tds_amount; else derive from the rate. Net = Gross − TDS.
        const tdsRate = num(data.tds_rate_pct);
        const tdsAmount =
            data.tds_amount != null && data.tds_amount !== ''
                ? round2(num(data.tds_amount))
                : round2((amount * tdsRate) / 100);
        if (tdsAmount < 0) {
            throw new BadRequestException('TDS amount cannot be negative.');
        }
        if (tdsAmount > amount) {
            throw new BadRequestException(
                'TDS cannot exceed the gross payment amount.'
            );
        }
        const netPaid = round2(amount - tdsAmount);

        // ── Paying company bank account — freeze a snapshot for the voucher ──
        let bankSnapshot: any = undefined;
        if (data.company_bank_account_id) {
            const bank: any = await this.companyBankAccountRepository.findOneById(
                data.company_bank_account_id
            );
            if (
                !bank ||
                bank.soft_delete ||
                bank.company_id?.toString() !== row.company_id.toString()
            ) {
                throw new BadRequestException(
                    'Selected company bank account was not found.'
                );
            }
            bankSnapshot = {
                bank_name: bank.bank_name,
                account_holder_name: bank.account_holder_name,
                account_number: bank.account_number,
                ifsc: bank.ifsc,
                branch_name: bank.branch_name,
                account_type: bank.account_type,
            };
        }
        // NOTE: overpayment is intentionally allowed (vendor advances, rounding,
        // FX drift). We no longer block when prior + amount exceeds the order
        // value — applyPaymentDerived flags the POV as `overpaid` instead and
        // the UI surfaces a warning + negative balance.

        // Stable payment voucher number (STIPL/PV/0001/FY) at creation, so the
        // printable voucher keeps a fixed reference even if later voided.
        const prefix = await this.resolveCompanyPrefix(
            row.company_id.toString()
        );
        const paymentVoucherNo = await this.voucherService.getNext(
            row.company_id.toString(),
            ENUM_VOUCHER_DOC_TYPE.PAYMENT_VOUCHER,
            prefix,
            new Date(data.payment_date)
        );

        const payment = await this.povPaymentRepository.create({
            po_vendor_id: row._id.toString(),
            company_id: row.company_id.toString(),
            payment_date: data.payment_date,
            amount: data.amount,
            currency_code: row.currency_code,
            invoice_number: data.invoice_number,
            notes: data.notes,
            company_bank_account_id: data.company_bank_account_id || null,
            company_bank_snapshot: bankSnapshot || null,
            tds_section: data.tds_section || null,
            tds_rate_pct: String(tdsRate),
            tds_amount: String(tdsAmount),
            net_paid: String(netPaid),
            payment_voucher_no: paymentVoucherNo,
            created_by: userId,
        } as any);

        await this.applyPaymentDerived(row);
        this.logger.log(`POV ${row._id} payment recorded: ${data.amount}`);
        await this.emitSystemEvent(
            row.company_id.toString(),
            row._id.toString(),
            ENUM_TRACKING_EVENT_TYPE.POV_PAYMENT_RECORDED,
            userId,
            `${row.currency_code || 'INR'} ${round2(
                amount
            )} recorded (${paymentVoucherNo})${
                data.invoice_number
                    ? ` against invoice ${data.invoice_number}`
                    : ''
            }`
        );
        return payment;
    }

    /** Soft-void a payment (kept for audit) and recompute the POV balance. */
    async voidPayment(
        poVendorId: string,
        paymentId: string,
        userId: string,
        reason?: string
    ): Promise<void> {
        const p: any = await this.povPaymentRepository.findOneById(paymentId);
        if (!p || p.soft_delete || p.po_vendor_id?.toString() !== poVendorId) {
            throw new NotFoundException('Payment not found');
        }
        if (p.voided_at) {
            throw new BadRequestException('Payment is already voided.');
        }
        p.voided_at = new Date();
        p.voided_by = userId;
        p.voided_reason = reason;
        await this.povPaymentRepository.save(p);

        const pov = await this.povRepository.findOneById(poVendorId);
        if (pov) {
            await this.applyPaymentDerived(pov);
            await this.emitSystemEvent(
                pov.company_id.toString(),
                pov._id.toString(),
                ENUM_TRACKING_EVENT_TYPE.POV_PAYMENT_VOIDED,
                userId,
                reason
                    ? `${p.payment_voucher_no} voided: ${reason}`
                    : `${p.payment_voucher_no} voided`
            );
        }
    }

    /**
     * Refresh amount_paid + payment_status from the current sum of active
     * payments vs the live order value. Runs independently of the dispatch
     * `status`; never touches it.
     */
    private async applyPaymentDerived(row: PoVendorDoc): Promise<void> {
        const paid = await this.povPaymentRepository.sumActiveByPoVendorId(
            row._id.toString()
        );
        // Adjustment Notes linked to this POV settle it alongside cash: a
        // vendor Debit note ("reduce the bill") lowers the payable, a Credit
        // note raises it. Voided notes drop out, so a void reverses.
        const adj = sumAdjustmentEffect(
            (await this.adjustmentNoteRepository.findByDocumentId(
                row._id.toString()
            )) as any[]
        );
        const orderValue = await this.computeOrderValue(row);
        const settled = round2(paid + adj);
        row.amount_paid = String(round2(paid));
        row.adjustment_total = String(adj);
        row.payment_status = this.derivePaymentStatus(settled, orderValue);
        await this.povRepository.save(row);
    }

    /**
     * Payment status from the SETTLED figure (cash + linked adjustment notes)
     * against the live order value. Shared by applyPaymentDerived and mapList
     * so the stored status and the listed one can never disagree.
     */
    private derivePaymentStatus(
        settled: number,
        orderValue: number
    ): ENUM_PO_VENDOR_PAYMENT_STATUS {
        if (settled <= 1e-2) return ENUM_PO_VENDOR_PAYMENT_STATUS.UNPAID;
        if (settled - orderValue > 1e-2)
            return ENUM_PO_VENDOR_PAYMENT_STATUS.OVERPAID;
        if (orderValue - settled <= 1e-2)
            return ENUM_PO_VENDOR_PAYMENT_STATUS.PAID;
        return ENUM_PO_VENDOR_PAYMENT_STATUS.PARTIALLY_PAID;
    }

    /**
     * Re-derive payable + status after an Adjustment Note linked to this POV is
     * created or voided. Called by AdjustmentNoteService.
     */
    async recomputeAfterAdjustment(poVendorId: string): Promise<void> {
        const row = await this.povRepository.findOneById(poVendorId);
        if (!row || row.soft_delete) return;
        await this.applyPaymentDerived(row);
    }

    // ─── Hydration / mappers ────────────────────────────────────────────

    async mapList(rows: PoVendorDoc[]): Promise<PoVendorGetResponseDto[]> {
        if (!rows.length) return [];

        const povIds = rows.map(r => r._id.toString());
        const poIds = unique(rows.map(r => (r as any).purchase_order_id?.toString()));
        const vendorIds = unique(rows.map(r => (r as any).vendor_id?.toString()));

        // Company default POV remarks — the PDF fallback when a POV has no
        // `notes`. Single-tenant: all rows share one company, so fetch once.
        let companyPovRemarks = '';
        try {
            const cid = (rows[0] as any)?.company_id?.toString();
            if (cid) {
                const co: any = await this.companyService.findOneById(cid);
                companyPovRemarks =
                    co?.pov_default_remarks || co?.default_remarks || '';
            }
        } catch {
            /* graceful — leave blank */
        }

        const allLines = await this.povLineRepository.findAll({
            po_vendor_id: { $in: povIds },
        } as any);

        const allPayments = await this.povPaymentRepository.findAll({
            po_vendor_id: { $in: povIds },
            soft_delete: false,
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
        const paymentsByPov = new Map<string, any[]>();
        for (const p of allPayments as any[]) {
            const k = p.po_vendor_id?.toString();
            if (!k) continue;
            if (!paymentsByPov.has(k)) paymentsByPov.set(k, []);
            paymentsByPov.get(k).push(p);
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
                    hsn_code: l.hsn_code || (product as any)?.hsn_code || undefined,
                    part_no: l.part_no || (product as any)?.part_no || undefined,
                    unit: l.unit || undefined,
                    tax_pct: String(l.tax_pct ?? '0'),
                    unit_price: String(l.unit_price ?? '0'),
                    ordered_qty: String(ordered),
                    dispatched_qty: String(dispatched),
                    received_qty: String(received),
                    undispatched_qty: String(round4(ordered - dispatched)),
                    // Short = dispatched goods that never arrived (a real
                    // loss). Only knowable once a receipt exists — before the
                    // first GRN the whole dispatch is in transit, not short.
                    short_qty: String(
                        received > 0 ? round4(dispatched - received) : 0
                    ),
                    line_total: String(l.line_total ?? '0'),
                    seq: Number(l.seq || 0),
                };
            });

            // ── Live payable (matches the PDF grand total) + payment roll-up ──
            const expensesSnap: any[] = Array.isArray(r.expenses_snapshot)
                ? r.expenses_snapshot
                : [];
            const linesInr = linesRaw.reduce(
                (s, l) => s + num(l.line_total),
                0
            );
            const chargesInr = expensesSnap.reduce(
                (s, e) => s + num(e.amount),
                0
            );
            let gstInr = 0;
            for (const l of linesRaw) {
                // Line's own tax_pct wins (standalone POVs set GST per line);
                // fall back to the product master — same rule as the POV PDF.
                const taxPct =
                    num((l as any).tax_pct) ||
                    num(
                        (productMap.get(l.product_id?.toString()) as any)
                            ?.tax_pct
                    );
                gstInr += (num(l.line_total) * taxPct) / 100; // goods GST
            }
            // Per-charge GST (operator-entered gst_pct on each charge) — charges
            // are taxed by their own rate, not folded into the goods GST.
            const chargeGstInr = expensesSnap.reduce(
                (s, e) => s + (num(e.amount) * num(e.gst_pct)) / 100,
                0
            );
            const orderValue = Math.round(
                linesInr + chargesInr + gstInr + chargeGstInr
            );
            const amountPaid = round2(num(r.amount_paid));
            // Linked Adjustment Notes settle the POV alongside cash.
            const adjustmentTotal = round2(num((r as any).adjustment_total));
            const settled = round2(amountPaid + adjustmentTotal);
            // Goes negative when the vendor has been overpaid — the FE shows
            // that as an "Overpaid" amount rather than a payable.
            const balancePayable = round2(orderValue - settled);
            const paymentStatus = this.derivePaymentStatus(settled, orderValue);
            const payments = (paymentsByPov.get(r._id.toString()) || [])
                .slice()
                .sort((a, b) =>
                    String(a.payment_date).localeCompare(String(b.payment_date))
                )
                .map((p: any) => ({
                    _id: p._id.toString(),
                    payment_date: p.payment_date,
                    amount: String(p.amount ?? '0'),
                    currency_code: p.currency_code || undefined,
                    invoice_number: p.invoice_number || undefined,
                    notes: p.notes || undefined,
                    company_bank_account_id:
                        p.company_bank_account_id?.toString() || undefined,
                    company_bank_snapshot: p.company_bank_snapshot || undefined,
                    tds_section: p.tds_section || undefined,
                    tds_rate_pct: String(p.tds_rate_pct ?? '0'),
                    tds_amount: String(p.tds_amount ?? '0'),
                    net_paid: String(p.net_paid ?? p.amount ?? '0'),
                    payment_voucher_no: p.payment_voucher_no || undefined,
                    voided_at: p.voided_at || undefined,
                    voided_reason: p.voided_reason || undefined,
                    createdAt: p.createdAt,
                }));

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
                vendor_contact_country_code: this.buildContactCountryCode(vc),
                vendor_address_id: r.vendor_address_id?.toString(),

                dispatch_date: r.dispatch_date || undefined,
                expected_arrival_date: r.expected_arrival_date || undefined,
                actual_arrival_date: r.actual_arrival_date || undefined,

                dispatched_through:
                    (r as any).dispatched_through || undefined,
                payment_terms: (r as any).payment_terms || undefined,
                delivery_terms: (r as any).delivery_terms || undefined,

                transporter_name: r.transporter_name || undefined,
                vehicle_no: r.vehicle_no || undefined,
                lr_no: r.lr_no || undefined,
                lr_date: r.lr_date || undefined,
                eway_bill_no: r.eway_bill_no || undefined,
                eway_bill_date: r.eway_bill_date || undefined,

                delivery_address: r.delivery_address,
                delivery_address_id: r.delivery_address_id?.toString(),
                notes: r.notes || undefined,
                effective_remarks:
                    r.notes || companyPovRemarks || undefined,
                internal_notes: r.internal_notes || undefined,

                currency_code: r.currency_code || 'INR',
                currency_symbol: getCurrencySymbol(r.currency_code || 'INR'),
                exchange_rate: String(r.exchange_rate ?? '1'),

                status: r.status,

                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,

                lines,
                expenses_snapshot:
                    Array.isArray((r as any).expenses_snapshot)
                        ? (r as any).expenses_snapshot
                        : [],

                order_value: String(orderValue),
                // The GST already folded into order_value, surfaced on its own
                // so the Input-Output GST report can read it instead of
                // re-deriving the product-master fallback + jsonb charge rates.
                gst_inr: String(round2(gstInr + chargeGstInr)),
                amount_paid: String(amountPaid),
                adjustment_total: String(adjustmentTotal),
                balance_payable: String(balancePayable),
                payment_status: paymentStatus,
                payments,
            });
        }
        return out;
    }

    async mapGet(row: PoVendorDoc): Promise<PoVendorGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        // Detail-page only — balancePlan() costs a few queries per row, so it
        // deliberately does not run in mapList.
        mapped.has_balance = await this.hasBalance(row as any);
        mapped.balance_of_po_vendor_id = (
            row as any
        ).balance_of_po_vendor_id?.toString();
        return mapped;
    }

    /**
     * Count-by-status stats for the POV list tiles. Count-only (POV has no
     * header amount; value is line-summed) — mirrors the list filters.
     */
    async stats(
        companyId: string,
        filters: {
            purchase_order_id?: string;
            vendor_id?: string;
            status?: string | string[];
            date_from?: string;
            date_to?: string;
            search?: string;
        },
        creator?: undefined | string | string[]
    ): Promise<{ total: number; by_status: Record<string, number> }> {
        const rows = await this.povRepository.aggregate<{
            status: string;
            count: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            CreatorScopeService.applyToQb(qb, creator);
            if (filters.purchase_order_id) {
                qb.andWhere('entity.purchase_order_id = :po', {
                    po: filters.purchase_order_id,
                });
            }
            if (filters.vendor_id) {
                qb.andWhere('entity.vendor_id = :v', { v: filters.vendor_id });
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
            if (filters.date_from) {
                qb.andWhere('entity.dispatch_date >= :df', {
                    df: filters.date_from,
                });
            }
            if (filters.date_to) {
                qb.andWhere('entity.dispatch_date <= :dt', {
                    dt: filters.date_to,
                });
            }
            const searchTerm =
                typeof filters.search === 'string' ? filters.search.trim() : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.lr_no ILIKE :q OR entity.eway_bill_no ILIKE :q)',
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
