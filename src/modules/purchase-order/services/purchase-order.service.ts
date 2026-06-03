import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PurchaseOrderRepository } from '../repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '../repository/repositories/purchase-order-line.repository';
import { PurchaseOrderDoc } from '../repository/entities/purchase-order.entity';
import { PurchaseOrderCreateRequestDto } from '../dtos/request/purchase-order.create.request.dto';
import { PurchaseOrderUpdateRequestDto } from '../dtos/request/purchase-order.update.request.dto';
import {
    PurchaseOrderGetResponseDto,
    PurchaseOrderLineResponseDto,
} from '../dtos/response/purchase-order.get.response.dto';
import { ENUM_PURCHASE_ORDER_STATUS } from '../enums/purchase-order.enum';

import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { VendorAddressRepository } from '@modules/vendor/repository/repositories/vendor-address.repository';
import { VendorContactRepository } from '@modules/vendor/repository/repositories/vendor-contact.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { PfiRepository } from '@modules/pfi/repository/repositories/pfi.repository';
import { PfiLineRepository } from '@modules/pfi/repository/repositories/pfi-line.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { PoVendorService } from '@modules/po-vendor/services/po-vendor.service';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';
import { formatCompanyAddress } from '@modules/company/utils/format-address';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { formatLocationAddress } from '@modules/location/utils/format-address';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Customer-side order reference + advance captured at SO generation (S4). */
type CustomerOrderInput = {
    customer_po_number?: string;
    advance_amount?: string;
    advance_date?: string;
    advance_notes?: string;
};

@Injectable()
export class PurchaseOrderService {
    private readonly logger = new Logger(PurchaseOrderService.name);

    constructor(
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorAddressRepository: VendorAddressRepository,
        private readonly vendorContactRepository: VendorContactRepository,
        private readonly productRepository: ProductRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly locationRepository: LocationRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly pfiRepository: PfiRepository,
        private readonly pfiLineRepository: PfiLineRepository,
        private readonly priceListRepository: PriceListRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly povService: PoVendorService,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        vendorId?: string,
        vendorAddressId?: string
    ): Promise<{ addressMismatched?: boolean } | void> {
        // PO is multi-vendor at line level (2026-05-21); header vendor is
        // optional. Skip vendor validation when not provided.
        if (!vendorId) return undefined;

        const vendor = await this.vendorRepository.findOne({
            _id: vendorId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!vendor) throw new BadRequestException('Vendor not found');

        if (vendorAddressId) {
            const addr = await this.vendorAddressRepository.findOne({
                _id: vendorAddressId,
                vendor_id: vendorId,
                soft_delete: false,
            } as any);
            if (!addr) return { addressMismatched: true };
        }
        return undefined;
    }

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company = await this.companyService.findOneById(companyId);
        const explicit = (company as any)?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        const fallback =
            (company as any)?.company_name
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO';
        return fallback;
    }

    private async resolveVendorAddressId(
        vendorId: string | undefined,
        provided?: string
    ): Promise<string | null> {
        if (provided) return provided;
        if (!vendorId) return null;
        const addresses = await this.vendorAddressRepository.findAll({
            vendor_id: vendorId,
            soft_delete: false,
        } as any);
        if (!addresses?.length) return null;
        const def =
            (addresses as any[]).find(a => a.is_default) || addresses[0];
        return def?._id?.toString() || null;
    }

    /**
     * Resolve the PO delivery address snapshot.
     * Priority:
     *  1. `providedText` (raw text override) - used as-is, no id.
     *  2. `providedAddressId` (company_addresses._id) - load row, format
     *     via `formatCompanyAddress`, return `{ text, id }`.
     *  3. Else → throw (caller must provide one or the other).
     *
     * Legacy `company.default_po_delivery_address` is intentionally NOT
     * consulted - that column is being dropped (refactor plan).
     */
    private async resolveDeliveryAddress(
        companyId: string,
        providedText?: string,
        providedAddressId?: string
    ): Promise<{ text: string; id?: string }> {
        if (providedText && providedText.trim()) {
            return { text: providedText.trim() };
        }
        if (providedAddressId) {
            // Ship-to is now sourced from `locations` (2026-05-22).
            // Fallback to legacy `company_addresses` lookup for existing
            // rows whose id still points there.
            const loc: any = await this.locationRepository.findOne({
                _id: providedAddressId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (loc) {
                return {
                    text: formatLocationAddress(loc),
                    id: providedAddressId,
                };
            }
            const addr: any = await this.companyAddressRepository.findOne({
                _id: providedAddressId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (addr) {
                return {
                    text: formatCompanyAddress(addr),
                    id: providedAddressId,
                };
            }
            throw new BadRequestException(
                `delivery_address_id ${providedAddressId} not found in locations or company addresses.`
            );
        }
        throw new BadRequestException(
            'delivery_address_id is required. Pick a location or supply delivery_address text.'
        );
    }

    // ─── CRUD ───────────────────────────────────────────────────────────

    async create(
        companyId: string,
        data: PurchaseOrderCreateRequestDto,
        createdBy: string
    ): Promise<PurchaseOrderDoc> {
        // Customer required for ad-hoc POs (those with no source PFI /
        // Quotation). createFromPfi / createFromQuotation paths inject
        // customer_id server-side before reaching here.
        if (!data.pfi_id && !data.quotation_id && !data.customer_id) {
            throw new BadRequestException(
                'customer_id is required for ad-hoc Purchase Orders.'
            );
        }

        const refsOut = await this.assertReferences(
            companyId,
            data.vendor_id,
            data.vendor_address_id
        );
        if ((refsOut as any)?.addressMismatched) {
            data.vendor_address_id = undefined;
        }

        const vendorAddressId = await this.resolveVendorAddressId(
            data.vendor_id,
            data.vendor_address_id
        );
        const delivery = await this.resolveDeliveryAddress(
            companyId,
            data.delivery_address,
            (data as any).delivery_address_id
        );

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.PURCHASE_ORDER,
            prefix
        );

        const header = await this.poRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            vendor_id: data.vendor_id,
            vendor_address_id: vendorAddressId,
            customer_id: data.customer_id || null,
            customer_address_id: (data as any).customer_address_id || null,
            consignee_id: (data as any).consignee_id || null,
            consignee_snapshot: (data as any).consignee_snapshot || null,
            quotation_id: data.quotation_id || null,
            pfi_id: data.pfi_id || null,
            po_date: data.po_date,
            expected_delivery_date: data.expected_delivery_date || null,
            customer_po_number: (data as any).customer_po_number || null,
            advance_amount: (data as any).advance_amount ?? '0',
            advance_date: (data as any).advance_date || null,
            advance_notes: (data as any).advance_notes || null,
            delivery_address: delivery.text,
            delivery_address_id: delivery.id || null,
            payment_terms: data.payment_terms || null,
            delivery_terms: data.delivery_terms || null,
            notes_to_vendor: data.notes_to_vendor || null,
            internal_notes: data.internal_notes || null,
            currency_code: data.currency_code || 'INR',
            exchange_rate: data.exchange_rate || '1',
            status: data.status || ENUM_PURCHASE_ORDER_STATUS.DRAFT,
        } as any);

        await this.replaceLines(companyId, header._id.toString(), data.lines);
        await this.recompute(header._id.toString(), companyId);

        this.logger.log(`PO created: ${header._id} (${voucher_no})`);
        return this.poRepository.findOneById(header._id.toString());
    }

    async findOneById(id: string): Promise<PurchaseOrderDoc> {
        const row = await this.poRepository.findOne({
            _id: id,
            soft_delete: false,
        } as any);
        if (!row) throw new NotFoundException('Purchase Order not found');
        return row;
    }

    // ─── Public share link ──────────────────────────────────────────────

    /** Generate (or keep) the public token. Only confirmed/in_process/
     *  completed POs can be published — a draft is not final enough. */
    async publish(id: string): Promise<PurchaseOrderDoc> {
        const row = await this.findOneById(id);
        this.assertPublishable(row.status);
        if (!row.public_token) {
            row.public_token = randomBytes(24).toString('base64url');
            await this.poRepository.save(row);
        }
        return row;
    }

    /** Issue a fresh token — the old public URL stops working immediately. */
    async rotateToken(id: string): Promise<PurchaseOrderDoc> {
        const row = await this.findOneById(id);
        this.assertPublishable(row.status);
        row.public_token = randomBytes(24).toString('base64url');
        await this.poRepository.save(row);
        return row;
    }

    /** Revoke the public link entirely. */
    async unpublish(id: string): Promise<PurchaseOrderDoc> {
        const row = await this.findOneById(id);
        row.public_token = null as any;
        await this.poRepository.save(row);
        return row;
    }

    private assertPublishable(status: ENUM_PURCHASE_ORDER_STATUS): void {
        if (status === ENUM_PURCHASE_ORDER_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only confirmed Purchase Orders can be published'
            );
        }
    }

    /** Public view-only fetch by token — no auth. Returns null for an
     *  unknown token or a PO that is no longer in a shareable state. */
    async findByPublicToken(
        token: string
    ): Promise<PurchaseOrderDoc | null> {
        if (!token) return null;
        const row = await this.poRepository.findOne({
            public_token: token,
            soft_delete: false,
        } as any);
        if (!row) return null;
        // Bump view tracking (fire-and-forget — never block the response).
        (row as any).public_view_count =
            ((row as any).public_view_count || 0) + 1;
        (row as any).public_last_viewed_at = new Date();
        this.poRepository
            .save(row)
            .catch((err) =>
                this.logger.warn(`Public view-count update failed: ${err}`)
            );
        return row;
    }

    async update(
        row: PurchaseOrderDoc,
        data: PurchaseOrderUpdateRequestDto
    ): Promise<PurchaseOrderDoc> {
        const companyId = row.company_id.toString();

        // Edit lock - only DRAFT is fully editable. Setting status=DRAFT in
        // the payload lifts the lock for this update (revert-and-edit).
        const willBeDraft =
            data.status === ENUM_PURCHASE_ORDER_STATUS.DRAFT;
        const isLocked =
            row.status !== ENUM_PURCHASE_ORDER_STATUS.DRAFT && !willBeDraft;
        const isStatusOnlyChange = (() => {
            if (!isLocked) return true;
            const allowedKeys = new Set(['status', 'internal_notes']);
            return Object.keys(data || {}).every(
                k =>
                    allowedKeys.has(k) ||
                    (data as any)[k] === undefined
            );
        })();
        if (isLocked && !isStatusOnlyChange) {
            throw new BadRequestException(
                `PO is ${row.status}. Revert to draft to edit fields.`
            );
        }
        if (data.status && data.status !== row.status) {
            this.assertStatusTransitionAllowed(row.status, data.status);
        }

        const refsOut = await this.assertReferences(
            companyId,
            data.vendor_id || row.vendor_id?.toString(),
            data.vendor_address_id ?? row.vendor_address_id?.toString()
        );
        if ((refsOut as any)?.addressMismatched) {
            (data as any).vendor_address_id = null;
        }

        const { lines, ...scalar } = data as any;
        Object.assign(row, scalar);
        await this.poRepository.save(row);

        if (Array.isArray(lines)) {
            await this.replaceLines(companyId, row._id.toString(), lines);
        }

        await this.recompute(row._id.toString(), companyId);
        const refreshed = await this.poRepository.findOneById(
            row._id.toString()
        );

        this.logger.log(`PO updated: ${row._id}`);
        return refreshed;
    }

    private assertStatusTransitionAllowed(
        from: ENUM_PURCHASE_ORDER_STATUS,
        to: ENUM_PURCHASE_ORDER_STATUS
    ): void {
        // Workflow per plan §6:
        //   draft → confirmed → in_process → completed
        //   any non-terminal → cancelled
        //   any locked status → draft (revert-and-edit)
        const map: Record<string, ENUM_PURCHASE_ORDER_STATUS[]> = {
            [ENUM_PURCHASE_ORDER_STATUS.DRAFT]: [
                ENUM_PURCHASE_ORDER_STATUS.CONFIRMED,
                ENUM_PURCHASE_ORDER_STATUS.CANCELLED,
            ],
            [ENUM_PURCHASE_ORDER_STATUS.CONFIRMED]: [
                ENUM_PURCHASE_ORDER_STATUS.DRAFT,
                ENUM_PURCHASE_ORDER_STATUS.IN_PROCESS,
                ENUM_PURCHASE_ORDER_STATUS.CANCELLED,
            ],
            [ENUM_PURCHASE_ORDER_STATUS.IN_PROCESS]: [
                ENUM_PURCHASE_ORDER_STATUS.DRAFT,
                ENUM_PURCHASE_ORDER_STATUS.COMPLETED,
                ENUM_PURCHASE_ORDER_STATUS.CANCELLED,
            ],
            [ENUM_PURCHASE_ORDER_STATUS.COMPLETED]: [
                ENUM_PURCHASE_ORDER_STATUS.DRAFT,
            ],
            [ENUM_PURCHASE_ORDER_STATUS.CANCELLED]: [
                ENUM_PURCHASE_ORDER_STATUS.DRAFT,
            ],
        };
        const allowed = map[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition PO from ${from} to ${to}.`
            );
        }
    }

    async softDelete(row: PurchaseOrderDoc): Promise<void> {
        // Block delete when any non-soft-deleted POV references this PO.
        // POV chains carry fulfillment history; orphaning them would leave
        // POVs pointing at a "ghost" PO in the UI.
        const activePovs = await this.povRepository.getTotal({
            purchase_order_id: row._id.toString(),
            soft_delete: false,
        } as any);
        if (activePovs > 0) {
            throw new BadRequestException(
                `Cannot delete PO: ${activePovs} PO Vendor record(s) still reference it. Cancel or delete those first.`
            );
        }

        row.soft_delete = true;
        await this.poRepository.save(row);
        this.logger.log(`PO soft-deleted: ${row._id}`);
    }

    // ─── Replace-on-update for nested lines ─────────────────────────────

    /**
     * ID-stable upsert. Existing lines are updated in place so their
     * `_id` is preserved — POV lines reference PO lines via
     * `purchase_order_line_id`, and rotating that UUID orphans them.
     * Lines removed from the payload are hard-deleted only if no POV
     * line references them; otherwise the whole update is rejected.
     */
    private async replaceLines(
        companyId: string,
        poId: string,
        lines?: any[]
    ): Promise<void> {
        const existing = await this.poLineRepository.findAll({
            purchase_order_id: poId,
        } as any);
        const existingById = new Map<string, any>();
        for (const e of existing as any[])
            existingById.set(e._id.toString(), e);

        const incomingIds = new Set<string>(
            (lines || [])
                .map(l => (l._id ? String(l._id) : null))
                .filter((v): v is string => !!v)
        );

        // Reject removal of any PO line still referenced by a POV line.
        const toRemove = (existing as any[]).filter(
            e => !incomingIds.has(e._id.toString())
        );
        if (toRemove.length) {
            const referenced = await this.povLineRepository.findAll({
                purchase_order_line_id: {
                    $in: toRemove.map(e => e._id.toString()),
                },
            } as any);
            if (referenced.length) {
                throw new BadRequestException(
                    'Cannot remove PO line(s) that are already linked to a POV. Cancel the POV first or keep the line.'
                );
            }
            for (const e of toRemove) {
                await this.poLineRepository.delete({
                    _id: e._id.toString(),
                } as any);
            }
        }

        if (!lines?.length) return;

        let seq = 0;
        for (const l of lines) {
            seq += 1;
            const payload: any = {
                company_id: companyId,
                purchase_order_id: poId,
                product_id: l.product_id,
                vendor_id: l.vendor_id || null,
                vendor_address_id: l.vendor_address_id || null,
                source_quotation_line_id: l.source_quotation_line_id || null,
                source_pfi_line_id: l.source_pfi_line_id || null,
                description: l.description || null,
                customer_reference: l.customer_reference || null,
                hsn_code: l.hsn_code || null,
                qty: l.qty || '0',
                unit: l.unit || null,
                unit_price: l.unit_price || '0',
                discount_pct: l.discount_pct || '0',
                tax_pct: l.tax_pct || '0',
                cgst: '0',
                sgst: '0',
                igst: '0',
                taxable: '0',
                line_total: '0',
                seq: l.seq != null && l.seq !== '' ? Number(l.seq) : seq,
                // Packing snapshot carried from quotation/pfi line → invoice line.
                net_weight_kg: l.net_weight_kg ?? null,
                gross_weight_kg: l.gross_weight_kg ?? null,
                package_count: l.package_count ?? null,
            };

            const existingId = l._id ? String(l._id) : null;
            const row = existingId ? existingById.get(existingId) : null;
            if (row) {
                Object.assign(row, payload);
                await this.poLineRepository.save(row);
            } else {
                await this.poLineRepository.create(payload);
            }
        }
    }

    // ─── Costing engine ─────────────────────────────────────────────────

    /**
     * PO recompute — mirrors PFI / Quotation costing per plan p.14:
     *   Per line:
     *     taxable        = qty × unit_price × (1 − disc/100)
     *     line_expenses  = Σ snapshot (percent → taxable × v/100; fixed → v)
     *     line_rebates   = Σ snapshot (percent → taxable × p/100; fixed → p)
     *     line_margin    = (taxable + line_expenses − line_rebates) × margin_pct/100
     *     line_net       = taxable + line_expenses − line_rebates + line_margin
     *     line_tax       = line_net × tax_pct/100               (split CGST/SGST or IGST)
     *     line_total     = line_net + line_tax                  (stored on line)
     *   Header:
     *     grand_inr      = round(Σ taxable + Σ expenses − Σ rebates + Σ margin + Σ tax)
     *     round_off      = grand_inr − raw
     *     grand_total    = grand_inr × exchange_rate            (stored in customer ccy)
     *
     * The snapshots (product_rebates / product_expenses / margin_pct) are not
     * stored on PO lines — they live on the originating PFI / Quotation line
     * and are fetched via source_pfi_line_id / source_quotation_line_id so
     * the source remains the single source of truth.
     */
    private async recompute(poId: string, companyId: string): Promise<void> {
        const header = await this.poRepository.findOneById(poId);
        if (!header) return;

        const lines = await this.poLineRepository.findAll({
            purchase_order_id: poId,
        } as any);

        const vendorState = await this.lookupVendorState(
            header.vendor_address_id?.toString()
        );
        const companyState = await this.lookupCompanyState(companyId);

        // Load source PFI / Quotation lines so we can pull snapshots
        // (rebates / expenses / margin_pct) — PO lines don't store these.
        const pfiLineIds: string[] = Array.from(
            new Set(
                lines
                    .map((l: any) => l.source_pfi_line_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const quotationLineIds: string[] = Array.from(
            new Set(
                lines
                    .map((l: any) => l.source_quotation_line_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const [pfiSourceLines, quotationSourceLines] = await Promise.all([
            pfiLineIds.length
                ? this.pfiLineRepository.findAll({
                      _id: { $in: pfiLineIds },
                  } as any)
                : Promise.resolve([] as any[]),
            quotationLineIds.length
                ? this.quotationLineRepository.findAll({
                      _id: { $in: quotationLineIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const sourceById = new Map<string, any>();
        for (const sl of pfiSourceLines as any[])
            sourceById.set(sl._id.toString(), sl);
        for (const sl of quotationSourceLines as any[])
            sourceById.set(sl._id.toString(), sl);

        let subtotal = 0;
        let cgst_total = 0;
        let sgst_total = 0;
        let igst_total = 0;
        let tax_total = 0;
        let product_rebates_total = 0;
        let product_expenses_total = 0;
        let line_margin_total = 0;

        for (const ln of lines) {
            // Source line for snapshots; null → treat as no rebates/expenses/margin.
            const srcId =
                (ln as any).source_pfi_line_id?.toString() ||
                (ln as any).source_quotation_line_id?.toString();
            const src: any = srcId ? sourceById.get(srcId) : null;

            // Use engine only for the intra/inter split; recompute tax on Net.
            const split = computeLineTax({
                qty: num(ln.qty),
                unit_price: num(ln.unit_price),
                discount_pct: num(ln.discount_pct),
                tax_pct: 0,
                customer_state: vendorState,
                company_state: companyState,
            });

            let lineRebatesAmt = 0;
            for (const r of src?.product_rebates_snapshot || []) {
                lineRebatesAmt +=
                    r.type === 'fixed'
                        ? num(r.pct)
                        : (split.taxable * num(r.pct)) / 100;
            }
            let lineExpensesAmt = 0;
            for (const e of src?.product_expenses_snapshot || []) {
                lineExpensesAmt +=
                    e.type === 'percent'
                        ? (split.taxable * num(e.value)) / 100
                        : num(e.value);
            }

            const lineMarginPct = num(src?.margin_pct);
            const lineMarginBase =
                split.taxable + lineExpensesAmt - lineRebatesAmt;
            const lineMarginAmt = lineMarginBase * (lineMarginPct / 100);

            // GST: per-line tax_pct is captured for reference but NOT
            // rolled into line_total or doc totals on PO. cgst/sgst/igst
            // are forced to zero so legacy readers don't see stale tax.
            const lineNet =
                split.taxable +
                lineExpensesAmt -
                lineRebatesAmt +
                lineMarginAmt;

            ln.taxable = String(round2(split.taxable));
            ln.cgst = '0';
            ln.sgst = '0';
            ln.igst = '0';
            ln.line_total = String(round2(lineNet));
            await this.poLineRepository.save(ln);

            subtotal += split.taxable;
            product_rebates_total += lineRebatesAmt;
            product_expenses_total += lineExpensesAmt;
            line_margin_total += lineMarginAmt;
        }

        const er = num(header.exchange_rate) || 1;
        // PO grand total excludes GST — per-line tax_pct is captured
        // for reference only, not added to the doc total.
        tax_total = 0;
        cgst_total = 0;
        sgst_total = 0;
        igst_total = 0;
        const grand_inr_raw =
            subtotal +
            product_expenses_total -
            product_rebates_total +
            line_margin_total;
        const grand_inr = Math.round(grand_inr_raw);
        const round_off = round2(grand_inr - grand_inr_raw);
        const grand_total = grand_inr * er;

        header.subtotal = String(round2(subtotal));
        header.cgst_total = '0';
        header.sgst_total = '0';
        header.igst_total = '0';
        header.tax_total = '0';
        header.round_off = String(round_off);
        header.grand_total = String(round2(grand_total));

        await this.poRepository.save(header);
    }

    private async lookupVendorState(
        vendorAddressId?: string
    ): Promise<string | undefined> {
        if (!vendorAddressId) return undefined;
        const addr = await this.vendorAddressRepository.findOne({
            _id: vendorAddressId,
        } as any);
        return (addr as any)?.state || undefined;
    }

    private async lookupCompanyState(
        companyId: string
    ): Promise<string | undefined> {
        // Prefer corporate default address; fall back to company.state.
        const addresses =
            await this.companyAddressRepository.findByCompanyId(companyId);
        const corp =
            (addresses || []).find(
                (a: any) => a.type === 'corporate' && a.is_default
            ) ||
            (addresses || []).find((a: any) => a.type === 'corporate') ||
            (addresses || []).find((a: any) => a.is_default) ||
            (addresses || [])[0];
        if ((corp as any)?.state) return (corp as any).state;
        try {
            const company: any = await this.companyService.findOneById(
                companyId
            );
            return company?.state || undefined;
        } catch {
            return undefined;
        }
    }

    // ─── Auto-split from PFI / Quotation ────────────────────────────────

    /**
     * Per source line (PFI line or Quotation line), compute how much qty
     * is already booked across non-cancelled, non-soft-deleted POs, plus
     * the list of those POs. Mirrors POV's getPendingByPoLine pattern.
     *
     * Returns Map<source_line_id, { covered_qty, existing_pos[] }>.
     */
    private async getSourceLineCoverage(
        sourceType: 'pfi' | 'quotation',
        sourceLineIds: string[]
    ): Promise<
        Map<
            string,
            {
                covered_qty: number;
                existing_pos: Array<{
                    purchase_order_id: string;
                    voucher_no: string;
                    status: string;
                    qty: string;
                }>;
            }
        >
    > {
        const out = new Map<
            string,
            {
                covered_qty: number;
                existing_pos: Array<{
                    purchase_order_id: string;
                    voucher_no: string;
                    status: string;
                    qty: string;
                }>;
            }
        >();
        if (!sourceLineIds.length) return out;

        const filterField =
            sourceType === 'pfi'
                ? 'source_pfi_line_id'
                : 'source_quotation_line_id';
        const poLines = await this.poLineRepository.findAll({
            [filterField]: { $in: sourceLineIds },
        } as any);
        if (!(poLines as any[]).length) return out;

        const poIds = unique(
            (poLines as any[]).map(l => l.purchase_order_id?.toString())
        );
        const pos = poIds.length
            ? await this.poRepository.findAll({
                  _id: { $in: poIds },
                  soft_delete: false,
              } as any)
            : [];
        const poById = toMap(pos as any[]);

        for (const pl of poLines as any[]) {
            const key = (pl as any)[filterField]?.toString();
            if (!key) continue;
            const po: any = poById.get(pl.purchase_order_id?.toString());
            if (!po) continue; // soft-deleted parent PO — skip
            if (po.status === ENUM_PURCHASE_ORDER_STATUS.CANCELLED) continue;
            const cur =
                out.get(key) || { covered_qty: 0, existing_pos: [] };
            const qty = num(pl.qty);
            cur.covered_qty += qty;
            const existing = cur.existing_pos.find(
                e => e.purchase_order_id === po._id.toString()
            );
            if (existing) {
                existing.qty = String(round4(num(existing.qty) + qty));
            } else {
                cur.existing_pos.push({
                    purchase_order_id: po._id.toString(),
                    voucher_no: po.voucher_no,
                    status: po.status,
                    qty: String(round4(qty)),
                });
            }
            out.set(key, cur);
        }

        for (const v of out.values()) {
            v.covered_qty = round4(v.covered_qty);
        }
        return out;
    }

    /**
     * Per-PFI / per-Quotation coverage roll-up. Same shape as POV
     * coverage, adapted: `ordered = source_line.qty`,
     * `covered = Σ qty across non-cancelled POs referencing that line`.
     */
    async getSourceCoverage(
        companyId: string,
        sourceType: 'pfi' | 'quotation',
        sourceId: string
    ): Promise<any> {
        let header: any;
        let sourceLines: any[];
        if (sourceType === 'pfi') {
            header = await this.pfiRepository.findOne({
                _id: sourceId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (!header) throw new NotFoundException('PFI not found');
            sourceLines = (await this.pfiLineRepository.findAll({
                pfi_id: sourceId,
            } as any)) as any[];
        } else {
            header = await this.quotationRepository.findOne({
                _id: sourceId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (!header) throw new NotFoundException('Quotation not found');
            sourceLines = (await this.quotationLineRepository.findAll({
                quotation_id: sourceId,
            } as any)) as any[];
        }

        const sourceLineIds = sourceLines.map(l => l._id.toString());
        const coverageMap = await this.getSourceLineCoverage(
            sourceType,
            sourceLineIds
        );

        const productIds = unique(
            sourceLines
                .map(l => l.product_id?.toString())
                .filter((v): v is string => !!v)
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)
            : [];
        const productMap = toMap(products as any[]);

        let totOrd = 0;
        let totCov = 0;
        let totPend = 0;
        const lines = sourceLines.map(l => {
            const key = l._id.toString();
            const c = coverageMap.get(key) || {
                covered_qty: 0,
                existing_pos: [],
            };
            const ordered = num(l.qty);
            const covered = c.covered_qty;
            const pending = round4(ordered - covered);
            totOrd += ordered;
            totCov += covered;
            totPend += pending;
            const product: any = l.product_id
                ? productMap.get(l.product_id.toString())
                : null;
            return {
                source_line_id: key,
                product_id: l.product_id?.toString(),
                product_name: product?.name,
                product_code: product?.code,
                hsn_code: l.hsn_code || product?.hsn_code || undefined,
                unit: l.unit || product?.unit_of_measure || undefined,
                ordered: String(round4(ordered)),
                covered: String(round4(covered)),
                pending: String(pending),
                existing_pos: c.existing_pos,
            };
        });

        return {
            source_type: sourceType,
            source_id: sourceId,
            source_voucher_no: header.voucher_no,
            status: header.status,
            has_pending: totPend > 1e-6,
            lines,
            totals: {
                ordered: String(round4(totOrd)),
                covered: String(round4(totCov)),
                pending: String(round4(totPend)),
            },
        };
    }

    /**
     * Build a preview: for each source line, list candidate vendors (active
     * price-list rows for that product) sorted cheapest-first. The first
     * vendor is the "default" assignment. FE renders this for the user to
     * confirm / change per line before POs are created.
     */
    private async buildLinePreview(
        companyId: string,
        sourceLines: Array<{
            line_id: string;
            product_id: string;
            qty: string | number;
            description?: string | null;
            unit?: string | null;
        }>
    ) {
        const productIds = unique(sourceLines.map(l => l.product_id));
        if (productIds.length === 0) return [];

        const [products, priceRows] = await Promise.all([
            this.productRepository.findAll({
                _id: { $in: productIds },
            } as any),
            this.priceListRepository.findAll({
                company_id: companyId,
                product_id: { $in: productIds },
            } as any),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        // Filter active price-list rows: effective_date <= today AND
        // (no valid_until OR valid_until >= today).
        const activePriceRows = (priceRows as any[]).filter(
            r =>
                (!r.effective_date || r.effective_date <= today) &&
                (!r.valid_until || r.valid_until >= today)
        );

        // Group price rows by product → vendor (keep cheapest per vendor).
        const byProduct = new Map<string, Map<string, any>>();
        for (const r of activePriceRows) {
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

        const allVendorIds = unique(
            activePriceRows.map((r: any) => r.vendor_id?.toString())
        );
        const vendors = allVendorIds.length
            ? await this.vendorRepository.findAll({
                  _id: { $in: allVendorIds },
              } as any)
            : [];
        const vendorMap = toMap(vendors);
        const productMap = toMap(products as any[]);

        return sourceLines.map(l => {
            const product: any = productMap.get(l.product_id);
            const candidates = Array.from(
                (byProduct.get(l.product_id) || new Map()).values()
            )
                .map((r: any) => {
                    const v: any = vendorMap.get(r.vendor_id?.toString());
                    return {
                        vendor_id: r.vendor_id?.toString(),
                        vendor_name: v?.company_name || v?.name || '',
                        unit_price: r.unit_price,
                        currency_id: r.currency_id?.toString(),
                    };
                })
                .filter(c => !!c.vendor_id)
                .sort(
                    (a, b) =>
                        Number(a.unit_price || 0) -
                        Number(b.unit_price || 0)
                );

            return {
                source_line_id: l.line_id,
                product_id: l.product_id,
                product_name: product?.name || '',
                product_code: product?.code || '',
                hsn_code: product?.hsn_code || '',
                tax_pct: product?.tax_pct || '0',
                unit: l.unit || product?.unit_of_measure || '',
                description: l.description || product?.description || '',
                qty: String(l.qty || '0'),
                candidate_vendors: candidates,
                suggested_vendor_id: candidates[0]?.vendor_id || null,
                suggested_unit_price: candidates[0]?.unit_price || null,
                unassigned: candidates.length === 0,
            };
        });
    }

    async previewFromPfi(companyId: string, pfiId: string) {
        const pfi = await this.pfiRepository.findOne({
            _id: pfiId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pfi) throw new NotFoundException('Source PFI not found');

        const lines = await this.pfiLineRepository.findAll({
            pfi_id: pfiId,
        } as any);
        const previewLines = await this.buildLinePreview(
            companyId,
            (lines as any[]).map(l => ({
                line_id: l._id.toString(),
                product_id: l.product_id?.toString(),
                qty: l.qty,
                description: l.description,
                unit: l.unit,
            }))
        );

        const coverageMap = await this.getSourceLineCoverage(
            'pfi',
            (lines as any[]).map(l => l._id.toString())
        );
        const enriched = previewLines.map((pl: any) => {
            const ordered = num(pl.qty);
            const c = coverageMap.get(pl.source_line_id) || {
                covered_qty: 0,
                existing_pos: [],
            };
            const pending = round4(ordered - c.covered_qty);
            return {
                ...pl,
                ordered_qty: String(round4(ordered)),
                covered_qty: String(round4(c.covered_qty)),
                pending_qty: String(pending),
                fully_covered: pending <= 1e-6,
                existing_pos: c.existing_pos,
                // Display qty becomes the still-bookable amount.
                qty: String(Math.max(0, pending)),
            };
        });

        const existingDelivery = await this.pickExistingDeliveryAddress(
            enriched
        );

        return {
            source: {
                type: 'pfi',
                _id: pfi._id.toString(),
                voucher_no: (pfi as any).voucher_no,
                status: (pfi as any).status,
                customer_id: (pfi as any).customer_id?.toString(),
                grand_total: (pfi as any).grand_total,
                currency_code: (pfi as any).currency_code,
                currency_symbol: getCurrencySymbol((pfi as any).currency_code),
            },
            existing_delivery_address_id: existingDelivery.id,
            existing_delivery_address: existingDelivery.text,
            lines: enriched,
        };
    }

    async previewFromQuotation(companyId: string, quotationId: string) {
        const q = await this.quotationRepository.findOne({
            _id: quotationId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!q) throw new NotFoundException('Source Quotation not found');

        const lines = await this.quotationLineRepository.findAll({
            quotation_id: quotationId,
        } as any);
        const previewLines = await this.buildLinePreview(
            companyId,
            (lines as any[]).map(l => ({
                line_id: l._id.toString(),
                product_id: l.product_id?.toString(),
                qty: l.qty,
                description: l.description,
                unit: l.unit,
            }))
        );

        const coverageMap = await this.getSourceLineCoverage(
            'quotation',
            (lines as any[]).map(l => l._id.toString())
        );
        const enriched = previewLines.map((pl: any) => {
            const ordered = num(pl.qty);
            const c = coverageMap.get(pl.source_line_id) || {
                covered_qty: 0,
                existing_pos: [],
            };
            const pending = round4(ordered - c.covered_qty);
            return {
                ...pl,
                ordered_qty: String(round4(ordered)),
                covered_qty: String(round4(c.covered_qty)),
                pending_qty: String(pending),
                fully_covered: pending <= 1e-6,
                existing_pos: c.existing_pos,
                qty: String(Math.max(0, pending)),
            };
        });

        const existingDelivery = await this.pickExistingDeliveryAddress(
            enriched
        );

        return {
            source: {
                type: 'quotation',
                _id: q._id.toString(),
                voucher_no: (q as any).voucher_no,
                status: (q as any).status,
                customer_id: (q as any).customer_id?.toString(),
                grand_total: (q as any).grand_total,
                currency_code: (q as any).currency_code,
                currency_symbol: getCurrencySymbol((q as any).currency_code),
            },
            existing_delivery_address_id: existingDelivery.id,
            existing_delivery_address: existingDelivery.text,
            lines: enriched,
        };
    }

    /**
     * Across every line's existing_pos, find the most-recently-created PO
     * and surface its delivery_address_id + snapshot text. The modal uses
     * this to pre-fill "Deliver goods to" so the dropdown matches the
     * address actually used on the downstream PO — instead of falling back
     * to LocationSelect's is_default. Returns nulls when no POs exist yet.
     */
    private async pickExistingDeliveryAddress(
        enrichedLines: any[]
    ): Promise<{ id: string | null; text: string | null }> {
        const poIds = unique(
            enrichedLines.flatMap((l: any) =>
                (l.existing_pos || []).map((p: any) => p.purchase_order_id)
            )
        );
        if (!poIds.length) return { id: null, text: null };
        const pos = (await this.poRepository.findAll({
            _id: { $in: poIds },
            soft_delete: false,
        } as any)) as any[];
        if (!pos.length) return { id: null, text: null };
        // Most-recent wins so re-opening the modal after edits picks the
        // latest operator decision.
        const sorted = pos.sort(
            (a, b) =>
                new Date(b.createdAt || 0).getTime() -
                new Date(a.createdAt || 0).getTime()
        );
        const picked = sorted.find(p => p.delivery_address_id) || sorted[0];
        return {
            id: picked?.delivery_address_id?.toString() || null,
            text: picked?.delivery_address || null,
        };
    }

    /**
     * Create one PO per unique vendor in `assignments`. Each assignment is
     * `{ source_line_id, vendor_id }`. Source lines without an assignment
     * (or with a vendor that has no active price-list row) are skipped.
     */
    private async createPosFromAssignments(opts: {
        companyId: string;
        createdBy: string;
        sourceType: 'pfi' | 'quotation';
        sourceId: string;
        sourceLines: any[];
        assignments: Array<{
            source_line_id: string;
            vendor_id: string;
        }>;
        customerId?: string;
        deliveryAddressId?: string;
        deliveryAddressText?: string;
    }) {
        const {
            companyId,
            createdBy,
            sourceType,
            sourceId,
            sourceLines,
            assignments,
            customerId,
            deliveryAddressId,
            deliveryAddressText,
        } = opts;

        const assignmentMap = new Map<string, string>();
        for (const a of assignments || []) {
            if (a.source_line_id && a.vendor_id) {
                assignmentMap.set(a.source_line_id, a.vendor_id);
            }
        }

        // Load existing PO coverage to compute pending qty per source line.
        const coverageMap = await this.getSourceLineCoverage(
            sourceType,
            sourceLines.map((l: any) => l._id.toString())
        );

        // Group lines by vendor.
        const linesByVendor = new Map<string, any[]>();
        const skipped: Array<{ source_line_id: string; reason: string }> = [];
        const productIds = unique(
            sourceLines.map((l: any) => l.product_id?.toString())
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)
            : [];
        const productMap = toMap(products as any[]);

        for (const l of sourceLines as any[]) {
            const sourceLineId = l._id.toString();
            const vendorId = assignmentMap.get(sourceLineId);
            if (!vendorId) {
                skipped.push({
                    source_line_id: sourceLineId,
                    reason: 'No vendor assigned',
                });
                continue;
            }
            // Enforce pending: only book the un-POʼd remainder.
            const cov = coverageMap.get(sourceLineId) || {
                covered_qty: 0,
                existing_pos: [],
            };
            const ordered = num(l.qty);
            const pending = round4(ordered - cov.covered_qty);
            if (pending <= 1e-6) {
                skipped.push({
                    source_line_id: sourceLineId,
                    reason: `Already fully covered by existing PO(s)`,
                });
                continue;
            }
            const pid = l.product_id?.toString();
            // Look up current price for this (vendor, product).
            let priceRow: any = null;
            try {
                priceRow = await this.priceListRepository.findCurrentPrice(
                    companyId,
                    vendorId,
                    pid
                );
            } catch {
                priceRow = null;
            }
            if (!priceRow) {
                skipped.push({
                    source_line_id: sourceLineId,
                    reason: 'No active price for selected vendor',
                });
                continue;
            }
            const product: any = productMap.get(pid);
            const arr = linesByVendor.get(vendorId) || [];
            arr.push({
                product_id: pid,
                source_quotation_line_id:
                    sourceType === 'quotation' ? sourceLineId : undefined,
                source_pfi_line_id:
                    sourceType === 'pfi' ? sourceLineId : undefined,
                description: l.description || product?.description || '',
                hsn_code: product?.hsn_code || '',
                qty: String(pending),
                unit: l.unit || product?.unit_of_measure || '',
                unit_price: String(priceRow.unit_price || '0'),
                discount_pct: '0',
                tax_pct: String(product?.tax_pct ?? '0'),
            });
            linesByVendor.set(vendorId, arr);
        }

        const today = new Date().toISOString().slice(0, 10);
        const created = [];
        for (const [vendorId, vlines] of linesByVendor) {
            try {
                const po = await this.create(
                    companyId,
                    {
                        vendor_id: vendorId,
                        customer_id: customerId,
                        quotation_id:
                            sourceType === 'quotation' ? sourceId : undefined,
                        pfi_id: sourceType === 'pfi' ? sourceId : undefined,
                        po_date: today,
                        delivery_address: deliveryAddressText || undefined,
                        delivery_address_id: deliveryAddressId || undefined,
                        currency_code: 'INR',
                        exchange_rate: '1',
                        lines: vlines,
                    } as any,
                    createdBy
                );
                created.push(po);
            } catch (err: any) {
                // Don't abort the whole batch on one bad vendor - record
                // the failure so the user can fix it (e.g. set the
                // company.default_po_delivery_address).
                skipped.push({
                    source_line_id: vlines
                        .map((l: any) =>
                            sourceType === 'pfi'
                                ? l.source_pfi_line_id
                                : l.source_quotation_line_id
                        )
                        .join(','),
                    reason: err?.message || 'Failed to create PO',
                });
            }
        }

        return { created, skipped };
    }

    async createFromPfi(
        companyId: string,
        pfiId: string,
        createdBy: string,
        assignments: Array<{ source_line_id: string; vendor_id: string }>,
        opts?: {
            deliveryAddressId?: string;
            deliveryAddressText?: string;
            vendorExpenses?: Record<
                string,
                Array<{
                    expense_id: string;
                    type?: 'percent' | 'fixed';
                    value?: string;
                }>
            >;
            customerOrder?: CustomerOrderInput;
        }
    ) {
        return this.createPoAndPovsFromSource({
            companyId,
            createdBy,
            sourceType: 'pfi',
            sourceId: pfiId,
            assignments,
            deliveryAddressId: opts?.deliveryAddressId,
            deliveryAddressText: opts?.deliveryAddressText,
            vendorExpenses: opts?.vendorExpenses,
            customerOrder: opts?.customerOrder,
        });
    }

    /**
     * Atomic-ish single-PO + N-POVs flow from a PFI or Quotation
     * (per 2026-05-21 model change). All validation happens up-front;
     * if any POV creation fails after the PO is committed, the PO is
     * soft-deleted and the original error is re-thrown.
     */
    private async createPoAndPovsFromSource(opts: {
        companyId: string;
        createdBy: string;
        sourceType: 'pfi' | 'quotation';
        sourceId: string;
        assignments: Array<{ source_line_id: string; vendor_id: string }>;
        deliveryAddressId?: string;
        deliveryAddressText?: string;
        vendorExpenses?: Record<
            string,
            Array<{
                expense_id: string;
                type?: 'percent' | 'fixed';
                value?: string;
            }>
        >;
        customerOrder?: CustomerOrderInput;
    }) {
        const {
            companyId,
            createdBy,
            sourceType,
            sourceId,
            assignments,
            deliveryAddressId,
            deliveryAddressText,
            vendorExpenses,
            customerOrder,
        } = opts;

        // ── Load source doc ──
        const source =
            sourceType === 'pfi'
                ? await this.pfiRepository.findOne({
                      _id: sourceId,
                      company_id: companyId,
                      soft_delete: false,
                  } as any)
                : await this.quotationRepository.findOne({
                      _id: sourceId,
                      company_id: companyId,
                      soft_delete: false,
                  } as any);
        if (!source) {
            throw new NotFoundException(
                `Source ${sourceType.toUpperCase()} not found`
            );
        }

        // ── One-PFI / one-Quotation → one-PO uniqueness ──
        const existing = await this.poRepository.findAll({
            company_id: companyId,
            ...(sourceType === 'pfi'
                ? { pfi_id: sourceId }
                : { quotation_id: sourceId }),
            soft_delete: false,
        } as any);
        const activeExisting = (existing as any[]).filter(
            p => p.status !== ENUM_PURCHASE_ORDER_STATUS.CANCELLED
        );
        if (activeExisting.length) {
            throw new BadRequestException(
                `A PO already exists for this ${sourceType.toUpperCase()} (${
                    (activeExisting[0] as any).voucher_no
                }). Cancel it before regenerating.`
            );
        }

        // ── Load source lines ──
        const sourceLines: any[] =
            sourceType === 'pfi'
                ? ((await this.pfiLineRepository.findAll({
                      pfi_id: sourceId,
                  } as any)) as any[])
                : ((await this.quotationLineRepository.findAll({
                      quotation_id: sourceId,
                  } as any)) as any[]);
        const sourceLineById = new Map<string, any>();
        for (const l of sourceLines) sourceLineById.set(l._id.toString(), l);

        // ── Filter assignments to ones with a vendor ──
        const validAssignments = (assignments || []).filter(
            a => a?.source_line_id && a?.vendor_id
        );
        if (!validAssignments.length) {
            throw new BadRequestException(
                'At least one line must be assigned to a vendor.'
            );
        }

        // ── Validate every assignment + look up prices up-front ──
        const productIds = unique(
            sourceLines.map(l => l.product_id?.toString())
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)
            : [];
        const productMap = toMap(products as any[]);

        type Resolved = {
            sourceLineId: string;
            vendorId: string;
            sourceLine: any;
            product: any;
            /** Vendor's INR price — used on the POV line (procurement side). */
            vendorUnitPrice: string;
        };
        const resolved: Resolved[] = [];
        for (const a of validAssignments) {
            const sourceLine = sourceLineById.get(a.source_line_id);
            if (!sourceLine) {
                throw new BadRequestException(
                    `Source line ${a.source_line_id} does not belong to this ${sourceType.toUpperCase()}.`
                );
            }
            const pid = sourceLine.product_id?.toString();
            const product: any = productMap.get(pid);
            let priceRow: any = null;
            try {
                priceRow = await this.priceListRepository.findCurrentPrice(
                    companyId,
                    a.vendor_id,
                    pid
                );
            } catch {
                priceRow = null;
            }
            if (!priceRow) {
                throw new BadRequestException(
                    `No active price for vendor on product "${
                        product?.name || pid
                    }". Add it to the vendor price list and try again.`
                );
            }
            resolved.push({
                sourceLineId: a.source_line_id,
                vendorId: a.vendor_id,
                sourceLine,
                product,
                vendorUnitPrice: String(priceRow.unit_price || '0'),
            });
        }

        // ── Build PO lines — PO mirrors the customer-facing PFI/Quotation.
        // unit_price, tax_pct, discount_pct all come from the source line
        // (in customer currency). The vendor's INR price travels separately
        // and lands on the POV line only.
        const poLinePayload = resolved.map(r => ({
            product_id: r.sourceLine.product_id?.toString(),
            vendor_id: r.vendorId,
            // When generated via PFI, also propagate the grandparent
            // quotation_line_id (stamped on pfi_line at createFromQuotation)
            // so Quotation PO-coverage sees POs created via the PFI path.
            source_quotation_line_id:
                sourceType === 'quotation'
                    ? r.sourceLineId
                    : r.sourceLine.source_quotation_line_id?.toString() ||
                      undefined,
            source_pfi_line_id:
                sourceType === 'pfi' ? r.sourceLineId : undefined,
            description:
                r.sourceLine.description || r.product?.description || '',
            customer_reference: r.sourceLine.customer_reference || undefined,
            hsn_code: r.product?.hsn_code || '',
            qty: String(r.sourceLine.qty || '0'),
            unit: r.sourceLine.unit || r.product?.unit_of_measure || '',
            unit_price: String(r.sourceLine.unit_price || '0'),
            discount_pct: String(r.sourceLine.discount_pct ?? '0'),
            tax_pct: String(
                r.sourceLine.tax_pct ?? r.product?.tax_pct ?? '0'
            ),
            // Carry packing forward from the source quotation/pfi line.
            net_weight_kg: r.sourceLine.net_weight_kg ?? undefined,
            gross_weight_kg: r.sourceLine.gross_weight_kg ?? undefined,
            package_count: r.sourceLine.package_count ?? undefined,
        }));

        // ── Create PO (status = confirmed so POVs can be created against it) ──
        // PO mirrors the customer-facing PFI/Quotation header — currency,
        // payment + delivery terms, bill-to address, expected delivery,
        // and internal notes all inherit from the source.
        const today = new Date().toISOString().slice(0, 10);
        const src: any = source as any;
        const po = await this.create(
            companyId,
            {
                customer_id: src.customer_id?.toString(),
                customer_address_id:
                    src.customer_address_id?.toString() || undefined,
                // Propagate consignee from source PFI (Quotation doesn't
                // carry one). Operator picked on PFI; PO inherits.
                consignee_id: src.consignee_id?.toString() || undefined,
                consignee_snapshot: src.consignee_snapshot || undefined,
                quotation_id:
                    sourceType === 'quotation' ? sourceId : undefined,
                pfi_id: sourceType === 'pfi' ? sourceId : undefined,
                po_date: today,
                expected_delivery_date:
                    sourceType === 'pfi'
                        ? src.est_delivery_date || undefined
                        : undefined,
                // Customer-side order ref + advance (entered at generation).
                customer_po_number: customerOrder?.customer_po_number,
                advance_amount: customerOrder?.advance_amount,
                advance_date: customerOrder?.advance_date,
                advance_notes: customerOrder?.advance_notes,
                payment_terms: src.payment_terms || undefined,
                delivery_terms: src.delivery_terms || undefined,
                internal_notes: src.internal_notes || undefined,
                delivery_address: deliveryAddressText || undefined,
                delivery_address_id: deliveryAddressId || undefined,
                currency_code: src.currency_code || 'INR',
                exchange_rate: src.exchange_rate || '1',
                status: ENUM_PURCHASE_ORDER_STATUS.CONFIRMED,
                lines: poLinePayload,
            } as any,
            createdBy
        );

        // ── Reload PO lines so we have their generated _ids ──
        const persistedLines = await this.poLineRepository.findAll({
            purchase_order_id: po._id.toString(),
        } as any);

        // ── Group lines by vendor for POV spawn ──
        const linesByVendor = new Map<string, any[]>();
        for (const pl of persistedLines as any[]) {
            const vid = pl.vendor_id?.toString();
            if (!vid) continue;
            const arr = linesByVendor.get(vid) || [];
            arr.push(pl);
            linesByVendor.set(vid, arr);
        }

        // ── Spawn POVs (draft) ──
        // Vendor INR price travels separately and lands on the POV line.
        // Key by (sourcePfiLineId|sourceQuotationLineId) + vendorId to
        // find the matching resolved entry for each persisted PO line.
        const vendorPriceByPoLine = new Map<string, string>();
        for (const pl of persistedLines as any[]) {
            const srcLineId = (
                pl.source_pfi_line_id ||
                pl.source_quotation_line_id ||
                ''
            ).toString();
            const r = resolved.find(
                x =>
                    x.sourceLineId === srcLineId &&
                    x.vendorId === pl.vendor_id?.toString()
            );
            if (r) {
                vendorPriceByPoLine.set(
                    pl._id.toString(),
                    r.vendorUnitPrice
                );
            }
        }

        const createdPovs: any[] = [];
        try {
            for (const [vendorId, vlines] of linesByVendor) {
                const povBody: any = {
                    vendor_id: vendorId,
                    delivery_address: po.delivery_address || undefined,
                    delivery_address_id: po.delivery_address_id || undefined,
                    lines: vlines.map(vl => ({
                        purchase_order_line_id: vl._id.toString(),
                        ordered_qty: String(vl.qty || '0'),
                        unit_price:
                            vendorPriceByPoLine.get(vl._id.toString()) ||
                            String(vl.unit_price || '0'),
                    })),
                    // Per-vendor expense picks from the Generate-POs modal.
                    // POV service resolves master fields and computes amounts.
                    expenses: vendorExpenses?.[vendorId] || [],
                };
                const pov = await this.povService.createFromPo(
                    companyId,
                    po._id.toString(),
                    povBody,
                    createdBy
                );
                createdPovs.push(pov);
            }
        } catch (err: any) {
            // Roll back: soft-delete the PO + lines + any POVs already created.
            try {
                for (const pov of createdPovs) {
                    await this.povRepository.save({
                        ...(pov as any),
                        soft_delete: true,
                    } as any);
                }
            } catch {
                /* best-effort */
            }
            try {
                await this.softDelete(po);
            } catch {
                /* best-effort */
            }
            throw new BadRequestException(
                `PO creation rolled back: ${err?.message || 'POV creation failed'}`
            );
        }

        return { purchase_order: po, po_vendors: createdPovs };
    }

    async createFromQuotation(
        companyId: string,
        quotationId: string,
        createdBy: string,
        assignments: Array<{ source_line_id: string; vendor_id: string }>,
        opts?: {
            deliveryAddressId?: string;
            deliveryAddressText?: string;
            vendorExpenses?: Record<
                string,
                Array<{
                    expense_id: string;
                    type?: 'percent' | 'fixed';
                    value?: string;
                }>
            >;
            customerOrder?: CustomerOrderInput;
        }
    ) {
        return this.createPoAndPovsFromSource({
            companyId,
            createdBy,
            sourceType: 'quotation',
            sourceId: quotationId,
            assignments,
            deliveryAddressId: opts?.deliveryAddressId,
            deliveryAddressText: opts?.deliveryAddressText,
            vendorExpenses: opts?.vendorExpenses,
            customerOrder: opts?.customerOrder,
        });
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(
        rows: PurchaseOrderDoc[]
    ): Promise<PurchaseOrderGetResponseDto[]> {
        if (!rows.length) return [];

        // Header vendor_id is legacy now; line-level vendor_id is canonical.
        // Collect both so the vendor lookup picks up every reference.
        const headerVendorIds = unique(rows.map(r => r.vendor_id?.toString()));
        const customerIds = unique(
            rows
                .map(r => r.customer_id?.toString())
                .filter((v): v is string => !!v)
        );
        const quotationIds = unique(
            rows
                .map(r => r.quotation_id?.toString())
                .filter((v): v is string => !!v)
        );
        const pfiIds = unique(
            rows
                .map(r => r.pfi_id?.toString())
                .filter((v): v is string => !!v)
        );
        const poIds = rows.map(r => r._id.toString());

        const allLines = await this.poLineRepository.findAll({
            purchase_order_id: { $in: poIds },
        } as any);
        const productIds = unique(
            allLines
                .map((l: any) => l.product_id?.toString())
                .filter((v: any): v is string => !!v)
        );
        const lineVendorIds = unique(
            allLines
                .map((l: any) => l.vendor_id?.toString())
                .filter((v: any): v is string => !!v)
        );
        const vendorIds = unique([...headerVendorIds, ...lineVendorIds]);

        const [
            vendors,
            customers,
            quotations,
            pfis,
            products,
            vendorContacts,
            customerContacts,
        ] = await Promise.all([
            vendorIds.length
                ? this.vendorRepository.findAll({
                      _id: { $in: vendorIds },
                  } as any)
                : Promise.resolve([] as any[]),
            customerIds.length
                ? this.customerRepository.findAll({
                      _id: { $in: customerIds },
                  } as any)
                : Promise.resolve([] as any[]),
            quotationIds.length
                ? this.quotationRepository.findAll({
                      _id: { $in: quotationIds },
                  } as any)
                : Promise.resolve([] as any[]),
            pfiIds.length
                ? this.pfiRepository.findAll({
                      _id: { $in: pfiIds },
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
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as any[]),
            customerIds.length
                ? this.customerContactRepository.findAll({
                      customer_id: { $in: customerIds },
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as any[]),
        ]);

        // Primary contact per vendor (or first if no flag set).
        const primaryContactByVendor = new Map<string, any>();
        for (const c of vendorContacts as any[]) {
            const vid = c.vendor_id?.toString();
            if (!vid) continue;
            const existing = primaryContactByVendor.get(vid);
            if (!existing || (c.is_primary && !existing.is_primary)) {
                primaryContactByVendor.set(vid, c);
            }
        }

        // Primary contact per customer (mirrors vendor logic).
        const primaryContactByCustomer = new Map<string, any>();
        for (const c of customerContacts as any[]) {
            const cid = c.customer_id?.toString();
            if (!cid) continue;
            const existing = primaryContactByCustomer.get(cid);
            if (!existing || (c.is_primary && !existing.is_primary)) {
                primaryContactByCustomer.set(cid, c);
            }
        }

        const vendorMap = toMap(vendors);
        const customerMap = toMap(customers);
        const quotationMap = toMap(quotations);
        const pfiMap = toMap(pfis);
        const productMap = toMap(products);
        const linesByPo = groupBy(allLines, (l: any) =>
            l.purchase_order_id.toString()
        );

        // Source PFI / Quotation lines hold the rebate / expense / margin
        // snapshots — PO lines don't store them. Fetch in one shot so the
        // line DTOs can expose them for the FE form.
        const sourcePfiLineIds: string[] = Array.from(
            new Set(
                (allLines as any[])
                    .map((l: any) => l.source_pfi_line_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const sourceQuotationLineIds: string[] = Array.from(
            new Set(
                (allLines as any[])
                    .map((l: any) => l.source_quotation_line_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const [sourcePfiLines, sourceQuotationLines] = await Promise.all([
            sourcePfiLineIds.length
                ? this.pfiLineRepository.findAll({
                      _id: { $in: sourcePfiLineIds },
                  } as any)
                : Promise.resolve([] as any[]),
            sourceQuotationLineIds.length
                ? this.quotationLineRepository.findAll({
                      _id: { $in: sourceQuotationLineIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const sourceLineById = new Map<string, any>();
        for (const sl of sourcePfiLines as any[])
            sourceLineById.set(sl._id.toString(), sl);
        for (const sl of sourceQuotationLines as any[])
            sourceLineById.set(sl._id.toString(), sl);

        return rows.map(r => {
            const pid = r._id.toString();
            const vendor: any = vendorMap.get(r.vendor_id?.toString());
            const cust: any = r.customer_id
                ? customerMap.get(r.customer_id.toString())
                : null;
            const q: any = r.quotation_id
                ? quotationMap.get(r.quotation_id.toString())
                : null;
            const pfi: any = r.pfi_id
                ? pfiMap.get(r.pfi_id.toString())
                : null;
            const primary: any = primaryContactByVendor.get(
                r.vendor_id?.toString()
            );
            const custPrimary: any = r.customer_id
                ? primaryContactByCustomer.get(r.customer_id.toString())
                : null;

            return {
                _id: pid,
                voucher_no: r.voucher_no,
                vendor_id: r.vendor_id?.toString(),
                vendor_name: vendor?.company_name || vendor?.name,
                vendor_contact_name: primary?.name,
                vendor_contact_email: primary?.email,
                vendor_contact_phone: primary?.phone,
                vendor_contact_country_code: primary?.country_code,
                vendor_address_id: r.vendor_address_id?.toString(),
                customer_id: r.customer_id?.toString(),
                customer_address_id: (r as any).customer_address_id?.toString(),
                consignee_id: (r as any).consignee_id?.toString(),
                consignee_snapshot: (r as any).consignee_snapshot,
                customer_name: cust?.company_name,
                customer_contact_name: custPrimary?.name,
                customer_contact_email: custPrimary?.email,
                customer_contact_phone: custPrimary?.phone,
                customer_contact_country_code: custPrimary?.country_code,
                quotation_id: r.quotation_id?.toString(),
                quotation_voucher_no: q?.voucher_no,
                pfi_id: r.pfi_id?.toString(),
                pfi_voucher_no: pfi?.voucher_no,
                // Surface PFI's bank_account_id so the Invoice add page
                // (when generated via Generate Invoice on PO Coverage) can
                // pre-select the same bank.
                pfi_bank_account_id: (pfi as any)?.bank_account_id?.toString(),
                po_date: r.po_date,
                expected_delivery_date: r.expected_delivery_date,
                customer_po_number: (r as any).customer_po_number,
                advance_amount: (r as any).advance_amount,
                advance_date: (r as any).advance_date,
                advance_notes: (r as any).advance_notes,
                delivery_address: r.delivery_address,
                delivery_address_id: r.delivery_address_id?.toString(),
                payment_terms: r.payment_terms,
                delivery_terms: r.delivery_terms,
                notes_to_vendor: r.notes_to_vendor,
                internal_notes: r.internal_notes,
                currency_code: r.currency_code,
                currency_symbol: getCurrencySymbol(r.currency_code),
                exchange_rate: r.exchange_rate,
                subtotal: r.subtotal,
                cgst_total: r.cgst_total,
                sgst_total: r.sgst_total,
                igst_total: r.igst_total,
                tax_total: r.tax_total,
                round_off: r.round_off,
                grand_total: r.grand_total,
                status: r.status,
                public_token: (r as any).public_token || undefined,
                public_view_count: (r as any).public_view_count || 0,
                public_last_viewed_at: (r as any).public_last_viewed_at,
                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                lines: (linesByPo.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map((l: any): PurchaseOrderLineResponseDto => {
                        const srcId =
                            l.source_pfi_line_id?.toString() ||
                            l.source_quotation_line_id?.toString();
                        const src: any = srcId
                            ? sourceLineById.get(srcId)
                            : null;
                        // Pull product snapshot once so all per-line fallbacks
                        // (name / code / hsn / unit) read from the same record.
                        const prod: any = productMap.get(
                            l.product_id?.toString()
                        );
                        return {
                            _id: l._id?.toString(),
                            product_id: l.product_id?.toString(),
                            product_name: prod?.name,
                            product_code: prod?.code,
                            vendor_id: l.vendor_id?.toString(),
                            vendor_name: l.vendor_id
                                ? (vendorMap.get(
                                      l.vendor_id?.toString()
                                  ) as any)?.company_name
                                : undefined,
                            vendor_code: l.vendor_id
                                ? (vendorMap.get(
                                      l.vendor_id?.toString()
                                  ) as any)?.vendor_code
                                : undefined,
                            source_quotation_line_id:
                                l.source_quotation_line_id?.toString(),
                            source_pfi_line_id:
                                l.source_pfi_line_id?.toString(),
                            description: l.description,
                            customer_reference: l.customer_reference,
                            // Fall back to product master when the PO line was
                            // saved without HSN (older rows + auto-generated
                            // POs that didn't capture it). Mirrors the same
                            // pattern in the coverage mapper.
                            hsn_code: l.hsn_code || prod?.hsn_code,
                            qty: l.qty,
                            unit: l.unit || prod?.unit_of_measure,
                            unit_price: l.unit_price,
                            discount_pct: l.discount_pct,
                            tax_pct: l.tax_pct,
                            cgst: l.cgst,
                            sgst: l.sgst,
                            igst: l.igst,
                            taxable: l.taxable,
                            line_total: l.line_total,
                            seq: l.seq,
                            margin_pct:
                                src?.margin_pct != null
                                    ? String(src.margin_pct)
                                    : '0',
                            product_rebates_snapshot:
                                src?.product_rebates_snapshot || [],
                            product_expenses_snapshot:
                                src?.product_expenses_snapshot || [],
                            product_rebates_amount:
                                src?.product_rebates_amount != null
                                    ? String(src.product_rebates_amount)
                                    : '0',
                            product_expenses_amount:
                                src?.product_expenses_amount != null
                                    ? String(src.product_expenses_amount)
                                    : '0',
                            margin_amount:
                                src?.margin_amount != null
                                    ? String(src.margin_amount)
                                    : '0',
                            // Packing snapshot → consumed by the invoice seed.
                            net_weight_kg: (l as any).net_weight_kg ?? null,
                            gross_weight_kg: (l as any).gross_weight_kg ?? null,
                            package_count: (l as any).package_count ?? null,
                        };
                    }),
            };
        });
    }

    async mapGet(
        row: PurchaseOrderDoc
    ): Promise<PurchaseOrderGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }

    /**
     * Enriches `mapGet` with seller (company) and buyer (customer) party
     * blocks so the customer-facing preview / public token view can render
     * Seller / Buyer the same way the PFI public preview does.
     */
    async mapPublicPreview(row: PurchaseOrderDoc): Promise<any> {
        const base: any = await this.mapGet(row);

        const joinAddr = (a: any) =>
            [
                a?.address_line1,
                a?.address_line2,
                [a?.city, a?.state, a?.postcode].filter(Boolean).join(', '),
                a?.country,
            ]
                .filter(Boolean)
                .join('\n') || undefined;

        // ── Seller (company) ──
        let company_name: string | undefined;
        let company_email: string | undefined;
        let company_phone: string | undefined;
        let company_address: string | undefined;
        let company_gstin: string | undefined;
        try {
            const company: any = await this.companyService.findOneById(
                row.company_id.toString()
            );
            company_name = company?.company_name;
            company_email = company?.email;
            const ccc: any = company?.country_code;
            company_phone = company?.mobile
                ? ccc?.formatted ||
                  `${ccc?.dial_code || '+91'} ${company.mobile}`
                : undefined;
            const addresses =
                await this.companyAddressRepository.findByCompanyId(
                    row.company_id.toString()
                );
            const corp =
                (addresses || []).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a: any) => a.type === 'corporate') ||
                (addresses || []).find((a: any) => a.is_default) ||
                (addresses || [])[0];
            if (corp) {
                company_address = joinAddr(corp);
                company_gstin = (corp as any).gstin || undefined;
            }
            if (!company_gstin && company?.tax_number) {
                company_gstin = company.tax_number;
            }
        } catch {
            // graceful
        }

        // ── Buyer (customer) address ──
        let customer_address: string | undefined;
        const customerAddressId = (row as any).customer_address_id?.toString();
        if (customerAddressId) {
            try {
                const a: any = await this.customerAddressRepository.findOne({
                    _id: customerAddressId,
                } as any);
                if (a) customer_address = joinAddr(a);
            } catch {
                /* ignore */
            }
        }
        if (!customer_address && (row as any).customer_id) {
            try {
                const list = await this.customerAddressRepository.findAll({
                    customer_id: (row as any).customer_id.toString(),
                    soft_delete: false,
                } as any);
                const a: any =
                    (list || []).find((x: any) => x.is_default) ||
                    (list || [])[0];
                if (a) customer_address = joinAddr(a);
            } catch {
                /* ignore */
            }
        }

        return {
            ...base,
            company_name,
            company_email,
            company_phone,
            company_address,
            company_gstin,
            customer_address,
        };
    }

    // ── Listing filter helper ────────────────────────────────────────────
    //
    // Shared between `/list` and `/stats` so tile counts and table rows
    // can't drift (Docs/VOUCHER_STATS_PLAN.md §7).
    buildListFind(
        companyId: string,
        filters: {
            vendor_id?: string;
            customer_id?: string;
            quotation_id?: string;
            pfi_id?: string;
            status?: string | string[];
            date_from?: string;
            date_to?: string;
            search?: string;
        }
    ): Record<string, any> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (filters.vendor_id) find.vendor_id = filters.vendor_id;
        if (filters.customer_id) find.customer_id = filters.customer_id;
        if (filters.quotation_id) find.quotation_id = filters.quotation_id;
        if (filters.pfi_id) find.pfi_id = filters.pfi_id;
        if (filters.status) find.status = filters.status;
        if (filters.date_from && filters.date_to) {
            find.po_date = {
                $gte: filters.date_from,
                $lte: filters.date_to,
            };
        } else if (filters.date_from) {
            find.po_date = { $gte: filters.date_from };
        } else if (filters.date_to) {
            find.po_date = { $lte: filters.date_to };
        }
        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { notes_to_vendor: { $regex: searchTerm, $options: 'i' } },
            ];
        }
        return find;
    }

    // ── KPI stats for the PO listing tile strip ──────────────────────────
    //
    // Counts per status + INR-converted SUM(grand_total / exchange_rate).
    // exchange_rate stored as "1 INR = X foreign-currency-units" so we
    // divide. Money sum EXCLUDES cancelled rows — "Pipeline Total Value"
    // is money still in play, not killed-deal money.
    async stats(
        companyId: string,
        filters: {
            vendor_id?: string;
            customer_id?: string;
            quotation_id?: string;
            pfi_id?: string;
            status?: string | string[];
            date_from?: string;
            date_to?: string;
            search?: string;
        }
    ): Promise<{
        total: number;
        total_amount_inr: string;
        by_status: Record<string, number>;
    }> {
        const rows = await this.poRepository.aggregate<{
            status: string;
            count: string;
            amount_inr: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            if (filters.vendor_id) {
                qb.andWhere('entity.vendor_id = :v', { v: filters.vendor_id });
            }
            if (filters.customer_id) {
                qb.andWhere('entity.customer_id = :cust', {
                    cust: filters.customer_id,
                });
            }
            if (filters.quotation_id) {
                qb.andWhere('entity.quotation_id = :qid', {
                    qid: filters.quotation_id,
                });
            }
            if (filters.pfi_id) {
                qb.andWhere('entity.pfi_id = :pid', { pid: filters.pfi_id });
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
                qb.andWhere('entity.po_date >= :df', {
                    df: filters.date_from,
                });
            }
            if (filters.date_to) {
                qb.andWhere('entity.po_date <= :dt', {
                    dt: filters.date_to,
                });
            }
            const searchTerm =
                typeof filters.search === 'string'
                    ? filters.search.trim()
                    : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.notes_to_vendor ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .addSelect(
                    `COALESCE(SUM(
                        CASE
                            WHEN entity.status = '${ENUM_PURCHASE_ORDER_STATUS.CANCELLED}' THEN 0
                            ELSE entity.grand_total / COALESCE(NULLIF(entity.exchange_rate, 0), 1)
                        END
                    ), 0)::text`,
                    'amount_inr'
                )
                .groupBy('entity.status');
        });

        const by_status: Record<string, number> = {};
        let total = 0;
        let total_amount_inr = 0;
        for (const r of rows) {
            const cnt = Number(r.count) || 0;
            by_status[r.status] = cnt;
            total += cnt;
            total_amount_inr += Number(r.amount_inr) || 0;
        }
        return {
            total,
            total_amount_inr: total_amount_inr.toFixed(2),
            by_status,
        };
    }
}

// ─── Utilities (module-private) ─────────────────────────────────────────

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

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const item of arr) {
        const k = keyFn(item);
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(item);
    }
    return m;
}
