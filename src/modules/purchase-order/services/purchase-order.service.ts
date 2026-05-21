import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
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
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { PfiRepository } from '@modules/pfi/repository/repositories/pfi.repository';
import { PfiLineRepository } from '@modules/pfi/repository/repositories/pfi-line.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';
import { formatCompanyAddress } from '@modules/company/utils/format-address';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 10000) / 10000;

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
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly pfiRepository: PfiRepository,
        private readonly pfiLineRepository: PfiLineRepository,
        private readonly priceListRepository: PriceListRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        vendorId: string,
        vendorAddressId?: string
    ): Promise<{ addressMismatched?: boolean } | void> {
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
        vendorId: string,
        provided?: string
    ): Promise<string | null> {
        if (provided) return provided;
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
            const addr: any = await this.companyAddressRepository.findOne({
                _id: providedAddressId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (!addr) {
                throw new BadRequestException(
                    `delivery_address_id ${providedAddressId} not found for this company.`
                );
            }
            return {
                text: formatCompanyAddress(addr),
                id: providedAddressId,
            };
        }
        throw new BadRequestException(
            'delivery_address_id is required. Pick a company address (Profile → Addresses) or supply delivery_address text.'
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
            quotation_id: data.quotation_id || null,
            pfi_id: data.pfi_id || null,
            po_date: data.po_date,
            expected_delivery_date: data.expected_delivery_date || null,
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
            data.vendor_id || row.vendor_id.toString(),
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

    private async replaceLines(
        companyId: string,
        poId: string,
        lines?: any[]
    ): Promise<void> {
        await this.poLineRepository.deleteByPurchaseOrderId(poId);
        if (!lines?.length) return;

        let seq = 0;
        for (const l of lines) {
            seq += 1;
            await this.poLineRepository.create({
                company_id: companyId,
                purchase_order_id: poId,
                product_id: l.product_id,
                source_quotation_line_id: l.source_quotation_line_id || null,
                source_pfi_line_id: l.source_pfi_line_id || null,
                description: l.description || null,
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
            } as any);
        }
    }

    // ─── Costing engine ─────────────────────────────────────────────────

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

        let subtotal = 0;
        let cgst_total = 0;
        let sgst_total = 0;
        let igst_total = 0;

        for (const ln of lines) {
            const out = computeLineTax({
                qty: num(ln.qty),
                unit_price: num(ln.unit_price),
                discount_pct: num(ln.discount_pct),
                tax_pct: num(ln.tax_pct),
                customer_state: vendorState,
                company_state: companyState,
            });

            ln.taxable = String(out.taxable);
            ln.cgst = String(out.cgst);
            ln.sgst = String(out.sgst);
            ln.igst = String(out.igst);
            ln.line_total = String(out.line_total);
            await this.poLineRepository.save(ln);

            subtotal += out.taxable;
            cgst_total += out.cgst;
            sgst_total += out.sgst;
            igst_total += out.igst;
        }

        const tax_total = cgst_total + sgst_total + igst_total;
        const grand_raw = subtotal + tax_total;
        const grand = Math.round(grand_raw);
        const round_off = round2(grand - grand_raw);

        header.subtotal = String(round2(subtotal));
        header.cgst_total = String(round2(cgst_total));
        header.sgst_total = String(round2(sgst_total));
        header.igst_total = String(round2(igst_total));
        header.tax_total = String(round2(tax_total));
        header.round_off = String(round_off);
        header.grand_total = String(round2(grand));

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

        return {
            source: {
                type: 'pfi',
                _id: pfi._id.toString(),
                voucher_no: (pfi as any).voucher_no,
                status: (pfi as any).status,
                customer_id: (pfi as any).customer_id?.toString(),
            },
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

        return {
            source: {
                type: 'quotation',
                _id: q._id.toString(),
                voucher_no: (q as any).voucher_no,
                status: (q as any).status,
                customer_id: (q as any).customer_id?.toString(),
            },
            lines: enriched,
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
        opts?: { deliveryAddressId?: string; deliveryAddressText?: string }
    ) {
        const pfi = await this.pfiRepository.findOne({
            _id: pfiId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!pfi) throw new NotFoundException('Source PFI not found');

        const lines = await this.pfiLineRepository.findAll({
            pfi_id: pfiId,
        } as any);

        return this.createPosFromAssignments({
            companyId,
            createdBy,
            sourceType: 'pfi',
            sourceId: pfiId,
            sourceLines: lines as any[],
            assignments,
            customerId: (pfi as any).customer_id?.toString(),
            deliveryAddressId: opts?.deliveryAddressId,
            deliveryAddressText: opts?.deliveryAddressText,
        });
    }

    async createFromQuotation(
        companyId: string,
        quotationId: string,
        createdBy: string,
        assignments: Array<{ source_line_id: string; vendor_id: string }>,
        opts?: { deliveryAddressId?: string; deliveryAddressText?: string }
    ) {
        const q = await this.quotationRepository.findOne({
            _id: quotationId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!q) throw new NotFoundException('Source Quotation not found');

        const lines = await this.quotationLineRepository.findAll({
            quotation_id: quotationId,
        } as any);

        return this.createPosFromAssignments({
            companyId,
            createdBy,
            sourceType: 'quotation',
            sourceId: quotationId,
            sourceLines: lines as any[],
            assignments,
            customerId: (q as any).customer_id?.toString(),
            deliveryAddressId: opts?.deliveryAddressId,
            deliveryAddressText: opts?.deliveryAddressText,
        });
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(
        rows: PurchaseOrderDoc[]
    ): Promise<PurchaseOrderGetResponseDto[]> {
        if (!rows.length) return [];

        const vendorIds = unique(rows.map(r => r.vendor_id?.toString()));
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
                customer_name: cust?.company_name,
                customer_contact_name: custPrimary?.name,
                customer_contact_email: custPrimary?.email,
                customer_contact_phone: custPrimary?.phone,
                customer_contact_country_code: custPrimary?.country_code,
                quotation_id: r.quotation_id?.toString(),
                quotation_voucher_no: q?.voucher_no,
                pfi_id: r.pfi_id?.toString(),
                pfi_voucher_no: pfi?.voucher_no,
                po_date: r.po_date,
                expected_delivery_date: r.expected_delivery_date,
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
                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                lines: (linesByPo.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (l: any): PurchaseOrderLineResponseDto => ({
                            _id: l._id?.toString(),
                            product_id: l.product_id?.toString(),
                            product_name: (
                                productMap.get(l.product_id?.toString()) as any
                            )?.name,
                            product_code: (
                                productMap.get(l.product_id?.toString()) as any
                            )?.code,
                            source_quotation_line_id:
                                l.source_quotation_line_id?.toString(),
                            source_pfi_line_id:
                                l.source_pfi_line_id?.toString(),
                            description: l.description,
                            hsn_code: l.hsn_code,
                            qty: l.qty,
                            unit: l.unit,
                            unit_price: l.unit_price,
                            discount_pct: l.discount_pct,
                            tax_pct: l.tax_pct,
                            cgst: l.cgst,
                            sgst: l.sgst,
                            igst: l.igst,
                            taxable: l.taxable,
                            line_total: l.line_total,
                            seq: l.seq,
                        })
                    ),
            };
        });
    }

    async mapGet(
        row: PurchaseOrderDoc
    ): Promise<PurchaseOrderGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
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
