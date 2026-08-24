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
import { ImportContext } from '@common/import/import-context.interface';
import { numberToIndianWords } from '@common/utils/amount-in-words';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';
import { CurrencyService } from '@modules/currency/services/currency.service';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { ENUM_PO_VENDOR_STATUS } from '@modules/po-vendor/enums/po-vendor.enum';
import { In } from 'typeorm';
import { StockLedgerService } from '@modules/inventory/services/stock-ledger.service';
import { ENUM_STOCK_MOVEMENT_TYPE } from '@modules/inventory/enums/stock-movement.enum';
import { AdjustmentNoteRepository } from '@modules/adjustment-note/repository/repositories/adjustment-note.repository';
import { sumAdjustmentEffect } from '@modules/adjustment-note/helpers/adjustment-balance.helper';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ToleranceGuardService } from '@modules/tolerance-guard/services/tolerance-guard.service';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
// Trim a value to fit a varchar(n) column so an over-long reference/voucher
// snapshot degrades to a truncated string instead of a 500 (Postgres rejects
// an over-length insert with "value too long for type character varying").
const cap = (v: any, n: number): string | undefined =>
    v === null || v === undefined || v === '' ? undefined : String(v).slice(0, n);

/**
 * Sum a rebate snapshot array. PFI/PO convention: value lives in `pct`
 * regardless of `type`. For `type='fixed'` the `pct` field carries an
 * absolute amount in the VENDOR (source) currency, so it is converted to the
 * document currency via `rate` (cost_exchange_rate; 1 for a domestic line) —
 * exactly like the unit price. `percent` rebates are a % of a base that is
 * already in document currency, so they need no conversion.
 *
 *   rebate row = { rebate_id, code, name, type: 'percent'|'fixed', pct: string }
 */
function sumRebates(items: any, base: number, rate = 1): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let total = 0;
    for (const r of items) {
        if (!r) continue;
        total +=
            r.type === 'fixed' ? num(r.pct) * rate : (base * num(r.pct)) / 100;
    }
    return total;
}

/**
 * Sum an expense snapshot array. PFI/PO convention: value lives in `value`
 * (not `pct`). For `type='percent'` it's a % of base (already in document
 * currency → no conversion); for `type='fixed'` it's an absolute amount in the
 * VENDOR (source) currency, converted to the document currency via `rate`
 * (cost_exchange_rate; 1 for a domestic line) — like the unit price.
 *
 *   expense row = { expense_id, code, name, type: 'percent'|'fixed', value: string }
 */
function sumExpenses(items: any, base: number, rate = 1): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let total = 0;
    for (const e of items) {
        if (!e) continue;
        total +=
            e.type === 'percent'
                ? (base * num(e.value)) / 100
                : num(e.value) * rate;
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
        private readonly vendorRepository: VendorRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly poLineRepository: PurchaseOrderLineRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly adjustmentNoteRepository: AdjustmentNoteRepository,
        private readonly stockLedger: StockLedgerService,
        private readonly companySettings: CompanySettingsService,
        private readonly toleranceGuard: ToleranceGuardService,
        private readonly currencyService: CurrencyService,
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
        userId: string,
        importCtx?: ImportContext
    ): Promise<InvoiceDoc> {
        const silent = !!importCtx?.silent;

        // Qty guard maps each line to its Sales-Order line's ordered qty. In
        // import mode (decision 5) a back-filled invoice may carry no SO line
        // (purchase_order_line_id = null), so this guard is skipped — the
        // imported qty is authoritative. Live create (no ctx) always runs it.
        let tolerance: { hold: boolean; reason?: string } = { hold: false };
        if (!silent) {
            await this.assertQtyGuardForLines(data.lines);
            // FY closure: block posting into a closed period. Bulk import
            // (silent) is a historical data-migration path and is exempt.
            await this.companySettings.assertPostingDateOpen(
                companyId,
                data.invoice_date,
                'invoice'
            );
            // Qty/price tolerance (§8.1) — a draft still SAVES when held
            // (unlike the hard ceiling above); only issue() blocks on it.
            tolerance = await this.computeInvoiceTolerance(
                companyId,
                data.lines
            );
        }

        // Resolve source SOs (POs) + enforce the single-source invariant
        // (one customer / currency / country) before writing anything. Both
        // are null-safe when lines have no purchase_order_line_id (no SO).
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
        const draftVoucherNo = await this.voucherService.assignVoucher(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT,
            ctx.voucher_prefix,
            {
                explicit: importCtx?.voucher_no,
                asOfDate: new Date(data.invoice_date),
            }
        );

        const header = await this.invoiceRepository.create({
            company_id: companyId,
            created_by: userId,
            invoice_type: data.invoice_type || ENUM_INVOICE_TYPE.EXPORT,
            status: ENUM_INVOICE_STATUS.DRAFT,
            voucher_no: draftVoucherNo,
            tolerance_hold: tolerance.hold && !data.override,
            tolerance_hold_reason: tolerance.reason || null,
            tolerance_override_by:
                tolerance.hold && data.override ? userId : null,
            tolerance_override_at:
                tolerance.hold && data.override ? new Date() : null,
            invoice_date: data.invoice_date,
            due_date: data.due_date,
            purchase_order_id: data.purchase_order_id,
            purchase_order_voucher_no:
                cap(sourcePoVouchers.join(', '), 255) || null,
            pfi_id: data.pfi_id,
            quotation_id: data.quotation_id,
            quotation_voucher_no:
                cap(sourceQuotationVouchers.join(', '), 255) || null,
            // Default the buyer's PO# from the source Sales Order (S4) when
            // the invoice payload didn't carry one; operator can override.
            // Capped to the varchar(60) column so a long buyer PO reference is
            // truncated rather than 500ing the whole create.
            customer_po_no: cap(
                data.customer_po_no ||
                    (source.pos || []).find((p) => p?.customer_po_number)
                        ?.customer_po_number,
                60
            ),
            // Manual tracking reference — carried from the source Sales Order
            // (S: Lead Reference Number). Operator can override on the invoice.
            reference_no:
                data.reference_no ||
                (source.pos || []).find((p) => p?.reference_no)?.reference_no ||
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
            // Fall back to the master symbol when the caller didn't send one —
            // invoices generated from an SO forward the code but not the symbol,
            // which left the PDF printing "USD" instead of "$".
            currency_symbol:
                data.currency_symbol ||
                getCurrencySymbol(data.currency_code),
            exchange_rate: data.exchange_rate || '1',
            discount_total: data.discount_total || '0',
            // Default freight to Σ source SOs' own freight_total (a
            // multi-SO create otherwise silently drops every SO's freight
            // but the first) — an explicit client-supplied value still wins.
            freight_charges:
                data.freight_charges != null && data.freight_charges !== ''
                    ? data.freight_charges
                    : String(round2(this.sumSourceFreight(source.pos))),
            insurance_charges: data.insurance_charges || '0',
            other_charges: data.other_charges || '0',
            // Advance is AUTO-MANAGED from the source Sales Orders (client
            // 2026-08-07): the invoice's advance = Σ advance_amount over EVERY
            // distinct source SO its lines come from, so a multi-SO invoice
            // aggregates all their advances (not just the first SO's). The FE
            // value is ignored here — it's a read-only mirror of this sum.
            // Import (silent) keeps the value the sheet supplied.
            advance_received: silent
                ? data.advance_received != null && data.advance_received !== ''
                    ? data.advance_received
                    : '0'
                : String(round2(this.sumSourceAdvances(source.pos))),
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
            source.byPoLineId,
            data.currency_code
        );
        await this.recompute(header._id.toString());

        // Post the upfront advance (carried from the SO) as a real receipt right
        // away, so it shows in the customer ledger/register on a draft.
        const createdRow = await this.invoiceRepository.findOneById(
            header._id.toString()
        );
        if (createdRow)
            await this.syncDraftAdvanceReceipt(
                createdRow,
                userId,
                this.sourceAdvanceRate(source.pos)
            );

        this.logger.log(`Invoice DRAFT created: ${header._id}`);
        return this.invoiceRepository.findOneById(header._id.toString());
    }

    // ─── Update (gated by status) ───────────────────────────────────────

    async update(
        row: InvoiceDoc,
        data: InvoiceUpdateRequestDto,
        userId?: string
    ): Promise<InvoiceDoc> {
        if (row.status === ENUM_INVOICE_STATUS.CANCELLED) {
            throw new BadRequestException('Cancelled invoice cannot be updated.');
        }

        // FY closure: block editing an invoice already in a closed period, and
        // block moving one onto a closed date.
        const cid = row.company_id.toString();
        await this.companySettings.assertPostingDateOpen(cid, row.invoice_date, 'invoice');
        const newInvDate = (data as any).invoice_date || row.invoice_date;
        if (newInvDate !== row.invoice_date) {
            await this.companySettings.assertPostingDateOpen(cid, newInvDate, 'invoice');
        }

        if (row.status === ENUM_INVOICE_STATUS.DRAFT) {
            // Everything editable.
            const lines = data.lines;
            const { lines: _omit, ...header } = data as any;
            // Advance is auto-managed from the source SOs (recomputed in the
            // lines block below) — never let the FE set it directly.
            delete header.advance_received;
            // Not a real column — consumed explicitly below, in the lines
            // block, alongside the tolerance recompute.
            const wantsOverride = !!header.override;
            delete header.override;
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
                // Freight fix-up: an SO's freight_total is a per-shipment
                // charge the operator may have already hand-adjusted on this
                // invoice, so line edits never blindly RE-derive
                // freight_charges from Σ source SOs (unlike advance_received
                // below, which has no manual-edit UI at all). But bringing in
                // a NEW source SO the operator hasn't seen yet (via "Add
                // lines from SO" / "Add items from another SO") must add
                // THAT SO's own freight — it was never in the total before.
                // Diff against the PRE-edit line set to find genuinely new
                // source SOs, then bump (never shrink) freight_charges by
                // their freight_total.
                const oldLines = await this.invoiceLineRepository.findByInvoiceId(
                    row._id.toString()
                );
                const oldSource = await this.loadSourcePoContext(
                    oldLines as any
                );
                const oldPoIds = new Set(
                    oldSource.pos.map((p: any) => p._id.toString())
                );
                const newlyAddedFreight = source.pos
                    .filter((p: any) => !oldPoIds.has(p._id.toString()))
                    .reduce((s: number, p: any) => s + num(p.freight_total), 0);
                if (newlyAddedFreight > 0) {
                    row.freight_charges = String(
                        round2(num(row.freight_charges) + newlyAddedFreight)
                    );
                }
                await this.invoiceLineRepository.deleteByInvoiceId(
                    row._id.toString()
                );
                await this.writeLines(
                    row._id.toString(),
                    row.company_id.toString(),
                    lines,
                    source.byPoLineId,
                    row.currency_code
                );
                // Auto-manage the advance: Σ advance_amount over EVERY distinct
                // source SO now on the invoice — so adding lines from another SO
                // aggregates its advance too. Persist before recompute (which
                // reads advance_received to derive the balance).
                row.advance_received = String(
                    round2(this.sumSourceAdvances(source.pos))
                );
                // Qty/price tolerance (§8.1) — recomputed on every line edit;
                // saving still succeeds when held (only issue() blocks).
                const tolerance = await this.computeInvoiceTolerance(
                    row.company_id.toString(),
                    lines,
                    row._id.toString()
                );
                row.tolerance_hold = tolerance.hold && !wantsOverride;
                row.tolerance_hold_reason = tolerance.reason || null;
                row.tolerance_override_by =
                    tolerance.hold && wantsOverride
                        ? userId || (row as any).created_by
                        : null;
                row.tolerance_override_at =
                    tolerance.hold && wantsOverride ? new Date() : null;
                await this.invoiceRepository.save(row);
            }
            await this.recompute(row._id.toString());

            // Re-sync the advance receipt with the (possibly edited) advance.
            const updatedRow = await this.invoiceRepository.findOneById(
                row._id.toString()
            );
            if (updatedRow) {
                // Outside the `if (Array.isArray(lines))` block above — that
                // `source` may not have run this pass (a status-only save),
                // so re-derive it fresh from the row's current lines rather
                // than assume it's in scope.
                const curLines =
                    await this.invoiceLineRepository.findByInvoiceId(
                        row._id.toString()
                    );
                const curSource = await this.loadSourcePoContext(
                    curLines as any
                );
                await this.syncDraftAdvanceReceipt(
                    updatedRow,
                    (row as any).created_by,
                    this.sourceAdvanceRate(curSource.pos)
                );
            }

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
     * Keep a DRAFT invoice's upfront advance in sync with a REAL receipt so it
     * posts to the customer ledger/register immediately — not only at issue.
     * (Mirrors the Vendor PO advance, which is a real payment even on a draft.)
     *   • advance set & no receipt yet → seed a `method:'advance'` receipt (RCP…)
     *   • advance amount changed        → update the seeded receipt
     *   • advance cleared               → void the seeded receipt
     * Issued invoices are untouched (issue() freezes receipts; its own guard
     * skips re-seeding because this already created one).
     */
    private async syncDraftAdvanceReceipt(
        row: InvoiceDoc,
        stampUserId?: string,
        advanceRate?: number
    ): Promise<void> {
        if (row.status !== ENUM_INVOICE_STATUS.DRAFT) return;
        const advanceAmt = round2(num(row.advance_received));
        const rate =
            advanceRate && advanceRate > 0
                ? String(advanceRate)
                : row.exchange_rate || '1';
        const active =
            await this.invoicePaymentRepository.findActiveByInvoiceId(
                row._id.toString()
            );
        const advancePay: any = active.find(
            (p: any) => p.method === 'advance' && !p.voided_at
        );

        if (advanceAmt > 0.005) {
            if (advancePay) {
                // Re-sync the amount + rate on a draft edit (e.g. the source
                // SO's advance_amount/advance_exchange_rate was corrected).
                let dirty = false;
                if (round2(num(advancePay.amount)) !== advanceAmt) {
                    advancePay.amount = String(advanceAmt);
                    advancePay.payment_date = row.invoice_date;
                    dirty = true;
                }
                if (round2(num(advancePay.exchange_rate)) !== round2(Number(rate))) {
                    advancePay.exchange_rate = rate;
                    dirty = true;
                }
                if (dirty) await this.invoicePaymentRepository.save(advancePay);
                return;
            }
            // Only seed the SO-derived advance when there are no other LIVE
            // receipts. A draft CAN now carry manually-recorded receipts, so if
            // one already exists we don't also auto-seed the SO advance (the
            // manual row stands; it is never wiped by this sync). `active`
            // includes voided rows, so filter them out; this also lets an
            // advance re-added after a clear re-seed. Mints its own RCP
            // voucher; issue() then skips re-seeding.
            if (active.some((p: any) => !p.voided_at)) return;
            const ctx = await this.loadCompanyContext(row.company_id.toString());
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
                // Seeds at the SO's own advance_exchange_rate (the real rate
                // at receipt) when available; falls back to the invoice's
                // rate (0 forex gain/loss) for a domestic advance or an SO
                // that predates this field. The operator can still edit it
                // later to realise a different rate.
                exchange_rate: rate,
                created_by: stampUserId || (row as any).created_by,
            } as any);
        } else if (advancePay) {
            // Advance cleared on a draft edit → void the seeded receipt.
            advancePay.voided_at = new Date();
            advancePay.voided_reason = 'Advance removed';
            await this.invoicePaymentRepository.save(advancePay);
        }
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

    async issue(
        row: InvoiceDoc,
        userId: string,
        importCtx?: ImportContext
    ): Promise<InvoiceDoc> {
        if (row.status !== ENUM_INVOICE_STATUS.DRAFT) {
            throw new BadRequestException(
                `Only DRAFT invoices can be issued (current: ${row.status}).`
            );
        }

        // Qty/price tolerance (§8.1) — blocks the draft → issued transition
        // while unresolved (resolve by editing the line back in range, or by
        // saving via update() with `override: true`). Bulk import (silent)
        // is a historical data-migration path and is exempt, same as the
        // hard qty ceiling in create().
        if (!importCtx?.silent && row.tolerance_hold) {
            throw new BadRequestException(
                `Cannot issue — outside qty/price tolerance: ${row.tolerance_hold_reason || 'see line details'}. Edit the line(s) back in range, or save with override first.`
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
                    exchange_rate: row.exchange_rate || '1',
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
        // Import mode: a historical invoice must not be gated by (or move)
        // current stock — the goods left the warehouse in the past. Skip both
        // the pre-issue check and the Goods-Out decrement below.
        if (needByProduct.size > 0 && !importCtx?.silent) {
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
        // Skipped in import mode (see the pre-issue note above).
        try {
            for (const l of lines as any[]) {
                if (importCtx?.silent) break;
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
            row.status !== ENUM_INVOICE_STATUS.DRAFT &&
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
        // FY closure: block recording a receipt dated in a closed period.
        await this.companySettings.assertPostingDateOpen(
            row.company_id.toString(),
            data.payment_date,
            'receipt'
        );
        const priorPaid = await this.invoicePaymentRepository.sumActiveByInvoiceId(
            row._id.toString()
        );
        const grand = num(row.grand_total);
        // Adjustment Notes already applied to this invoice settle part of it,
        // so the payable ceiling is grand − adjustments, not grand.
        const adj = num(row.adjustment_total);
        // 1¢ slack for FP rounding.
        if (priorPaid + adj + amount > grand + 1e-2) {
            throw new BadRequestException(
                `Payment ${amount} exceeds outstanding balance ${round2(
                    grand - priorPaid - adj
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

        // Received-into bank — validate it belongs to this company and freeze a
        // name snapshot so the receipt still shows it if the bank is edited.
        let bankAccountId: string | undefined;
        let bankName: string | undefined;
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
                    'Selected bank account was not found.'
                );
            }
            bankAccountId = bank._id.toString();
            bankName = bank.bank_name || undefined;
        }

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
            company_bank_account_id: bankAccountId,
            bank_name: bankName,
            // Receipt-time rate for the realized forex gain/loss — defaults to
            // the invoice's own rate (→ 0 gain/loss) when the caller omits it.
            exchange_rate:
                data.exchange_rate != null && data.exchange_rate !== ''
                    ? data.exchange_rate
                    : row.exchange_rate || '1',
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
        // Adjustment Notes linked to this invoice settle it alongside cash: a
        // customer Credit note ("reduce the bill") lowers the receivable, a
        // Debit note raises it. Voided notes drop out, so a void reverses.
        const adj = sumAdjustmentEffect(
            (await this.adjustmentNoteRepository.findByDocumentId(
                row._id.toString()
            )) as any[]
        );
        const grand = num(row.grand_total);
        const settled = round2(paid + adj);
        const bal = round2(grand - settled);
        row.advance_received = String(round2(paid));
        row.adjustment_total = String(adj);
        row.balance_receivable = String(bal);
        // A DRAFT stays a DRAFT — recording a receipt/advance on it must not
        // "issue" the invoice. Only issued invoices cycle ISSUED↔PARTIAL↔PAID.
        if (row.status !== ENUM_INVOICE_STATUS.DRAFT) {
            if (settled <= 1e-2) {
                row.status = ENUM_INVOICE_STATUS.ISSUED;
            } else if (bal <= 1e-2) {
                row.status = ENUM_INVOICE_STATUS.PAID;
            } else {
                row.status = ENUM_INVOICE_STATUS.PARTIALLY_PAID;
            }
        }
        await this.invoiceRepository.save(row);
    }

    /**
     * Re-derive balance + status after an Adjustment Note linked to this
     * invoice is created or voided. Called by AdjustmentNoteService.
     */
    async recomputeAfterAdjustment(invoiceId: string): Promise<void> {
        const row = await this.invoiceRepository.findOneById(invoiceId);
        if (!row || row.soft_delete) return;
        await this.applyPaymentDerived(row);
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

    /**
     * Bulk delete: loops the guarded single-delete so every row honours the
     * same delete policy. Rows that cannot be deleted are skipped with a
     * reason rather than failing the batch.
     */
    async deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }> {
        const deleted: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const id of ids) {
            try {
                const row = await this.findOneById(id);
                await this.softDelete(row);
                deleted.push(id);
            } catch (e: any) {
                skipped.push({ id, reason: e?.message || 'Cannot delete' });
            }
        }
        return { deleted, skipped };
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
            // Multi-currency (D-7 = A): convert the vendor COST from its source
            // currency to the DOCUMENT currency FIRST, then build the sell price
            // in the document currency. cost_exchange_rate = 1 for a domestic /
            // same-currency line, so this is a no-op there.
            const lineRate = num((l as any).cost_exchange_rate) || 1;
            const price = num(l.unit_price) * lineRate;
            const discount = num(l.discount_pct);
            const taxable = qty * price * (1 - discount / 100);

            // Fixed expenses/rebates are in the vendor (source) currency, so
            // convert them source→doc with the same per-line rate as the price.
            const expensesTotal = sumExpenses(
                l.product_expenses_snapshot,
                taxable,
                lineRate
            );
            const afterExpense = taxable + expensesTotal;
            const rebatesTotal = sumRebates(
                l.product_rebates_snapshot,
                afterExpense,
                lineRate
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

        // Multi-currency: each line's cost was converted source→document
        // currency FIRST (per line), so `subtotal` is ALREADY in the document
        // currency — NO header × exchange_rate. Charges (freight/insurance/…)
        // are also in the document currency. `exchange_rate` (doc-per-₹1) is now
        // used only to derive the INR equivalent (grand_total_inr) for GSTR-1.
        const er = num(row.exchange_rate) || 1;
        const subtotal_doc = round2(subtotal);
        const discount_total = num(row.discount_total);
        const fob_value = round2(subtotal_doc - discount_total);
        const freight = num(row.freight_charges);
        const insurance = num(row.insurance_charges);
        const other = num(row.other_charges);
        // Keep the exact 2-decimal total: FOB + freight + insurance + other.
        // Rounding to a whole number used to make the total disagree with its
        // own components (67.65 + 500 + 200 shown as 768 instead of 767.65).
        const grand_total = round2(
            fob_value + freight + insurance + other
        );
        // INR equivalent of the document-currency grand total.
        const grand_total_inr = er > 0 ? round2(grand_total / er) : grand_total;
        const advance = num(row.advance_received);
        // Linked Adjustment Notes settle the invoice too — keep them in the
        // balance here so an edit/recompute doesn't undo them.
        const balance = round2(
            grand_total - advance - num(row.adjustment_total)
        );

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
    /**
     * Dispatched qty per SO (PO) line, summed across that line's Vendor PO(s)
     * in DISPATCHED/CLOSED status (mirrors getInvoiceableLines). Used to raise
     * the invoice ceiling above the SO line's ordered qty when the operator
     * deliberately over-procured on Generate POV (editable "To Procure", which
     * may exceed SO pending — see the editable-POV feature). Returns a map;
     * callers take max(SO ordered qty, dispatched) so sell-from-stock (no
     * dispatch) is never capped below the SO line qty.
     */
    private async dispatchedByPoLineId(
        poLineIds: string[]
    ): Promise<Map<string, number>> {
        const dispatched = new Map<string, number>();
        if (!poLineIds.length) return dispatched;
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
        for (const pl of povLinesAll) {
            if (!allowedPovIds.has(pl.po_vendor_id?.toString())) continue;
            const k = pl.purchase_order_line_id?.toString();
            if (!k) continue;
            dispatched.set(
                k,
                (dispatched.get(k) || 0) + num(pl.dispatched_qty)
            );
        }
        return dispatched;
    }

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
        // Over-procured lines (POV "To Procure" edited above SO pending) can be
        // dispatched — and therefore invoiced — beyond the SO line's ordered
        // qty. Raise the ceiling to the dispatched qty when it is higher.
        const dispatchedByPoLine = await this.dispatchedByPoLineId(poLineIds);

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
            // Ceiling = SO ordered qty, or the (higher) dispatched qty when the
            // line was over-procured. Never below SO qty (sell-from-stock).
            const ceiling = Math.max(
                ordered,
                dispatchedByPoLine.get(poLineId) || 0
            );
            if (reqQty + availableHistorical > ceiling + 1e-6) {
                throw new BadRequestException(
                    `Invoice qty (${reqQty}) exceeds the invoiceable qty (${round2(
                        ceiling - availableHistorical
                    )}) for PO line ${poLineId}. Reduce qty.`
                );
            }
        }
    }

    /**
     * Qty + price tolerance vs each line's source SO line
     * (TOLERANCE_THREE_WAY_MATCH_PLAN.md §8.1) — a SEPARATE, softer check
     * alongside `assertQtyGuardForLines`'s hard ceiling above, not a
     * replacement for it. From-stock/manual lines (no
     * `purchase_order_line_id`) are exempt — nothing to compare against,
     * same as a standalone POV on the purchase side.
     *
     * Qty is compared CUMULATIVELY (this request's qty + what's already
     * invoiced elsewhere against the same SO line, excluding this invoice's
     * own prior lines on update) — a shipment split across several partial
     * invoices must be judged against the SO's ordered qty as a whole, same
     * lesson as the GRN cumulative-qty fix on the purchase side. Price is
     * judged per line (not cumulative — each invoice line states its own
     * price independently).
     */
    private async computeInvoiceTolerance(
        companyId: string,
        lines: InvoiceLineDto[],
        excludeInvoiceId?: string
    ): Promise<{ hold: boolean; reason?: string }> {
        const poLineIds = Array.from(
            new Set(lines.map((l) => l.purchase_order_line_id).filter(Boolean))
        ) as string[];
        if (!poLineIds.length) return { hold: false };

        const poLines = (await this.poLineRepository.findAll({
            _id: { $in: poLineIds },
        } as any)) as any[];
        const poLineById = new Map<string, any>(
            poLines.map((pl) => [pl._id.toString(), pl])
        );

        const reqByPoLine = new Map<string, number>();
        // purchase_order_line has no product_name column (only product_id) —
        // prefer the invoice line's own snapshotted name (most clients send
        // it), falling back to a product-master lookup below for the
        // (common) case where the caller only sent product_id.
        const productNameByPoLine = new Map<string, string>();
        for (const l of lines) {
            if (!l.purchase_order_line_id) continue;
            reqByPoLine.set(
                l.purchase_order_line_id,
                (reqByPoLine.get(l.purchase_order_line_id) || 0) + num(l.qty)
            );
            if (l.product_name && !productNameByPoLine.has(l.purchase_order_line_id)) {
                productNameByPoLine.set(l.purchase_order_line_id, l.product_name);
            }
        }
        const unnamedPoLineIds = poLineIds.filter(
            (id) => !productNameByPoLine.has(id)
        );
        if (unnamedPoLineIds.length) {
            const productIds = Array.from(
                new Set(
                    unnamedPoLineIds
                        .map((id) => poLineById.get(id)?.product_id?.toString())
                        .filter(Boolean)
                )
            );
            const products = productIds.length
                ? ((await this.productRepository.findAll({
                      _id: { $in: productIds },
                  } as any)) as any[])
                : [];
            const productNameById = new Map<string, string>(
                products.map((p) => [p._id.toString(), p.name])
            );
            for (const id of unnamedPoLineIds) {
                const pid = poLineById.get(id)?.product_id?.toString();
                const name = pid && productNameById.get(pid);
                if (name) productNameByPoLine.set(id, name);
            }
        }

        const reasons: string[] = [];
        for (const [poLineId, reqQty] of reqByPoLine) {
            const alreadyInvoiced =
                await this.invoiceRepository.sumQtyByPoLineId(poLineId);
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
            const cumulative =
                reqQty + Math.max(0, alreadyInvoiced - selfPrev);
            const poLine = poLineById.get(poLineId);
            const result = await this.toleranceGuard.checkQtyTolerance(
                companyId,
                num(poLine?.qty),
                cumulative,
                'invoice'
            );
            if (!result.withinTolerance) {
                reasons.push(`Qty (${productNameByPoLine.get(poLineId) || poLineId}): ${result.reason}`);
            }
        }

        for (const l of lines) {
            if (!l.purchase_order_line_id) continue;
            const poLine = poLineById.get(l.purchase_order_line_id);
            const result = await this.toleranceGuard.checkPriceTolerance(
                companyId,
                num(poLine?.unit_price),
                num(l.unit_price),
                'invoice'
            );
            if (!result.withinTolerance) {
                reasons.push(`Price (${l.product_name || productNameByPoLine.get(l.purchase_order_line_id) || l.product_id}): ${result.reason}`);
            }
        }

        return { hold: reasons.length > 0, reason: reasons.join('; ') || undefined };
    }

    // ─── Multi-SO source resolution + invariant ─────────────────────────

    /**
     * Σ advance_amount over the DISTINCT source Sales Orders — the auto-managed
     * invoice advance. `source.pos` from loadSourcePoContext is already distinct
     * by SO, so a multi-SO invoice sums each SO's advance exactly once.
     */
    private sumSourceAdvances(pos: any[]): number {
        return (pos || []).reduce((s, p) => s + num(p?.advance_amount), 0);
    }

    /**
     * Σ freight_total over the DISTINCT source Sales Orders — same
     * single-count-per-SO shape as `sumSourceAdvances`. Used to seed
     * freight_charges at create, and to detect a newly-added SO's own
     * freight contribution when lines are edited (see `update()`).
     */
    private sumSourceFreight(pos: any[]): number {
        return (pos || []).reduce((s, p) => s + num(p?.freight_total), 0);
    }

    /**
     * Document-currency-per-₹1 at the moment the advance was received, from the
     * first source SO that actually carries an advance — matches
     * `sumSourceAdvances`' single-total simplification (one seeded receipt
     * row for a multi-SO invoice, so one rate). Falls back to the invoice's
     * own header rate (in `syncDraftAdvanceReceipt`) when no source SO has a
     * real rate (domestic advance, or the SO predates this field).
     */
    private sourceAdvanceRate(pos: any[]): number | undefined {
        const withAdvance = (pos || []).find(
            (p) => num(p?.advance_amount) > 0
        );
        const rate = num(withAdvance?.advance_exchange_rate);
        return rate > 0 ? rate : undefined;
    }

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
     * Re-sync `advance_received` + the seeded advance receipt for every DRAFT
     * invoice already generated from this Sales Order. Called when the SO's
     * own `advance_amount` changes AFTER invoice(s) already exist — an SO
     * edit otherwise has no effect on invoices already created from it
     * (`sumSourceAdvances`/`syncDraftAdvanceReceipt` only ever ran at that
     * invoice's own create/update time). Non-draft invoices are left alone:
     * their advance is frozen once issued, same rule `syncDraftAdvanceReceipt`
     * already enforces on its own.
     */
    async resyncDraftAdvanceForSo(
        soId: string,
        userId?: string
    ): Promise<void> {
        // Match by LINE, not the header `purchase_order_id` — a multi-SO
        // invoice's header only names its PRIMARY source SO, so an invoice
        // whose header points at a DIFFERENT SO but carries a line from this
        // one (added via "Add lines from SO" / "Add items from another SO")
        // would otherwise be silently skipped when THIS SO's advance changes.
        const soLines = await this.poLineRepository.findAll({
            purchase_order_id: soId,
        } as any);
        const soLineIds = (soLines as any[]).map((l) => l._id.toString());
        const invoiceIdsFromLines = soLineIds.length
            ? new Set(
                  (
                      (await this.invoiceLineRepository.findAll({
                          purchase_order_line_id: { $in: soLineIds },
                      } as any)) as any[]
                  ).map((l) => l.invoice_id?.toString())
              )
            : new Set<string>();
        const headerInvoices = (await this.invoiceRepository.findAll({
            purchase_order_id: soId,
            soft_delete: false,
            status: ENUM_INVOICE_STATUS.DRAFT,
        } as any)) as InvoiceDoc[];
        const lineInvoices = invoiceIdsFromLines.size
            ? ((await this.invoiceRepository.findAll({
                  _id: { $in: Array.from(invoiceIdsFromLines) },
                  soft_delete: false,
                  status: ENUM_INVOICE_STATUS.DRAFT,
              } as any)) as InvoiceDoc[])
            : [];
        const invoiceById = new Map<string, InvoiceDoc>();
        for (const inv of [...headerInvoices, ...lineInvoices]) {
            invoiceById.set(inv._id.toString(), inv);
        }
        const invoices = Array.from(invoiceById.values());
        for (const row of invoices) {
            const lines = await this.invoiceLineRepository.findByInvoiceId(
                row._id.toString()
            );
            const source = await this.loadSourcePoContext(lines as any);
            const advanceReceived = round2(this.sumSourceAdvances(source.pos));
            if (round2(num(row.advance_received)) !== advanceReceived) {
                row.advance_received = String(advanceReceived);
                await this.invoiceRepository.save(row);
            }
            await this.syncDraftAdvanceReceipt(
                row,
                userId,
                this.sourceAdvanceRate(source.pos)
            );
        }
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
     *   assessable_value_inr = Σ (taxable_amount ÷ exchange_rate)
     *   igst_amount_inr      = assessable_value_inr × rate
     *
     * Multi-currency: `taxable_amount` is now in the DOCUMENT currency (each
     * cost was converted source→doc in recompute), so it is divided by the
     * exchange_rate (doc-per-₹1) to get the INR assessable value for GSTR-1.
     * For an INR invoice exchange_rate = 1, so this is a no-op.
     *
     * Returns the array + the total IGST refund (sum of buckets).
     */
    private buildIgstRefundBuckets(
        lines: InvoiceLineDoc[],
        exchangeRate: number
    ): { buckets: any[]; totalRefund: number } {
        const er = exchangeRate > 0 ? exchangeRate : 1;
        const grouped = new Map<string, number>(); // rate_pct → INR assessable
        for (const l of lines) {
            const rate = num(l.igst_rate_pct);
            const taxableInr = num(l.taxable_amount) / er;
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
        sourceByPoLineId?: Map<string, { po: any; quotationVoucherNo?: string }>,
        // The invoice's own document currency — needed to validate/derive
        // each line's source→document cost_exchange_rate against the
        // Currency master rather than trusting the payload blindly.
        docCurrencyCode?: string
    ): Promise<void> {
        const docCur = (docCurrencyCode || 'INR').toUpperCase();
        const rateCache = new Map<string, number>();
        const rateForSource = async (src: string): Promise<number> => {
            if (rateCache.has(src)) return rateCache.get(src)!;
            const r = await this.currencyService.getPairRate(
                companyId,
                src,
                docCur
            );
            rateCache.set(src, r);
            return r;
        };
        // A client-supplied rate is trusted only within tolerance of the
        // Currency master — a frozen historical rate can drift a little from
        // today's master, but a wildly different value (wrong pair, stale FE
        // state, mistyped test data) is silently replaced rather than saved.
        const RATE_TOLERANCE = 0.25;
        const validatedRate = async (
            src: string,
            claimedRaw: string
        ): Promise<string> => {
            const master = await rateForSource(src);
            const claimed = Number(claimedRaw);
            if (!Number.isFinite(claimed) || claimed <= 0) {
                return String(master);
            }
            if (
                master > 0 &&
                Math.abs(claimed - master) / master > RATE_TOLERANCE
            ) {
                return String(master);
            }
            return String(claimed);
        };
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

        // ── Costing carry-forward: margin / rebates / expenses ──────────────
        // The customer-facing (sales) value = vendor cost + margin (± expenses/
        // rebates). The SO line's own `unit_price` is only the vendor cost, so
        // without the costing snapshot `recompute` sees margin=0 and the
        // taxable/assessable value collapses to the purchase cost. The SO line
        // now FREEZES this costing (from the quotation at create); we read it
        // straight off the SO line, and only fall back to the quotation line
        // for legacy SOs created before those columns existed. Only fills when
        // the incoming DTO didn't already carry a value (an explicit operator
        // override still wins). PFI-sourced lines are skipped (PFI is retired).
        const poLineIds = Array.from(
            new Set(
                lines
                    .map((l) => l.purchase_order_line_id)
                    .filter(Boolean) as string[]
            )
        );
        const hasSnapshot = (v: any) => Array.isArray(v) && v.length > 0;
        const costByPoLineId = new Map<
            string,
            {
                margin_pct?: string;
                product_rebates_snapshot?: any;
                product_expenses_snapshot?: any;
            }
        >();
        if (poLineIds.length) {
            const soLines = (await this.poLineRepository.findAll({
                _id: In(poLineIds),
            } as any)) as any[];
            // Legacy SO lines that never stored costing → resolve via quotation.
            const qLineIdByPoLine = new Map<string, string>();
            const qLineIds = new Set<string>();
            for (const sl of soLines) {
                const hasOwn =
                    num(sl.margin_pct) > 0 ||
                    hasSnapshot(sl.product_rebates_snapshot) ||
                    hasSnapshot(sl.product_expenses_snapshot);
                if (hasOwn) {
                    costByPoLineId.set(sl._id.toString(), {
                        margin_pct: sl.margin_pct,
                        product_rebates_snapshot: sl.product_rebates_snapshot,
                        product_expenses_snapshot: sl.product_expenses_snapshot,
                    });
                    continue;
                }
                const qId = sl.source_quotation_line_id?.toString();
                if (qId) {
                    qLineIdByPoLine.set(sl._id.toString(), qId);
                    qLineIds.add(qId);
                }
            }
            const qLines = qLineIds.size
                ? ((await this.quotationLineRepository.findAll({
                      _id: In(Array.from(qLineIds)),
                  } as any)) as any[])
                : [];
            const qLineById = new Map<string, any>(
                qLines.map((q) => [q._id.toString(), q])
            );
            for (const [poLineId, qId] of qLineIdByPoLine.entries()) {
                const q = qLineById.get(qId);
                if (!q) continue;
                costByPoLineId.set(poLineId, {
                    margin_pct: q.margin_pct,
                    product_rebates_snapshot: q.product_rebates_snapshot,
                    product_expenses_snapshot: q.product_expenses_snapshot,
                });
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const prod: any = l.product_id ? productMap.get(l.product_id) : null;
            const src = sourceByPoLineId?.get(l.purchase_order_line_id);
            const cost = costByPoLineId.get(l.purchase_order_line_id);
            // A POSITIVE DTO margin is an explicit operator override and wins.
            // 0 / blank means the FE never carried one (its prefill reads the
            // SO line, which has no margin) → inherit from the quotation.
            const marginPct =
                num((l as any).margin_pct) > 0
                    ? String((l as any).margin_pct)
                    : cost?.margin_pct ?? '0';
            const rebatesSnapshot = hasSnapshot(
                (l as any).product_rebates_snapshot
            )
                ? (l as any).product_rebates_snapshot
                : cost?.product_rebates_snapshot ?? null;
            const expensesSnapshot = hasSnapshot(
                (l as any).product_expenses_snapshot
            )
                ? (l as any).product_expenses_snapshot
                : cost?.product_expenses_snapshot ?? null;
            const sourceCode = (
                (l as any).source_currency_code ||
                (cost as any)?.source_currency_code ||
                'INR'
            ).toUpperCase();
            // Same-currency lines always convert 1:1 — never trust a client
            // value here (this is exactly how INR-doc/INR-source lines ended
            // up frozen with an unrelated currency's rate).
            const claimedRate =
                (l as any).cost_exchange_rate ??
                (cost as any)?.cost_exchange_rate;
            const costExchangeRate =
                sourceCode === docCur
                    ? '1'
                    : claimedRate != null && claimedRate !== ''
                      ? await validatedRate(sourceCode, String(claimedRate))
                      : String(await rateForSource(sourceCode));
            await this.invoiceLineRepository.create({
                invoice_id: invoiceId,
                company_id: companyId,
                seq: l.seq ?? i + 1,
                purchase_order_line_id: l.purchase_order_line_id,
                po_vendor_line_id: l.po_vendor_line_id,
                // Frozen vendor from the SO line — kept so an edit re-shows it.
                vendor_id: (l as any).vendor_id || null,
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
                // Multi-currency: carry the line's source (vendor) currency +
                // frozen source→document rate from the SO line (or the
                // payload), validated against the Currency master above.
                source_currency_code: sourceCode,
                cost_exchange_rate: costExchangeRate,
                discount_pct: l.discount_pct || '0',
                margin_pct: marginPct || '0',
                tax_pct: l.tax_pct || '0',
                igst_rate_pct: l.igst_rate_pct || '0',
                product_rebates_snapshot: rebatesSnapshot,
                product_expenses_snapshot: expensesSnapshot,
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
        // Backfill vendor_id from the source SO line for legacy invoices saved
        // before the invoice line stored its own vendor_id — otherwise the edit
        // Costing Worksheet opens with a BLANK vendor dropdown even though the
        // order was priced from a specific vendor. New invoices already carry it.
        const needVendor = dto.lines.filter(
            (l) => !l.vendor_id && l.purchase_order_line_id
        );
        if (needVendor.length) {
            const soLineIds = Array.from(
                new Set(needVendor.map((l) => l.purchase_order_line_id as string))
            );
            const soLines = (await this.poLineRepository.findAll({
                _id: In(soLineIds),
            } as any)) as any[];
            const vendorBySoLine = new Map<string, string>();
            for (const sl of soLines) {
                if (sl.vendor_id)
                    vendorBySoLine.set(sl._id.toString(), sl.vendor_id.toString());
            }
            for (const l of needVendor) {
                const vid = vendorBySoLine.get(l.purchase_order_line_id as string);
                if (vid) l.vendor_id = vid;
            }
        }
        const payments = await this.invoicePaymentRepository.findActiveByInvoiceId(
            row._id.toString()
        );
        // Realized forex gain/loss per receipt (INR): the ₹ actually received
        // (amount × receipt rate) minus the ₹ booked at the invoice's rate
        // (amount × invoice rate). Positive = gain, negative = loss. 0 on a
        // home-currency invoice (both rates = 1) or a rate-less legacy receipt.
        //
        // CRITICAL: both rates are compared in the INR-per-foreign rate the
        // operator actually SEES and ENTERS — the 2-dp reciprocal of the stored
        // doc-per-₹1 rate. The stored rate is doc-per-₹1 at 6dp, whose raw
        // reciprocal drifts (₹95.09 entered → stored 0.010516 → 1/0.010516 =
        // 95.0932). Dividing by the raw stored rate fabricated a phantom
        // gain/loss even when the receipt rate equalled the invoice rate. Using
        // the same 2-dp INR rate on both sides makes an equal rate net EXACTLY 0.
        const invRate = num(row.exchange_rate) || 1;
        const toInrRate = (r: number) => (r > 0 ? round2(1 / r) : 0);
        const invRateInr = toInrRate(invRate);
        let forexTotal = 0;
        (dto as any).payments = (payments as any[]).map((p) => {
            const amt = num(p.amount);
            const rcptRate = num(p.exchange_rate) || invRate;
            const rcptRateInr = toInrRate(rcptRate) || invRateInr;
            const inrExpected = amt * invRateInr;
            const inrReceived = amt * rcptRateInr;
            const gl = round2(inrReceived - inrExpected);
            forexTotal = round2(forexTotal + gl);
            return {
                ...p,
                exchange_rate: String(rcptRate),
                inr_expected: String(round2(inrExpected)),
                inr_received: String(round2(inrReceived)),
                forex_gain_loss_inr: String(gl),
            };
        });
        (dto as any).forex_gain_loss_inr = String(forexTotal);

        // Multi-SO reference numbers: the distinct union of the invoice's own
        // reference_no + every source SO's reference_no (via the lines' SOs) —
        // the same list the PDFs print. Comma-joined for the detail panel.
        const refList: string[] = [];
        const seenRef = new Set<string>();
        const pushRef = (r?: string) => {
            const v = (r || '').trim();
            if (v && !seenRef.has(v)) {
                seenRef.add(v);
                refList.push(v);
            }
        };
        pushRef((row as any).reference_no);
        const refPoLineIds = Array.from(
            new Set(
                (lines as any[])
                    .map((l) => l.purchase_order_line_id?.toString())
                    .filter(Boolean)
            )
        );
        if (refPoLineIds.length) {
            try {
                const refPoLines = await this.poLineRepository.findAll({
                    _id: { $in: refPoLineIds },
                } as any);
                const refPoIds = Array.from(
                    new Set(
                        (refPoLines as any[])
                            .map((pl) => pl.purchase_order_id?.toString())
                            .filter(Boolean)
                    )
                );
                if (refPoIds.length) {
                    const refPos = await this.poRepository.findAll({
                        _id: { $in: refPoIds },
                    } as any);
                    (refPos as any[])
                        .slice()
                        .sort((a, b) =>
                            String(a.voucher_no || '').localeCompare(
                                String(b.voucher_no || '')
                            )
                        )
                        .forEach((po) => pushRef(po.reference_no));
                }
            } catch {
                /* non-fatal — fall back to the invoice's own reference_no */
            }
        }
        (dto as any).reference_nos =
            refList.join(', ') || (row as any).reference_no || undefined;

        // ── Customer details for the detail-page header ─────────────────────
        // The invoice stores only customer_id (customer_snapshot is unused at
        // create), so resolve the master + primary contact here — mirrors the
        // list's mapListBatch enrichment. Non-fatal: a missing customer just
        // leaves the fields undefined.
        try {
            const cust: any = row.customer_id
                ? await this.customerRepository.findOneById(
                      row.customer_id.toString()
                  )
                : null;
            if (cust) {
                (dto as any).customer_name =
                    cust.company_name || cust.name || undefined;
                (dto as any).customer_gstin = cust.gstin || undefined;
                const contacts: any[] =
                    await this.customerContactRepository.findAll({
                        customer_id: row.customer_id.toString(),
                        soft_delete: false,
                    } as any);
                const primary =
                    contacts.find((c) => c.is_primary) || contacts[0];
                if (primary) {
                    (dto as any).customer_contact_name =
                        primary.name || undefined;
                    (dto as any).customer_contact_email =
                        primary.email || undefined;
                    (dto as any).customer_contact_phone =
                        primary.phone || undefined;
                    (dto as any).customer_contact_country_code =
                        primary.country_code || undefined;
                }
            }
        } catch {
            /* non-fatal — header simply omits the customer details */
        }

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

        // PO is multi-vendor at line level — hydrate each line's own vendor
        // (name) so the invoice line built from it carries the vendor
        // forward, same as every other line-building path in this module.
        const vendorIds = Array.from(
            new Set(
                poLines
                    .map((l: any) => l.vendor_id?.toString())
                    .filter((v: any): v is string => !!v)
            )
        );
        const vendors = vendorIds.length
            ? ((await this.vendorRepository.findAll({
                  _id: { $in: vendorIds },
              } as any)) as any[])
            : [];
        const vendorById = new Map<string, any>(
            vendors.map((v: any) => [v._id.toString(), v])
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
            const dispatched = dispatchedByPoLine.get(k) || 0;
            const invoicedAll = await this.invoiceRepository.sumQtyByPoLineId(k);
            const invoicedOthers = invoicedAll - (selfQtyByPoLine.get(k) || 0);
            // Ceiling = SO-line ordered qty, raised to the dispatched qty when
            // the line was over-procured (editable POV "To Procure" above SO
            // pending). Never below SO qty so sell-from-stock still works.
            const ceiling = Math.max(ordered, dispatched);
            const available =
                ceiling - invoicedOthers - (selfQtyByPoLine.get(k) || 0);
            if (available <= 1e-6) continue;
            const prod = productById.get(l.product_id?.toString());
            const vendor = vendorById.get(l.vendor_id?.toString());
            result.push({
                purchase_order_line_id: k,
                product_id: l.product_id?.toString(),
                product_name: prod?.name || l.product_name,
                product_code: prod?.code || l.product_code,
                vendor_id: l.vendor_id?.toString() || null,
                vendor_name: vendor?.company_name || null,
                part_no: prod?.part_no || (l as any).part_no,
                description: l.description || prod?.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                customer_reference: l.customer_reference,
                unit: l.unit,
                unit_price: l.unit_price,
                // Multi-currency: carry the SO line's source currency + frozen
                // source→document rate so the invoice prefills them.
                source_currency_code:
                    (l as any).source_currency_code || 'INR',
                cost_exchange_rate:
                    (l as any).cost_exchange_rate ?? '1',
                // Costing snapshot — was missing entirely, so an added line
                // silently lost its SO-side discount/margin (defaulted to 0
                // on the frontend since the field was simply never sent).
                discount_pct: (l as any).discount_pct ?? '0',
                margin_pct: (l as any).margin_pct ?? '0',
                // GST for the invoice line comes from the PRODUCT master, not
                // the SO line's own `tax_pct` — that field is the VENDOR's
                // cost-side GST rate (see purchase-order-line.entity.ts), not
                // the product's own (HSN-based) sales GST rate.
                tax_pct: prod?.tax_pct ?? '0',
                product_rebates_snapshot: l.product_rebates_snapshot || [],
                product_expenses_snapshot: l.product_expenses_snapshot || [],
                // Packing snapshot carried from the SO line → invoice line.
                net_weight_kg: l.net_weight_kg ?? null,
                gross_weight_kg: l.gross_weight_kg ?? null,
                package_count: l.package_count ?? null,
                // Ordered = SO line qty; available = remaining not-yet-invoiced
                // (ordered − invoiced elsewhere). The picker shows "remaining X
                // of ordered Y" and auto-fills the qty with `available` so a
                // second (partial) invoice defaults to what's still to bill.
                ordered: String(ordered),
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
        // Invoiceable SO = anything not cancelled — INCLUDING drafts. A draft SO
        // with free stock is invoiceable (sell-from-stock needs no confirmation
        // or POV dispatch), so it must appear in this picker. Only cancelled SOs
        // have nothing to invoice. getAddablePoLines() below still filters each
        // SO to lines with available qty, so an empty/stockless draft never
        // shows a line. (Was: excluded drafts, which hid stock-backed draft SOs.)
        const active = pos.filter((p) => p.status !== 'cancelled');
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
                // The SO's advance — the FE sums it across the picked SOs so the
                // invoice's auto-managed advance previews correctly before save.
                advance_amount: String(po.advance_amount ?? '0'),
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

        // ── Source Sales Orders per invoice (id + voucher) ──────────────────
        // An invoice can span several SOs; resolve them via its lines'
        // purchase_order_line_id → SO line → SO, so the listing links each SO to
        // its own page (not just the header's single purchase_order_id).
        const invoiceIds = rows
            .map((r) => r._id?.toString())
            .filter((v: any): v is string => !!v);
        const invLines = invoiceIds.length
            ? ((await this.invoiceLineRepository.findAll({
                  invoice_id: { $in: invoiceIds },
                  soft_delete: false,
              } as any)) as any[])
            : [];
        const poLineIdsByInvoice = new Map<string, Set<string>>();
        const allPoLineIds = new Set<string>();
        for (const l of invLines) {
            const invId = l.invoice_id?.toString();
            const polId = l.purchase_order_line_id?.toString();
            if (!invId || !polId) continue;
            if (!poLineIdsByInvoice.has(invId))
                poLineIdsByInvoice.set(invId, new Set());
            poLineIdsByInvoice.get(invId).add(polId);
            allPoLineIds.add(polId);
        }
        const srcPoLines = allPoLineIds.size
            ? ((await this.poLineRepository.findAll({
                  _id: { $in: Array.from(allPoLineIds) },
              } as any)) as any[])
            : [];
        const poIdByPoLine = new Map<string, string>();
        const allPoIds = new Set<string>();
        for (const pl of srcPoLines) {
            const poId = pl.purchase_order_id?.toString();
            if (!poId) continue;
            poIdByPoLine.set(pl._id.toString(), poId);
            allPoIds.add(poId);
        }
        const srcPos = allPoIds.size
            ? ((await this.poRepository.findAll({
                  _id: { $in: Array.from(allPoIds) },
              } as any)) as any[])
            : [];
        const poVoucherById = new Map<string, string>(
            srcPos.map((p: any) => [p._id.toString(), p.voucher_no])
        );

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
            // Distinct source SOs (in first-seen order) → {id, voucher}.
            const polIds = poLineIdsByInvoice.get(r._id?.toString());
            const seenPo = new Set<string>();
            const sourceOrders: Array<{ id: string; voucher_no: string }> = [];
            if (polIds) {
                for (const polId of polIds) {
                    const poId = poIdByPoLine.get(polId);
                    if (!poId || seenPo.has(poId)) continue;
                    seenPo.add(poId);
                    sourceOrders.push({
                        id: poId,
                        voucher_no: poVoucherById.get(poId) || '',
                    });
                }
            }
            dto.source_orders = sourceOrders;
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
                    '(entity.voucher_no ILIKE :q OR entity.purchase_order_voucher_no ILIKE :q OR entity.reference_no ILIKE :q)',
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
        limit = 5,
        opts?: { date_from?: string; date_to?: string }
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
        // Optional period window (dashboard "This Month" / "Financial Year").
        // Filters on invoice_date; params built dynamically so the LIMIT
        // placeholder shifts correctly when the dates are present.
        const params: any[] = [companyId];
        let dateClause = '';
        if (opts?.date_from) {
            params.push(opts.date_from);
            dateClause += ` AND i.invoice_date >= $${params.length}`;
        }
        if (opts?.date_to) {
            params.push(opts.date_to);
            dateClause += ` AND i.invoice_date <= $${params.length}`;
        }
        params.push(lim);
        const limIdx = params.length;
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
               AND i.customer_id IS NOT NULL${dateClause}
             GROUP BY i.customer_id, c.company_name
             ORDER BY amount_inr DESC
             LIMIT $${limIdx}`,
            params
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
               AND il.product_id IS NOT NULL${dateClause}
             GROUP BY il.product_id, p.name
             ORDER BY amount_inr DESC
             LIMIT $${limIdx}`,
            params
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
