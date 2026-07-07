import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { InjectDatabaseConnection } from '@common/database/decorators/database.decorator';

import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { InvoicePaymentRepository } from '../repository/repositories/invoice-payment.repository';
import { InvoicePaymentDoc } from '../repository/entities/invoice-payment.entity';
import { InvoicePaymentCreateRequestDto } from '../dtos/request/invoice-payment.create.request.dto';
import { InvoiceDoc } from '../repository/entities/invoice.entity';
import { InvoiceLineDoc } from '../repository/entities/invoice-line.entity';
import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_INVOICE_STATUS,
    ENUM_INVOICE_TYPE,
    ENUM_SHIPPING_BILL_TYPE,
    INVOICE_EDITABLE_AT_ISSUED,
} from '../enums/invoice.enum';
import {
    InvoiceCreateRequestDto,
    InvoiceLineDto,
} from '../dtos/request/invoice.create.request.dto';
import { InvoiceUpdateRequestDto } from '../dtos/request/invoice.update.request.dto';
import {
    InvoiceGetResponseDto,
    InvoiceLineResponseDto,
    InvoiceListResponseDto,
} from '../dtos/response/invoice.get.response.dto';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { numberToIndianWords } from '@common/utils/amount-in-words';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';
import { In } from 'typeorm';
import { StockLedgerService } from '@modules/inventory/services/stock-ledger.service';
import { ENUM_STOCK_MOVEMENT_TYPE } from '@modules/inventory/enums/stock-movement.enum';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sum a rebate snapshot array. PFI/PO convention: value lives in `pct`
 * regardless of `type`. For `type='fixed'` the `pct` field carries an
 * absolute amount in document currency.
 *
 *   rebate row = { rebate_id, code, name, type: 'percent'|'fixed', pct: string }
 */
function sumRebates(items: any, base: number): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let total = 0;
    for (const r of items) {
        if (!r) continue;
        total +=
            r.type === 'fixed' ? num(r.pct) : (base * num(r.pct)) / 100;
    }
    return total;
}

/**
 * Sum an expense snapshot array. PFI/PO convention: value lives in `value`
 * (not `pct`). For `type='percent'` it's a % of base; for `type='fixed'`
 * it's an absolute amount.
 *
 *   expense row = { expense_id, code, name, type: 'percent'|'fixed', value: string }
 */
function sumExpenses(items: any, base: number): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let total = 0;
    for (const e of items) {
        if (!e) continue;
        total +=
            e.type === 'percent' ? (base * num(e.value)) / 100 : num(e.value);
    }
    return total;
}

@Injectable()
export class InvoiceService {
    private readonly logger = new Logger(InvoiceService.name);

    constructor(
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoiceLineRepository: InvoiceLineRepository,
        private readonly voucherService: VoucherService,
        private readonly companyRepository: CompanyRepository,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository,
        private readonly productRepository: ProductRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly stockLedger: StockLedgerService,
        @InjectDatabaseConnection() private readonly dataSource: DataSource
    ) {}

    // ─── Company snapshot ───────────────────────────────────────────────

    /**
     * Pulls the company's GSTIN / PAN / IEC / AD code from master tables and
     * returns them as a snapshot bundle. Used at create() and issue() time.
     *
     * Sources:
     *  - GSTIN     → default `company_addresses.gstin` (multi-state aware), fallback `company.tax_number`
     *  - PAN       → `company.pan`
     *  - IEC       → `company.iec`
     *  - AD code   → default `company_bank_accounts.ad_code` (forex-receiving account)
     *  - Voucher prefix → `company.voucher_prefix` (fallback: first 5 chars of company_name)
     */
    private async loadCompanyContext(companyId: string): Promise<{
        gst_no?: string;
        pan_no?: string;
        iec_no?: string;
        ad_code?: string;
        voucher_prefix: string;
        bank_snapshots: any[];
        default_terms?: string;
        lut_no?: string;
        lut_date?: string;
    }> {
        const company: any = await this.companyRepository.findOneById(companyId);
        if (!company) {
            throw new NotFoundException('Company not found');
        }

        const addresses = await this.companyAddressRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any);
        const defaultAddress: any =
            addresses.find((a: any) => a.is_default) || addresses[0];

        const bankAccounts = await this.companyBankAccountRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            is_active: true,
        } as any);
        const defaultBank: any =
            bankAccounts.find((b: any) => b.is_default) || bankAccounts[0];

        const bank_snapshots = (bankAccounts as any[]).map((b) => ({
            name: b.bank_name,
            account_no: b.account_number,
            beneficiary: b.account_holder_name,
            ad_code: b.ad_code,
            swift_code: b.swift_code,
            branch: b.branch_name,
            currency_code: undefined, // bank entity doesn't have currency yet
        }));

        return {
            gst_no: defaultAddress?.gstin || company.tax_number || undefined,
            pan_no: company.pan || undefined,
            iec_no: company.iec || undefined,
            ad_code: defaultBank?.ad_code || undefined,
            voucher_prefix:
                (company.voucher_prefix || '').toUpperCase().trim() ||
                (company.company_name || 'CO').substring(0, 5).toUpperCase(),
            bank_snapshots,
            default_terms: company.default_terms || undefined,
            lut_no: company.lut_no || undefined,
            lut_date: company.lut_date || undefined,
        };
    }

    /**
     * Resolve the picked `company_address_id` (or pick default) into a
     * frozen snapshot. Returns null when no address can be found at all.
     * Snapshot shape is intentionally flat — PDF reads it directly.
     */
    private async resolveCompanyAddressSnapshot(
        companyId: string,
        pickedAddressId?: string | null
    ): Promise<{ id: string | null; snapshot: any | null }> {
        const addresses = await this.companyAddressRepository.findAll({
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!addresses?.length) return { id: null, snapshot: null };
        let addr: any = null;
        if (pickedAddressId) {
            addr = (addresses as any[]).find(
                (a: any) => a._id?.toString() === pickedAddressId
            );
        }
        if (!addr) {
            // Default fallback: corporate + is_default → corporate → is_default → first.
            addr =
                (addresses as any[]).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses as any[]).find((a: any) => a.type === 'corporate') ||
                (addresses as any[]).find((a: any) => a.is_default) ||
                (addresses as any[])[0];
        }
        if (!addr) return { id: null, snapshot: null };
        return {
            id: addr._id?.toString() || null,
            snapshot: {
                label: addr.label || null,
                type: addr.type || null,
                address_line1: addr.address_line1 || null,
                address_line2: addr.address_line2 || null,
                city: addr.city || null,
                state: addr.state || null,
                postcode: addr.postcode || null,
                country: addr.country || null,
                gstin: addr.gstin || null,
            },
        };
    }

    // ─── Create ─────────────────────────────────────────────────────────

    async create(
        companyId: string,
        data: InvoiceCreateRequestDto,
        userId: string
    ): Promise<InvoiceDoc> {
        await this.assertQtyGuardForLines(data.lines);

        // Resolve source SOs (POs) + enforce the single-source invariant
        // (one customer / currency / country) before writing anything.
        const source = await this.loadSourcePoContext(data.lines);
        this.assertSingleSourceInvariant(source.pos, data.customer_id);

        // Pull defaults from Company master so the DRAFT carries snapshot
        // values from the start - operator can override before issuing.
        const ctx = await this.loadCompanyContext(companyId);
        const companyAddr = await this.resolveCompanyAddressSnapshot(
            companyId,
            (data as any).company_address_id
        );

        // Snapshot the upstream voucher chain onto the invoice header so the
        // PDF "References" block can print them (§10). Derived from the source
        // SO(s) + their quotations; multiple sources are comma-joined.
        const sourcePoVouchers = Array.from(
            new Set(
                (source.pos || [])
                    .map((p: any) => p?.voucher_no)
                    .filter((v: any): v is string => !!v)
            )
        );
        const sourceQuotationVouchers = Array.from(
            new Set(
                Array.from(source.byPoLineId.values())
                    .map((v: any) => v?.quotationVoucherNo)
                    .filter((v: any): v is string => !!v)
            )
        );

        // First source Sales Order that carries a consignee — used to inherit
        // the Consignee (Ship-to) onto the invoice when not supplied.
        const srcConsigneePo: any = (source.pos || []).find(
            (p: any) => p?.consignee_snapshot || p?.consignee_id
        );

        // First source Sales Order that carries a bill-to address — used to
        // inherit the Bill-to (customer_address_id) onto the invoice when the
        // payload doesn't supply one, so the Bill To block always prints.
        const srcCustomerAddrPo: any = (source.pos || []).find(
            (p: any) => p?.customer_address_id
        );

        // Assign the invoice number up-front so the DRAFT already carries a
        // stable voucher (e.g. STIPL/INV/0001/2026-27). voucher_prefix always
        // resolves (falls back to the company name), so this never blocks
        // draft creation; issue() reuses this number rather than minting a new
        // one. Mirrors how Sales Order / Vendor PO number their drafts.
        const draftVoucherNo = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT,
            ctx.voucher_prefix,
            new Date(data.invoice_date)
        );

        const header = await this.invoiceRepository.create({
            company_id: companyId,
            created_by: userId,
            invoice_type: data.invoice_type || ENUM_INVOICE_TYPE.EXPORT,
            status: ENUM_INVOICE_STATUS.DRAFT,
            voucher_no: draftVoucherNo,
            invoice_date: data.invoice_date,
            due_date: data.due_date,
            purchase_order_id: data.purchase_order_id,
            purchase_order_voucher_no: sourcePoVouchers.join(', ') || null,
            pfi_id: data.pfi_id,
            quotation_id: data.quotation_id,
            quotation_voucher_no: sourceQuotationVouchers.join(', ') || null,
            // Default the buyer's PO# from the source Sales Order (S4) when
            // the invoice payload didn't carry one; operator can override.
            customer_po_no:
                data.customer_po_no ||
                (source.pos || []).find((p) => p?.customer_po_number)
                    ?.customer_po_number ||
                undefined,
            country_of_destination: data.country_of_destination,
            country_of_origin: data.country_of_origin || 'India',
            customer_id: data.customer_id,
            // Inherit the Bill-to address from the source Sales Order when the
            // invoice payload doesn't carry one (operator can still override).
            customer_address_id:
                data.customer_address_id ||
                srcCustomerAddrPo?.customer_address_id?.toString() ||
                null,
            // Inherit the consignee from the source Sales Order when the
            // invoice payload doesn't carry one (operator can still override).
            consignee_id:
                data.consignee_id ||
                srcConsigneePo?.consignee_id?.toString() ||
                null,
            consignee_address_id:
                data.consignee_address_id ||
                srcConsigneePo?.consignee_address_id?.toString() ||
                null,
            consignee_snapshot:
                (data as any).consignee_snapshot ||
                srcConsigneePo?.consignee_snapshot ||
                null,
            notify_party_id: data.notify_party_id,
            notify_party_snapshot: (data as any).notify_party_snapshot || null,
            company_address_id: companyAddr.id,
            company_address_snapshot: companyAddr.snapshot,
            currency_code: data.currency_code,
            currency_symbol: data.currency_symbol,
            exchange_rate: data.exchange_rate || '1',
            discount_total: data.discount_total || '0',
            freight_charges: data.freight_charges || '0',
            insurance_charges: data.insurance_charges || '0',
            other_charges: data.other_charges || '0',
            // Carry the advance already collected on the source Sales Order(s)
            // (S4 advance_amount) when the payload didn't supply one — backstop
            // for API-direct callers; the create form prefills it visibly. Only
            // applies when genuinely absent so an explicit 0 is respected.
            // Overwritten by the sum of recorded payments once any is logged.
            advance_received:
                data.advance_received != null && data.advance_received !== ''
                    ? data.advance_received
                    : String(
                          (source.pos || []).reduce(
                              (sum, p) => sum + num(p?.advance_amount),
                              0
                          ) || 0
                      ),
            gst_route: data.gst_route || ENUM_INVOICE_GST_ROUTE.IGST_PAID,
            lut_no: data.lut_no !== undefined ? data.lut_no : ctx.lut_no,
            lut_date: data.lut_date !== undefined ? data.lut_date : ctx.lut_date,
            // Company snapshots - pre-filled, operator can override before issue.
            gst_no: ctx.gst_no,
            pan_no: ctx.pan_no,
            iec_no: ctx.iec_no,
            ad_code: ctx.ad_code,
            incoterm: data.incoterm,
            payment_terms: data.payment_terms,
            delivery_terms: data.delivery_terms,
            end_use_code: data.end_use_code,
            preferential_agreement: data.preferential_agreement,
            // ── Shipment & Shipping Bill (§3a) — optional at create ──
            mode: data.mode,
            shipping_bill_type:
                data.shipping_bill_type || ENUM_SHIPPING_BILL_TYPE.FREE,
            shipping_bill_no: data.shipping_bill_no,
            shipping_bill_date: data.shipping_bill_date,
            port_of_loading_id: data.port_of_loading_id,
            port_of_loading_snapshot: (data as any).port_of_loading_snapshot,
            port_of_discharge_id: data.port_of_discharge_id,
            port_of_discharge_snapshot: (data as any).port_of_discharge_snapshot,
            pre_carriage_by: data.pre_carriage_by,
            place_of_receipt: data.place_of_receipt,
            place_of_delivery: data.place_of_delivery,
            total_packages: data.total_packages,
            net_weight_kg: data.net_weight_kg,
            gross_weight_kg: data.gross_weight_kg,
            bl_awb_no: data.bl_awb_no,
            // Pre-fill banks from active company bank accounts if client didn't pass any.
            bank_snapshots:
                data.bank_snapshots && data.bank_snapshots.length > 0
                    ? data.bank_snapshots
                    : ctx.bank_snapshots,
            notes_to_buyer: data.notes_to_buyer,
            internal_notes: data.internal_notes,
            declaration_text: data.declaration_text,
            terms:
                (data as any).terms !== undefined
                    ? (data as any).terms
                    : ctx.default_terms,
        } as any);

        await this.writeLines(
            header._id.toString(),
            companyId,
            data.lines,
            source.byPoLineId
        );
        await this.recompute(header._id.toString());

        this.logger.log(`Invoice DRAFT created: ${header._id}`);
        return this.invoiceRepository.findOneById(header._id.toString());
    }

    // ─── Update (gated by status) ───────────────────────────────────────

    async update(
        row: InvoiceDoc,
        data: InvoiceUpdateRequestDto
    ): Promise<InvoiceDoc> {
        if (row.status === ENUM_INVOICE_STATUS.CANCELLED) {
            throw new BadRequestException('Cancelled invoice cannot be updated.');
        }

        if (row.status === ENUM_INVOICE_STATUS.DRAFT) {
            // Everything editable.
            const lines = data.lines;
            const { lines: _omit, ...header } = data as any;
            Object.assign(row, header);

            // Refresh company_address_snapshot whenever company_address_id
            // is in the payload (or row carries one) — snapshot stays in
            // sync with the picked address until issue() freezes it.
            if (
                (data as any).company_address_id !== undefined ||
                row.company_address_id
            ) {
                const resolved = await this.resolveCompanyAddressSnapshot(
                    row.company_id.toString(),
                    (data as any).company_address_id ?? row.company_address_id
                );
                (row as any).company_address_id = resolved.id;
                (row as any).company_address_snapshot = resolved.snapshot;
            }

            await this.invoiceRepository.save(row);

            if (Array.isArray(lines)) {
                await this.assertQtyGuardForLines(lines, row._id.toString());
                const source = await this.loadSourcePoContext(lines);
                this.assertSingleSourceInvariant(
                    source.pos,
                    row.customer_id?.toString()
                );
                await this.invoiceLineRepository.deleteByInvoiceId(
                    row._id.toString()
                );
                await this.writeLines(
                    row._id.toString(),
                    row.company_id.toString(),
                    lines,
                    source.byPoLineId
                );
            }
            await this.recompute(row._id.toString());
            return this.invoiceRepository.findOneById(row._id.toString());
        }

        // ISSUED / PARTIALLY_PAID / PAID - only whitelisted header fields editable.
        const whitelisted: any = {};
        for (const key of INVOICE_EDITABLE_AT_ISSUED) {
            if ((data as any)[key] !== undefined) {
                whitelisted[key] = (data as any)[key];
            }
        }
        if (Object.keys(whitelisted).length === 0) {
            throw new BadRequestException(
                `Invoice is ${row.status} - only ${INVOICE_EDITABLE_AT_ISSUED.join(', ')} are editable.`
            );
        }
        Object.assign(row, whitelisted);
        await this.invoiceRepository.save(row);
        await this.recompute(row._id.toString());
        return this.invoiceRepository.findOneById(row._id.toString());
    }

    /**
     * Goods-Out preview for the issue confirmation: per-product required qty
     * vs current on-hand (single pool, same comparison the issue() guard uses).
     * Lets the UI list exactly what leaves stock and disable the Issue button
     * when any product is short — before hitting the server-side guard.
     */
    async issuePreview(invoiceId: string): Promise<{
        lines: Array<{
            product_id: string;
            product_name: string;
            product_code: string;
            uom: string;
            required: string;
            available: string;
            short: boolean;
        }>;
        has_shortage: boolean;
    }> {
        const row = await this.findOneById(invoiceId);
        const lines = await this.invoiceLineRepository.findByInvoiceId(
            row._id.toString()
        );
        // Aggregate required qty per product (lines may repeat a product);
        // keep a display uom per product for the dialog.
        const needByProduct = new Map<string, number>();
        const uomByProduct = new Map<string, string>();
        for (const l of lines as any[]) {
            if (!l.product_id) continue;
            const pid = l.product_id.toString();
            needByProduct.set(pid, (needByProduct.get(pid) || 0) + num(l.qty));
            if (!uomByProduct.has(pid))
                uomByProduct.set(pid, l.uqc_code || l.unit || '');
        }
        if (needByProduct.size === 0)
            return { lines: [], has_shortage: false };

        const productIds = [...needByProduct.keys()];
        const have = await this.stockLedger.onHandMap(
            row.company_id.toString(),
            productIds,
            null
        );
        const products = await this.productRepository.findAll({
            _id: { $in: productIds },
        });
        const metaById = new Map(
            (products as any[]).map((p: any) => [
                p._id.toString(),
                { name: p.name || '', code: p.code || '' },
            ])
        );

        const out = productIds.map((pid) => {
            const required = round2(needByProduct.get(pid) || 0);
            const available = round2(have.get(pid) || 0);
            const meta = metaById.get(pid) || { name: '', code: '' };
            return {
                product_id: pid,
                product_name: meta.name,
                product_code: meta.code,
                uom: uomByProduct.get(pid) || '',
                required: String(required),
                available: String(available),
                short: available < required - 1e-6,
            };
        });
        out.sort((a, b) =>
            (a.product_name || '').localeCompare(b.product_name || '')
        );
        return { lines: out, has_shortage: out.some((r) => r.short) };
    }

    // ─── Issue (DRAFT → ISSUED) ─────────────────────────────────────────

    async issue(row: InvoiceDoc, userId: string): Promise<InvoiceDoc> {
        if (row.status !== ENUM_INVOICE_STATUS.DRAFT) {
            throw new BadRequestException(
                `Only DRAFT invoices can be issued (current: ${row.status}).`
            );
        }

        // Load fresh company context - required fields must be set in master
        // before issuing. Re-snapshot here so the issued invoice reflects
        // current company profile (operator may have just filled in PAN/IEC).
        const ctx = await this.loadCompanyContext(row.company_id.toString());

        // Hard checks - refuse issue if Company Profile is incomplete.
        const missing: string[] = [];
        if (!ctx.gst_no) missing.push('GSTIN (Company Profile → Tax Number or default Address.gstin)');
        if (!ctx.pan_no) missing.push('PAN (Company Profile → PAN)');
        if (!ctx.iec_no) missing.push('IEC (Company Profile → IEC)');
        if (!ctx.voucher_prefix || ctx.voucher_prefix.length < 2) {
            missing.push('Voucher prefix (Company Profile → Voucher Prefix, e.g. "STIPL")');
        }
        if (missing.length) {
            throw new BadRequestException(
                `Cannot issue invoice - Company Profile is incomplete. Missing: ${missing.join('; ')}.`
            );
        }

        if (row.gst_route === ENUM_INVOICE_GST_ROUTE.LUT_ZERO_RATED) {
            if (!row.lut_no || !row.lut_date) {
                throw new BadRequestException(
                    'lut_no and lut_date are required for LUT zero-rated invoices.'
                );
            }
        }
        if (!row.bank_snapshots || (row.bank_snapshots as any[]).length === 0) {
            // Fallback to company defaults if invoice has none yet.
            if (ctx.bank_snapshots.length === 0) {
                throw new BadRequestException(
                    'At least one bank account must be configured on the Company Profile before issuing.'
                );
            }
            row.bank_snapshots = ctx.bank_snapshots;
        }

        // Refresh snapshots to current master values (operator may have
        // updated PAN/GST since draft creation).
        row.gst_no = ctx.gst_no;
        row.pan_no = ctx.pan_no;
        row.iec_no = ctx.iec_no;
        row.ad_code = ctx.ad_code;

        // Freeze company address snapshot from the currently-picked id (or
        // default fallback). Mirrors the gst_no/pan_no refresh above so the
        // issued PDF reflects the address master at issue time.
        const frozen = await this.resolveCompanyAddressSnapshot(
            row.company_id.toString(),
            row.company_address_id
        );
        (row as any).company_address_id = frozen.id;
        (row as any).company_address_snapshot = frozen.snapshot;

        // Voucher is normally minted at draft creation (STIPL/INV/0001/2026-27)
        // and carried through to issue. Only mint here as a backstop for legacy
        // drafts created before voucher-at-draft, so issue() never consumes a
        // second number for an invoice that already has one.
        if (!row.voucher_no) {
            row.voucher_no = await this.voucherService.getNext(
                row.company_id.toString(),
                ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT,
                ctx.voucher_prefix,
                new Date(row.invoice_date)
            );
        }

        // Seed the upfront advance (carried from the Sales Order) as the first
        // payment receipt. Otherwise the header `advance_received` gets
        // overwritten by the payment-log sum the moment a later payment is
        // recorded (applyPaymentDerived), silently dropping the advance. As a
        // real receipt it survives, gets its own receipt voucher, and later
        // payments simply add on top.
        const advanceAmt = num(row.advance_received);
        if (advanceAmt > 0) {
            const existingPayments =
                await this.invoicePaymentRepository.findActiveByInvoiceId(
                    row._id.toString()
                );
            if (!existingPayments.length) {
                const receiptNo = await this.voucherService.getNext(
                    row.company_id.toString(),
                    ENUM_VOUCHER_DOC_TYPE.RECEIPT,
                    ctx.voucher_prefix,
                    new Date(row.invoice_date)
                );
                await this.invoicePaymentRepository.create({
                    invoice_id: row._id.toString(),
                    company_id: row.company_id.toString(),
                    payment_date: row.invoice_date,
                    amount: String(advanceAmt),
                    currency_code: row.currency_code,
                    method: 'advance',
                    reference: 'Advance against Sales Order',
                    receipt_voucher_no: receiptNo,
                    created_by: userId,
                } as any);
            }
        }

        // Compute IGST refund buckets per HSN rate (only for igst_paid route).
        const lines = await this.invoiceLineRepository.findByInvoiceId(
            row._id.toString()
        );
        if (row.gst_route === ENUM_INVOICE_GST_ROUTE.IGST_PAID) {
            const { buckets, totalRefund } = this.buildIgstRefundBuckets(
                lines,
                num(row.exchange_rate)
            );
            row.igst_refund_buckets = buckets;
            row.igst_refund_amount = String(round2(totalRefund));
        } else {
            row.igst_refund_buckets = null;
            row.igst_refund_amount = '0';
        }

        // ── Pre-issue stock check (Goods Out) ──────────────────────────────
        // Block the issue if any product is short. On-hand is a single pool
        // per product (location = null → SUM across all GRN-in), since invoices
        // carry no location in single-tenant.
        const stockCompanyId = row.company_id.toString();
        const needByProduct = new Map<string, number>();
        for (const l of lines as any[]) {
            if (!l.product_id) continue;
            needByProduct.set(
                l.product_id,
                (needByProduct.get(l.product_id) || 0) + num(l.qty)
            );
        }
        if (needByProduct.size > 0) {
            const productIds = [...needByProduct.keys()];
            const have = await this.stockLedger.onHandMap(
                stockCompanyId,
                productIds,
                null
            );
            const short = [...needByProduct.entries()].filter(
                ([pid, need]) => (have.get(pid) || 0) < need - 1e-6
            );
            if (short.length > 0) {
                const products = await this.productRepository.findAll({
                    _id: { $in: short.map(([pid]) => pid) },
                });
                const nameById = new Map(
                    (products as any[]).map((p: any) => [
                        p._id.toString(),
                        p.code || p.name,
                    ])
                );
                throw new BadRequestException(
                    `Not enough stock to issue: ${short
                        .map(
                            ([pid, need]) =>
                                `${nameById.get(pid) || pid} (available ${round2(
                                    have.get(pid) || 0
                                )}, required ${round2(need)})`
                        )
                        .join('; ')}`
                );
            }
        }

        row.status = ENUM_INVOICE_STATUS.ISSUED;
        row.issued_by = userId;
        row.issued_at = new Date();

        await this.invoiceRepository.save(row);

        // ── Goods Out — deduct stock now that the invoice is ISSUED ─────────
        try {
            for (const l of lines as any[]) {
                const q = num(l.qty);
                if (!l.product_id || q <= 0) continue;
                await this.stockLedger.post(stockCompanyId, {
                    product_id: l.product_id,
                    location_id: null,
                    qty: -q,
                    movement_type: ENUM_STOCK_MOVEMENT_TYPE.SALE_OUT,
                    source_type: 'invoice',
                    source_id: row._id.toString(),
                    source_line_id: l._id.toString(),
                    source_voucher_no: row.voucher_no,
                    created_by: userId,
                });
            }
        } catch (e: any) {
            this.logger.error(
                `[Invoice ${row._id}] stock deduct failed: ${e?.message}`
            );
        }

        await this.recompute(row._id.toString());

        this.logger.log(`Invoice issued: ${row._id} (${row.voucher_no})`);
        return this.invoiceRepository.findOneById(row._id.toString());
    }

    // ─── Cancel ─────────────────────────────────────────────────────────

    async cancel(
        row: InvoiceDoc,
        reason: string | undefined,
        userId: string
    ): Promise<InvoiceDoc> {
        if (row.status === ENUM_INVOICE_STATUS.CANCELLED) return row;
        if (row.status === ENUM_INVOICE_STATUS.PAID) {
            throw new BadRequestException('Paid invoice cannot be cancelled.');
        }

        row.status = ENUM_INVOICE_STATUS.CANCELLED;
        row.cancelled_by = userId;
        row.cancelled_at = new Date();
        row.cancelled_reason = reason;

        await this.invoiceRepository.save(row);

        // ── Restore stock — reverse the sale_out rows (no-op for a draft that
        // was never issued, since it posted none). ─────────────────────────
        try {
            await this.stockLedger.reverse(
                row.company_id.toString(),
                'invoice',
                row._id.toString(),
                ENUM_STOCK_MOVEMENT_TYPE.SALE_REVERSAL,
                reason,
                userId
            );
        } catch (e: any) {
            this.logger.error(
                `[Invoice ${row._id}] stock restore failed: ${e?.message}`
            );
        }

        this.logger.log(`Invoice cancelled: ${row._id}`);
        return row;
    }

    // ─── Payments ───────────────────────────────────────────────────────

    /**
     * Record a payment receipt against an Issued/Partially_Paid invoice.
     * Append-only — voiding a payment is a separate action that leaves
     * the original row for audit. Status + advance_received +
     * balance_receivable are derived from the sum of active payments.
     */
    async recordPayment(
        row: InvoiceDoc,
        data: InvoicePaymentCreateRequestDto,
        userId: string
    ): Promise<InvoicePaymentDoc> {
        if (
            row.status !== ENUM_INVOICE_STATUS.ISSUED &&
            row.status !== ENUM_INVOICE_STATUS.PARTIALLY_PAID
        ) {
            throw new BadRequestException(
                `Cannot record payment when invoice status is ${row.status}.`
            );
        }
        const amount = num(data.amount);
        if (amount <= 0) {
            throw new BadRequestException('Payment amount must be > 0.');
        }
        const priorPaid = await this.invoicePaymentRepository.sumActiveByInvoiceId(
            row._id.toString()
        );
        const grand = num(row.grand_total);
        // 1¢ slack for FP rounding.
        if (priorPaid + amount > grand + 1e-2) {
            throw new BadRequestException(
                `Payment ${amount} exceeds outstanding balance ${round2(
                    grand - priorPaid
                )}.`
            );
        }

        // Assign a stable receipt voucher number (STIPL/RCP/0001/FY) at
        // creation so the printable receipt has a fixed reference even if the
        // payment is later voided.
        const company: any = await this.companyRepository.findOneById(
            row.company_id.toString()
        );
        const voucherPrefix =
            ((company?.voucher_prefix || '').toUpperCase().trim() ||
                (company?.company_name || 'CO')
                    .substring(0, 5)
                    .toUpperCase()) as string;
        const receiptVoucherNo = await this.voucherService.getNext(
            row.company_id.toString(),
            ENUM_VOUCHER_DOC_TYPE.RECEIPT,
            voucherPrefix,
            new Date(data.payment_date)
        );

        const payment = await this.invoicePaymentRepository.create({
            invoice_id: row._id.toString(),
            company_id: row.company_id.toString(),
            payment_date: data.payment_date,
            amount: data.amount,
            currency_code: row.currency_code,
            method: data.method,
            reference: data.reference,
            notes: data.notes,
            receipt_voucher_no: receiptVoucherNo,
            created_by: userId,
        } as any);

        await this.applyPaymentDerived(row);
        this.logger.log(
            `Invoice ${row._id} payment recorded: ${data.amount}`
        );
        return payment;
    }

    async voidPayment(
        paymentId: string,
        userId: string,
        reason?: string
    ): Promise<void> {
        const p: any = await this.invoicePaymentRepository.findOneById(
            paymentId
        );
        if (!p || p.soft_delete) {
            throw new NotFoundException('Payment not found');
        }
        if (p.voided_at) {
            throw new BadRequestException('Payment is already voided.');
        }
        p.voided_at = new Date();
        p.voided_by = userId;
        p.voided_reason = reason;
        await this.invoicePaymentRepository.save(p);

        const inv = await this.invoiceRepository.findOneById(
            p.invoice_id.toString()
        );
        if (inv) await this.applyPaymentDerived(inv);
    }

    async listPaymentsForInvoice(
        invoiceId: string
    ): Promise<InvoicePaymentDoc[]> {
        return this.invoicePaymentRepository.findActiveByInvoiceId(invoiceId);
    }

    /**
     * Refresh advance_received / balance_receivable / status from the
     * current sum of active payments. Status flips between ISSUED →
     * PARTIALLY_PAID → PAID and back as payments are added or voided.
     * Never touches CANCELLED.
     */
    private async applyPaymentDerived(row: InvoiceDoc): Promise<void> {
        if (row.status === ENUM_INVOICE_STATUS.CANCELLED) return;
        const paid = await this.invoicePaymentRepository.sumActiveByInvoiceId(
            row._id.toString()
        );
        const grand = num(row.grand_total);
        const bal = round2(grand - paid);
        row.advance_received = String(round2(paid));
        row.balance_receivable = String(bal);
        if (paid <= 1e-2) {
            row.status = ENUM_INVOICE_STATUS.ISSUED;
        } else if (bal <= 1e-2) {
            row.status = ENUM_INVOICE_STATUS.PAID;
        } else {
            row.status = ENUM_INVOICE_STATUS.PARTIALLY_PAID;
        }
        await this.invoiceRepository.save(row);
    }

    // ─── Find ───────────────────────────────────────────────────────────

    async findOneById(invoiceId: string): Promise<InvoiceDoc> {
        const row = await this.invoiceRepository.findOneById(invoiceId);
        if (!row || row.soft_delete) {
            throw new NotFoundException('Invoice not found');
        }
        return row;
    }

    async softDelete(row: InvoiceDoc): Promise<InvoiceDoc> {
        row.soft_delete = true;
        return this.invoiceRepository.save(row);
    }

    // ─── Recompute totals ───────────────────────────────────────────────

    /**
     * Recompute all derived monetary fields from the current line set + header
     * inputs. Idempotent - safe to call after any mutation. Writes back to DB.
     */
    async recompute(invoiceId: string): Promise<void> {
        const row = await this.invoiceRepository.findOneById(invoiceId);
        if (!row) return;
        const lines = await this.invoiceLineRepository.findByInvoiceId(invoiceId);

        // Per-line — MUST mirror the Quotation costing engine (the customer
        // source of truth) so the invoice total equals the quotation total.
        // SEQUENTIAL on the running amount:
        //   taxable      = qty × unit_price × (1 − discount_pct/100)
        //   + expenses    (Σ snapshot, computed on `taxable`)
        //   − rebates     (Σ snapshot, computed on the AFTER-expense total /
        //                  FOB value — DBK/RODTEP export incentives)
        //   + margin      (margin_pct, computed on the AFTER-rebate amount)
        // Keep everything unrounded through the chain; round only line_net.
        // On export tax_pct = 0 → cgst/sgst/igst stay 0.
        let subtotal = 0;
        for (const l of lines) {
            const qty = num(l.qty);
            const price = num(l.unit_price);
            const discount = num(l.discount_pct);
            const taxable = qty * price * (1 - discount / 100);

            const expensesTotal = sumExpenses(
                l.product_expenses_snapshot,
                taxable
            );
            const afterExpense = taxable + expensesTotal;
            const rebatesTotal = sumRebates(
                l.product_rebates_snapshot,
                afterExpense
            );
            const afterRebate = afterExpense - rebatesTotal;
            const marginPct = num((l as any).margin_pct);
            const marginAmt = (afterRebate * marginPct) / 100;
            const lineNet = round2(afterRebate + marginAmt);

            l.taxable_amount = String(lineNet);
            l.cgst_amount = '0';
            l.sgst_amount = '0';
            l.igst_amount = '0';
            l.line_total = String(lineNet);
            await this.invoiceLineRepository.save(l);
            subtotal += lineNet;
        }

        // Line items are stored in INR; charges/totals fields are typed in
        // the document (customer) currency. Convert the INR subtotal to the
        // document currency FIRST, then apply the doc-currency charges — this
        // matches the detail "costing breakdown" card and keeps every header
        // total in a single currency (the customer's). The old code subtracted
        // doc-currency charges from an INR subtotal, producing a mixed value.
        // exchange_rate convention: document-per-INR (doc = INR × rate).
        const er = num(row.exchange_rate) || 1;
        const subtotal_doc = round2(subtotal * er);
        const discount_total = num(row.discount_total);
        const fob_value = round2(subtotal_doc - discount_total);
        const freight = num(row.freight_charges);
        const insurance = num(row.insurance_charges);
        const other = num(row.other_charges);
        // Round the customer-currency grand total to a whole number so the
        // final invoice carries the same clean figure as the quotation/SO
        // (e.g. $80, not $80.44) — the amount the customer actually pays.
        const grand_total = Math.round(
            fob_value + freight + insurance + other
        );
        // INR equivalent of the document-currency grand total.
        const grand_total_inr = er > 0 ? round2(grand_total / er) : grand_total;
        const advance = num(row.advance_received);
        const balance = round2(grand_total - advance);

        row.subtotal = String(subtotal_doc);
        row.fob_value = String(fob_value);
        row.grand_total = String(grand_total);
        row.grand_total_inr = String(grand_total_inr);
        row.balance_receivable = String(balance);
        row.amount_in_words = numberToIndianWords(
            grand_total,
            row.currency_code || 'INR'
        );

        await this.invoiceRepository.save(row);
    }

    // ─── Qty guard ──────────────────────────────────────────────────────

    /**
     * Sell-from-stock gate (plan §7.5):
     *   per SO (PO) line:
     *     requested + already_invoiced ≤ ordered_qty
     *
     * The invoice can bill any SO-line qty not yet invoiced — a dispatched
     * Vendor PO is NO LONGER required (you can sell what you hold). On-hand
     * stock is enforced at ISSUE time (assertQtyGuardForLines runs on
     * draft/edit; the pre-issue stock check in issue() is the real guard).
     */
    private async assertQtyGuardForLines(
        lines: InvoiceLineDto[],
        excludeInvoiceId?: string
    ): Promise<void> {
        // Group requested qty by PO line.
        const requested = new Map<string, number>();
        for (const l of lines) {
            const k = l.purchase_order_line_id;
            requested.set(k, (requested.get(k) || 0) + num(l.qty));
        }
        if (!requested.size) return;

        // Available to invoice = the SO line's ordered qty (not dispatched).
        const poLineIds = Array.from(requested.keys());
        const poLines = (await this.poLineRepository.findAll({
            _id: { $in: poLineIds },
        } as any)) as any[];
        const orderedByPoLine = new Map<string, number>();
        for (const pl of poLines) {
            orderedByPoLine.set(pl._id.toString(), num(pl.qty));
        }

        for (const [poLineId, reqQty] of requested.entries()) {
            if (reqQty < 0) {
                throw new BadRequestException(
                    `qty must be ≥ 0 on PO line ${poLineId}`
                );
            }
            const alreadyInvoiced =
                await this.invoiceRepository.sumQtyByPoLineId(poLineId);
            // Exclude this invoice's prior qty so updates don't double-count.
            let selfPrev = 0;
            if (excludeInvoiceId) {
                const selfLines =
                    await this.invoiceLineRepository.findByInvoiceId(
                        excludeInvoiceId
                    );
                selfPrev = selfLines
                    .filter(
                        (l) => l.purchase_order_line_id?.toString() === poLineId
                    )
                    .reduce((s, l) => s + num(l.qty), 0);
            }
            const availableHistorical = alreadyInvoiced - selfPrev;
            if (availableHistorical < 0) {
                // Defensive — shouldn't happen.
                throw new BadRequestException(
                    `Qty guard inconsistency on PO line ${poLineId}.`
                );
            }
            const ordered = orderedByPoLine.get(poLineId) || 0;
            if (reqQty + availableHistorical > ordered + 1e-6) {
                throw new BadRequestException(
                    `Invoice qty (${reqQty}) exceeds the Sales Order line qty (${ordered}) on PO line ${poLineId}. Reduce qty.`
                );
            }
        }
    }

    // ─── Multi-SO source resolution + invariant ─────────────────────────

    /**
     * Resolve each line's source PO (SO) + its quotation voucher, keyed by
     * purchase_order_line_id. Used both to enforce the single-source invariant
     * and to snapshot purchase_order_voucher_no / quotation_voucher_no per line.
     * (SHIPPING_INVOICE_MERGE_PLAN §5b / §5c)
     */
    private async loadSourcePoContext(lines: InvoiceLineDto[]): Promise<{
        byPoLineId: Map<string, { po: any; quotationVoucherNo?: string }>;
        pos: any[];
    }> {
        const poLineIds = Array.from(
            new Set(
                lines.map((l) => l.purchase_order_line_id).filter(Boolean)
            )
        ) as string[];
        if (!poLineIds.length) return { byPoLineId: new Map(), pos: [] };

        const poLines = (await this.poLineRepository.findAll({
            _id: { $in: poLineIds },
        } as any)) as any[];

        const poIds = Array.from(
            new Set(
                poLines
                    .map((pl: any) => pl.purchase_order_id?.toString())
                    .filter((v): v is string => !!v)
            )
        );
        const pos = poIds.length
            ? ((await this.poRepository.findAll({
                  _id: { $in: poIds },
              } as any)) as any[])
            : [];
        const poById = new Map<string, any>(
            pos.map((p: any) => [p._id.toString(), p])
        );

        const quotationIds = Array.from(
            new Set(
                pos
                    .map((p: any) => p.quotation_id?.toString())
                    .filter((v): v is string => !!v)
            )
        );
        const quotations = quotationIds.length
            ? ((await this.quotationRepository.findAll({
                  _id: { $in: quotationIds },
              } as any)) as any[])
            : [];
        const qVoucherById = new Map<string, string>(
            quotations.map((q: any) => [q._id.toString(), q.voucher_no])
        );

        const byPoLineId = new Map<
            string,
            { po: any; quotationVoucherNo?: string }
        >();
        for (const pl of poLines) {
            const po = poById.get(pl.purchase_order_id?.toString());
            if (!po) continue;
            byPoLineId.set(pl._id.toString(), {
                po,
                quotationVoucherNo: po.quotation_id
                    ? qVoucherById.get(po.quotation_id.toString())
                    : undefined,
            });
        }
        return { byPoLineId, pos };
    }

    /**
     * Single-source invariant: one invoice = one customer + one currency +
     * one destination country. Every source SO (PO) must belong to the
     * invoice customer and the bundle must share a single currency + country.
     * The PO carries `customer_id` + `currency_code`; the destination country
     * lives in its `consignee_snapshot.country`. (SHIPPING_INVOICE_MERGE_PLAN §5b)
     */
    private assertSingleSourceInvariant(
        sourcePos: any[],
        headerCustomerId?: string
    ): void {
        if (!sourcePos.length) return;

        if (headerCustomerId) {
            const mismatched = sourcePos.find(
                (p: any) =>
                    p.customer_id &&
                    p.customer_id.toString() !== headerCustomerId.toString()
            );
            if (mismatched) {
                throw new BadRequestException(
                    'All source Sales Orders must belong to the invoice customer.'
                );
            }
        }

        const currencies = new Set(
            sourcePos
                .map((p: any) => (p.currency_code || '').toUpperCase())
                .filter(Boolean)
        );
        if (currencies.size > 1) {
            throw new BadRequestException(
                'All source Sales Orders must share the same currency.'
            );
        }

        const countries = new Set(
            sourcePos
                .map((p: any) =>
                    (p.consignee_snapshot?.country || '').trim().toLowerCase()
                )
                .filter(Boolean)
        );
        if (countries.size > 1) {
            throw new BadRequestException(
                'All source Sales Orders must share the same destination country.'
            );
        }
    }

    // ─── IGST refund buckets ────────────────────────────────────────────

    /**
     * Buckets invoice lines by `igst_rate_pct`. For each bucket:
     *   assessable_value_inr = Σ taxable_amount        (line values are INR)
     *   igst_amount_inr      = assessable_value_inr × rate
     *
     * Line `taxable_amount` is stored in INR, so it IS the assessable value —
     * no exchange-rate conversion (a prior version divided by the rate and
     * inflated the IGST ~1/rate×).
     *
     * Returns the array + the total IGST refund (sum of buckets).
     */
    private buildIgstRefundBuckets(
        lines: InvoiceLineDoc[],
        _exchangeRate: number
    ): { buckets: any[]; totalRefund: number } {
        const grouped = new Map<string, number>(); // rate_pct → INR assessable
        for (const l of lines) {
            const rate = num(l.igst_rate_pct);
            const taxableInr = num(l.taxable_amount);
            grouped.set(String(rate), (grouped.get(String(rate)) || 0) + taxableInr);
        }
        const buckets: any[] = [];
        let totalRefund = 0;
        for (const [rateStr, assessableInr] of grouped.entries()) {
            const rate = num(rateStr);
            const inr = round2(assessableInr);
            const igstInr = round2(inr * (rate / 100));
            buckets.push({
                rate,
                assessable_value_inr: inr,
                igst_amount_inr: igstInr,
            });
            totalRefund += igstInr;
        }
        // Sort by rate asc for stable PDF rendering.
        buckets.sort((a, b) => a.rate - b.rate);
        return { buckets, totalRefund };
    }

    // ─── Line writes ────────────────────────────────────────────────────

    private async writeLines(
        invoiceId: string,
        companyId: string,
        lines: InvoiceLineDto[],
        // Source PO context keyed by purchase_order_line_id — supplies the
        // per-line SO + Quotation voucher snapshots (§3b / §5c).
        sourceByPoLineId?: Map<string, { po: any; quotationVoucherNo?: string }>
    ): Promise<void> {
        // Pre-fetch the product master for every line in one go, so missing
        // hsn_code / product_name / unit fields on the incoming DTO fall back
        // to the master without N round-trips.
        const productIds = Array.from(
            new Set(
                lines.map((l) => l.product_id).filter(Boolean) as string[]
            )
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: In(productIds),
                  soft_delete: false,
              } as any)
            : [];
        const productMap = new Map<string, any>();
        for (const p of products as any[]) {
            productMap.set(p._id.toString(), p);
        }

        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const prod: any = l.product_id ? productMap.get(l.product_id) : null;
            const src = sourceByPoLineId?.get(l.purchase_order_line_id);
            await this.invoiceLineRepository.create({
                invoice_id: invoiceId,
                company_id: companyId,
                seq: l.seq ?? i + 1,
                purchase_order_line_id: l.purchase_order_line_id,
                po_vendor_line_id: l.po_vendor_line_id,
                product_id: l.product_id,
                product_name: l.product_name || prod?.name || '',
                product_code: l.product_code || prod?.code,
                part_no: (l as any).part_no || prod?.part_no,
                description: l.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                customer_reference: l.customer_reference,
                unit: l.unit || prod?.unit_of_measure,
                uqc_code: l.uqc_code,
                qty: l.qty,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct || '0',
                margin_pct: (l as any).margin_pct || '0',
                tax_pct: l.tax_pct || '0',
                igst_rate_pct: l.igst_rate_pct || '0',
                product_rebates_snapshot:
                    (l as any).product_rebates_snapshot ?? null,
                product_expenses_snapshot:
                    (l as any).product_expenses_snapshot ?? null,
                // Packing List (§3b)
                packages: l.packages ?? null,
                net_weight: l.net_weight ?? null,
                gross_weight: l.gross_weight ?? null,
                // Source-doc voucher snapshots (§3b / §5c)
                purchase_order_voucher_no: src?.po?.voucher_no ?? null,
                quotation_voucher_no: src?.quotationVoucherNo ?? null,
            } as any);
        }
    }

    // ─── Mappers ────────────────────────────────────────────────────────

    async mapGet(row: InvoiceDoc): Promise<InvoiceGetResponseDto> {
        const lines = await this.invoiceLineRepository.findByInvoiceId(
            row._id.toString()
        );
        const dto = plainToInstance(InvoiceGetResponseDto, row);
        dto.lines = lines.map((l) => plainToInstance(InvoiceLineResponseDto, l));
        const payments = await this.invoicePaymentRepository.findActiveByInvoiceId(
            row._id.toString()
        );
        (dto as any).payments = payments;
        return dto;
    }

    /**
     * For an existing draft Invoice, return PO lines that still have
     * dispatched-but-not-yet-invoiced qty available — i.e. lines that
     * were added to POVs after the draft was first created. UI uses
     * this to power an "Add lines from PO" picker on edit.
     */
    async getAddablePoLines(
        poId: string,
        excludeInvoiceId?: string
    ): Promise<any[]> {
        const po: any = await this.poRepository.findOneById(poId);
        if (!po) return [];
        const poLines = await this.poLineRepository.findAll({
            purchase_order_id: poId,
        } as any);
        if (!poLines.length) return [];

        const poLineIds = poLines.map((l: any) => l._id.toString());

        // PO lines store product_id only — hydrate names/codes for the UI.
        const productIds = Array.from(
            new Set(
                poLines
                    .map((l: any) => l.product_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const products = productIds.length
            ? ((await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)) as any[])
            : [];
        const productById = new Map<string, any>(
            products.map((p: any) => [p._id.toString(), p])
        );

        // dispatched-qty per PO line, only counting POVs in
        // dispatched/closed status (matches assertQtyGuardForLines).
        const povLinesAll = (await this.povLineRepository.findAll({
            purchase_order_line_id: { $in: poLineIds },
        } as any)) as any[];
        const povIds = Array.from(
            new Set(
                povLinesAll
                    .map((pl: any) => pl.po_vendor_id?.toString())
                    .filter((v): v is string => !!v)
            )
        );
        const povs = povIds.length
            ? ((await this.povRepository.findAll({
                  _id: { $in: povIds },
                  soft_delete: false,
              } as any)) as any[])
            : [];
        const allowedPovIds = new Set(
            povs
                .filter(
                    (p: any) =>
                        p.status === ENUM_PO_VENDOR_STATUS.DISPATCHED ||
                        p.status === ENUM_PO_VENDOR_STATUS.CLOSED
                )
                .map((p: any) => p._id.toString())
        );
        const dispatchedByPoLine = new Map<string, number>();
        for (const pl of povLinesAll) {
            if (!allowedPovIds.has(pl.po_vendor_id?.toString())) continue;
            const k = pl.purchase_order_line_id?.toString();
            if (!k) continue;
            dispatchedByPoLine.set(
                k,
                (dispatchedByPoLine.get(k) || 0) + num(pl.dispatched_qty)
            );
        }

        // Qty already on the current draft, keyed by PO line id — these
        // don't count as "available to add" (the operator already has them).
        const selfQtyByPoLine = new Map<string, number>();
        if (excludeInvoiceId) {
            const selfLines =
                await this.invoiceLineRepository.findByInvoiceId(
                    excludeInvoiceId
                );
            for (const sl of selfLines as any[]) {
                const k = sl.purchase_order_line_id?.toString();
                if (!k) continue;
                selfQtyByPoLine.set(
                    k,
                    (selfQtyByPoLine.get(k) || 0) + num(sl.qty)
                );
            }
        }

        const result: any[] = [];
        for (const l of poLines as any[]) {
            const k = l._id.toString();
            const ordered = num(l.qty);
            // Dispatched is now informational only — no longer the gate.
            const dispatched = dispatchedByPoLine.get(k) || 0;
            const invoicedAll = await this.invoiceRepository.sumQtyByPoLineId(k);
            const invoicedOthers = invoicedAll - (selfQtyByPoLine.get(k) || 0);
            // Sell-from-stock: available = SO-line ordered qty − already invoiced.
            const available = ordered - invoicedOthers - (selfQtyByPoLine.get(k) || 0);
            if (available <= 1e-6) continue;
            const prod = productById.get(l.product_id?.toString());
            result.push({
                purchase_order_line_id: k,
                product_id: l.product_id?.toString(),
                product_name: prod?.name || l.product_name,
                product_code: prod?.code || l.product_code,
                part_no: prod?.part_no || (l as any).part_no,
                description: l.description || prod?.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                customer_reference: l.customer_reference,
                unit: l.unit,
                unit_price: l.unit_price,
                tax_pct: l.tax_pct,
                product_rebates_snapshot: l.product_rebates_snapshot || [],
                product_expenses_snapshot: l.product_expenses_snapshot || [],
                // Packing snapshot carried from the SO line → invoice line.
                net_weight_kg: l.net_weight_kg ?? null,
                gross_weight_kg: l.gross_weight_kg ?? null,
                package_count: l.package_count ?? null,
                dispatched: String(dispatched),
                invoiced_others: String(invoicedOthers),
                already_on_draft: String(selfQtyByPoLine.get(k) || 0),
                available: String(available),
            });
        }
        return result;
    }

    /**
     * Multi-SO picker source (SHIPPING_INVOICE_MERGE_PLAN §5b). For a customer,
     * returns every active SO (PO) that still has invoiceable (dispatched-but-
     * not-yet-invoiced) lines, grouped by SO. Each group carries the SO +
     * Quotation voucher, the SO currency + destination country (so the FE can
     * disable non-matching groups) and a buyer-requirement hint.
     */
    async getCustomerInvoiceableSoGroups(
        companyId: string,
        customerId: string
    ): Promise<any[]> {
        const pos = (await this.poRepository.findAll({
            company_id: companyId,
            customer_id: customerId,
            soft_delete: false,
        } as any)) as any[];
        // "Active" SO = anything past draft and not cancelled (dispatch, and
        // therefore invoiceable qty, only exists after the PO is confirmed).
        const active = pos.filter(
            (p) => p.status !== 'draft' && p.status !== 'cancelled'
        );
        if (!active.length) return [];

        const quotationIds = Array.from(
            new Set(
                active
                    .map((p) => p.quotation_id?.toString())
                    .filter((v): v is string => !!v)
            )
        );
        const quotations = quotationIds.length
            ? ((await this.quotationRepository.findAll({
                  _id: { $in: quotationIds },
              } as any)) as any[])
            : [];
        const qVoucherById = new Map<string, string>(
            quotations.map((q: any) => [q._id.toString(), q.voucher_no])
        );

        const groups: any[] = [];
        for (const po of active) {
            const lines = await this.getAddablePoLines(po._id.toString());
            if (!lines.length) continue;
            groups.push({
                po_id: po._id.toString(),
                po_voucher_no: po.voucher_no,
                quotation_id: po.quotation_id?.toString() || null,
                quotation_voucher_no: po.quotation_id
                    ? qVoucherById.get(po.quotation_id.toString()) || null
                    : null,
                currency_code: po.currency_code || null,
                country_of_destination:
                    po.consignee_snapshot?.country || null,
                buyer_reference:
                    lines.find((l: any) => l.customer_reference)
                        ?.customer_reference || null,
                lines,
            });
        }
        return groups;
    }

    mapList(row: any): InvoiceListResponseDto {
        return plainToInstance(InvoiceListResponseDto, row);
    }

    /**
     * Batch-enrich list rows with customer_name + customer_snapshot
     * (primary contact name/email) so the listing can show buyer info
     * without an N+1 lookup per row.
     */
    async mapListBatch(rows: any[]): Promise<InvoiceListResponseDto[]> {
        if (!rows.length) return [];
        const customerIds = Array.from(
            new Set(
                rows
                    .map((r) => r.customer_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const [customers, contacts] = await Promise.all([
            customerIds.length
                ? this.customerRepository.findAll({
                      _id: { $in: customerIds },
                  } as any)
                : Promise.resolve([] as any[]),
            customerIds.length
                ? this.customerContactRepository.findAll({
                      customer_id: { $in: customerIds },
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const custById = new Map<string, any>(
            (customers as any[]).map((c) => [c._id.toString(), c])
        );
        const primaryByCustomer = new Map<string, any>();
        for (const c of contacts as any[]) {
            const key = c.customer_id?.toString();
            if (!key) continue;
            const existing = primaryByCustomer.get(key);
            if (!existing || c.is_primary) primaryByCustomer.set(key, c);
        }
        return rows.map((r) => {
            const cid = r.customer_id?.toString();
            const c = cid ? custById.get(cid) : null;
            const ct: any = cid ? primaryByCustomer.get(cid) : null;
            const dto: any = plainToInstance(InvoiceListResponseDto, r);
            dto.customer_name = c?.company_name || c?.name || undefined;
            dto.customer_contact_name = ct?.name;
            dto.customer_contact_email = ct?.email;
            dto.customer_contact_phone = ct?.phone;
            dto.customer_contact_country_code = ct?.country_code;
            return dto;
        });
    }

    // ── KPI tiles for the listing page (VoucherStatsTiles) ──────────────
    // Returns { total, by_status, total_amount_inr } honouring the same
    // filters the list uses. total_amount_inr converts each non-cancelled
    // invoice's grand_total back to ₹ via its exchange_rate (foreign per ₹1).
    async stats(
        companyId: string,
        filters: {
            customer_id?: string;
            purchase_order_id?: string;
            status?: string | string[];
            date_from?: string;
            date_to?: string;
            search?: string;
        },
        creator?: undefined | string | string[]
    ): Promise<{
        total: number;
        total_amount_inr: string;
        by_status: Record<string, number>;
        overdue: number;
        overdue_amount_inr: string;
    }> {
        const rows = await this.invoiceRepository.aggregate<{
            status: string;
            count: string;
            amount_inr: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            CreatorScopeService.applyToQb(qb, creator);
            if (filters.customer_id) {
                qb.andWhere('entity.customer_id = :cust', {
                    cust: filters.customer_id,
                });
            }
            if (filters.purchase_order_id) {
                qb.andWhere('entity.purchase_order_id = :poid', {
                    poid: filters.purchase_order_id,
                });
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
                qb.andWhere('entity.invoice_date >= :df', {
                    df: filters.date_from,
                });
            }
            if (filters.date_to) {
                qb.andWhere('entity.invoice_date <= :dt', {
                    dt: filters.date_to,
                });
            }
            const searchTerm =
                typeof filters.search === 'string' ? filters.search.trim() : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.purchase_order_voucher_no ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .addSelect(
                    `COALESCE(SUM(
                        CASE
                            WHEN entity.status = '${ENUM_INVOICE_STATUS.CANCELLED}' THEN 0
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

        // Overdue = issued / partially-paid invoices past their due date with
        // money still owed. INR-converted via exchange_rate (foreign per ₹1).
        const today = new Date().toISOString().slice(0, 10);
        const [ov] = await this.invoiceRepository.aggregate<{
            count: string;
            amount_inr: string;
        }>((qb) => {
            qb.andWhere('entity.soft_delete = :sd', { sd: false });
            qb.andWhere('entity.company_id = :cid', { cid: companyId });
            CreatorScopeService.applyToQb(qb, creator);
            if (filters.customer_id) {
                qb.andWhere('entity.customer_id = :cust', {
                    cust: filters.customer_id,
                });
            }
            qb.andWhere('entity.status IN (:...ost)', {
                ost: [
                    ENUM_INVOICE_STATUS.ISSUED,
                    ENUM_INVOICE_STATUS.PARTIALLY_PAID,
                ],
            });
            qb.andWhere('entity.due_date IS NOT NULL');
            qb.andWhere('entity.due_date < :td', { td: today });
            qb.andWhere('entity.balance_receivable > 0');
            return qb
                .select('COUNT(*)::int', 'count')
                .addSelect(
                    `COALESCE(SUM(
                        entity.balance_receivable
                        / COALESCE(NULLIF(entity.exchange_rate, 0), 1)
                    ), 0)::text`,
                    'amount_inr'
                );
        });

        return {
            total,
            total_amount_inr: total_amount_inr.toFixed(2),
            by_status,
            overdue: Number(ov?.count) || 0,
            overdue_amount_inr: (Number(ov?.amount_inr) || 0).toFixed(2),
        };
    }

    // Sales leaderboard for the dashboard: top customers (by invoiced revenue)
    // and top products (by invoiced value). Both exclude cancelled / deleted
    // invoices and convert to ₹ via the invoice's exchange_rate (foreign per ₹1).
    async salesLeaderboard(
        companyId: string,
        limit = 5
    ): Promise<{
        top_customers: Array<{
            customer_id: string;
            name: string;
            amount_inr: string;
            invoices: number;
        }>;
        top_products: Array<{
            product_id: string;
            name: string;
            amount_inr: string;
            qty: string;
        }>;
    }> {
        const lim = Math.max(1, Math.min(20, Number(limit) || 5));
        const customers = await this.dataSource.query(
            `SELECT i.customer_id AS customer_id,
                    COALESCE(c.company_name, '—') AS name,
                    COALESCE(SUM(
                        i.grand_total / COALESCE(NULLIF(i.exchange_rate, 0), 1)
                    ), 0)::float8 AS amount_inr,
                    COUNT(*)::int AS invoices
             FROM invoices i
             LEFT JOIN customers c ON c._id = i.customer_id
             WHERE i.company_id = $1
               AND i.soft_delete = false
               AND i.status <> 'cancelled'
               AND i.customer_id IS NOT NULL
             GROUP BY i.customer_id, c.company_name
             ORDER BY amount_inr DESC
             LIMIT $2`,
            [companyId, lim]
        );
        const products = await this.dataSource.query(
            `SELECT il.product_id AS product_id,
                    COALESCE(p.name, MAX(il.product_name), '—') AS name,
                    COALESCE(SUM(
                        il.line_total / COALESCE(NULLIF(i.exchange_rate, 0), 1)
                    ), 0)::float8 AS amount_inr,
                    COALESCE(SUM(il.qty), 0)::float8 AS qty
             FROM invoice_lines il
             JOIN invoices i ON i._id = il.invoice_id
             LEFT JOIN products p ON p._id = il.product_id
             WHERE i.company_id = $1
               AND i.soft_delete = false
               AND i.status <> 'cancelled'
               AND il.product_id IS NOT NULL
             GROUP BY il.product_id, p.name
             ORDER BY amount_inr DESC
             LIMIT $2`,
            [companyId, lim]
        );
        return {
            top_customers: (customers as any[]).map((r) => ({
                customer_id: r.customer_id,
                name: r.name,
                amount_inr: (Number(r.amount_inr) || 0).toFixed(2),
                invoices: Number(r.invoices) || 0,
            })),
            top_products: (products as any[]).map((r) => ({
                product_id: r.product_id,
                name: r.name,
                amount_inr: (Number(r.amount_inr) || 0).toFixed(2),
                qty: String(Number(r.qty) || 0),
            })),
        };
    }
}
