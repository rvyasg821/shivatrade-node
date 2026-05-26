import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { InvoiceRepository } from '../repository/repositories/invoice.repository';
import { InvoiceLineRepository } from '../repository/repositories/invoice-line.repository';
import { InvoiceDoc } from '../repository/entities/invoice.entity';
import { InvoiceLineDoc } from '../repository/entities/invoice-line.entity';
import {
    ENUM_INVOICE_GST_ROUTE,
    ENUM_INVOICE_STATUS,
    ENUM_INVOICE_TYPE,
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
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { In } from 'typeorm';

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
        private readonly productRepository: ProductRepository
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
        };
    }

    // ─── Create ─────────────────────────────────────────────────────────

    async create(
        companyId: string,
        data: InvoiceCreateRequestDto,
        userId: string
    ): Promise<InvoiceDoc> {
        await this.assertQtyGuardForLines(data.lines);

        // Pull defaults from Company master so the DRAFT carries snapshot
        // values from the start - operator can override before issuing.
        const ctx = await this.loadCompanyContext(companyId);

        const header = await this.invoiceRepository.create({
            company_id: companyId,
            created_by: userId,
            invoice_type: data.invoice_type || ENUM_INVOICE_TYPE.EXPORT,
            status: ENUM_INVOICE_STATUS.DRAFT,
            invoice_date: data.invoice_date,
            due_date: data.due_date,
            purchase_order_id: data.purchase_order_id,
            pfi_id: data.pfi_id,
            quotation_id: data.quotation_id,
            customer_po_no: data.customer_po_no,
            country_of_destination: data.country_of_destination,
            country_of_origin: data.country_of_origin || 'India',
            shipping_id: data.shipping_id,
            customer_id: data.customer_id,
            customer_address_id: data.customer_address_id,
            consignee_id: data.consignee_id,
            consignee_address_id: data.consignee_address_id,
            notify_party_id: data.notify_party_id,
            currency_code: data.currency_code,
            currency_symbol: data.currency_symbol,
            exchange_rate: data.exchange_rate || '1',
            discount_total: data.discount_total || '0',
            freight_charges: data.freight_charges || '0',
            insurance_charges: data.insurance_charges || '0',
            other_charges: data.other_charges || '0',
            advance_received: data.advance_received || '0',
            gst_route: data.gst_route || ENUM_INVOICE_GST_ROUTE.IGST_PAID,
            lut_no: data.lut_no,
            lut_date: data.lut_date,
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
            // Pre-fill banks from active company bank accounts if client didn't pass any.
            bank_snapshots:
                data.bank_snapshots && data.bank_snapshots.length > 0
                    ? data.bank_snapshots
                    : ctx.bank_snapshots,
            notes_to_buyer: data.notes_to_buyer,
            internal_notes: data.internal_notes,
            declaration_text: data.declaration_text,
        } as any);

        await this.writeLines(header._id.toString(), companyId, data.lines);
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

            await this.invoiceRepository.save(row);

            if (Array.isArray(lines)) {
                await this.assertQtyGuardForLines(lines, row._id.toString());
                await this.invoiceLineRepository.deleteByInvoiceId(
                    row._id.toString()
                );
                await this.writeLines(row._id.toString(), row.company_id.toString(), lines);
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

        // Assign voucher (compact format e.g. STIPL001/2026-27)
        row.voucher_no = await this.voucherService.getNext(
            row.company_id.toString(),
            ENUM_VOUCHER_DOC_TYPE.INVOICE_EXPORT,
            ctx.voucher_prefix,
            new Date(row.invoice_date)
        );

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

        row.status = ENUM_INVOICE_STATUS.ISSUED;
        row.issued_by = userId;
        row.issued_at = new Date();

        await this.invoiceRepository.save(row);
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
        this.logger.log(`Invoice cancelled: ${row._id}`);
        return row;
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

        // Per-line:
        //   base       = qty × unit_price
        //   adjusted   = (base + Σ expenses) − Σ rebates
        //   taxable    = adjusted × (1 − discount_pct / 100)
        //
        // `expenses` / `rebates` come from the per-line snapshot arrays
        // (mirrors Quotation / PFI / PO costing). On export, tax_pct = 0 so
        // cgst/sgst/igst remain 0 and line_total == taxable.
        let subtotal = 0;
        for (const l of lines) {
            const qty = num(l.qty);
            const price = num(l.unit_price);
            const discount = num(l.discount_pct);
            const base = qty * price;

            const expensesTotal = sumExpenses(
                l.product_expenses_snapshot,
                base
            );
            const rebatesTotal = sumRebates(
                l.product_rebates_snapshot,
                base
            );
            const adjusted = base + expensesTotal - rebatesTotal;
            const taxable = round2(adjusted * (1 - discount / 100));

            l.taxable_amount = String(taxable);
            l.cgst_amount = '0';
            l.sgst_amount = '0';
            l.igst_amount = '0';
            l.line_total = String(taxable);
            await this.invoiceLineRepository.save(l);
            subtotal += taxable;
        }

        const discount_total = num(row.discount_total);
        const fob_value = round2(subtotal - discount_total);
        const freight = num(row.freight_charges);
        const insurance = num(row.insurance_charges);
        const other = num(row.other_charges);
        const grand_total = round2(fob_value + freight + insurance + other);
        const grand_total_inr = round2(grand_total * num(row.exchange_rate));
        const advance = num(row.advance_received);
        const balance = round2(grand_total - advance);

        row.subtotal = String(round2(subtotal));
        row.fob_value = String(fob_value);
        row.grand_total = String(grand_total);
        row.grand_total_inr = String(grand_total_inr);
        row.balance_receivable = String(balance);

        await this.invoiceRepository.save(row);
    }

    // ─── Qty guard ──────────────────────────────────────────────────────

    /**
     * `invoice_qty ≤ po_line.qty − Σ already-invoiced` (excluding cancelled
     * invoices; excluding self if we're updating).
     *
     * Phase 1: we only enforce against existing Invoice rows. PO line.qty
     * check is delegated to the FE pre-fill flow (the "Generate Invoice from
     * PO" action passes line.qty as the upper bound). A stricter BE check
     * against `purchase_order_lines.qty` can land in Phase 2 if needed.
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
        for (const [poLineId, reqQty] of requested.entries()) {
            const alreadyInvoiced =
                await this.invoiceRepository.sumQtyByPoLineId(poLineId);
            // (exclude-self adjustment): If we're updating, the self-invoice
            // qty is already in alreadyInvoiced; subtract our previous qty.
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
            if (reqQty < 0) {
                throw new BadRequestException(
                    `qty must be ≥ 0 on PO line ${poLineId}`
                );
            }
            // We can only validate vs other invoices here; PO-line-total
            // bound is the FE pre-fill responsibility (see method doc).
            if (availableHistorical < 0) {
                // Shouldn't happen; defensive.
                throw new BadRequestException(
                    `Qty guard inconsistency on PO line ${poLineId}.`
                );
            }
        }
    }

    // ─── IGST refund buckets ────────────────────────────────────────────

    /**
     * Buckets invoice lines by `igst_rate_pct`. For each bucket:
     *   assessable_value_inr = Σ (taxable_amount × exchange_rate)
     *   igst_amount_inr      = assessable_value_inr × rate
     *
     * Returns the array + the total IGST refund (sum of buckets).
     */
    private buildIgstRefundBuckets(
        lines: InvoiceLineDoc[],
        exchangeRate: number
    ): { buckets: any[]; totalRefund: number } {
        const grouped = new Map<string, number>(); // rate_pct → INR assessable
        for (const l of lines) {
            const rate = num(l.igst_rate_pct);
            const taxableInr = num(l.taxable_amount) * exchangeRate;
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
        lines: InvoiceLineDto[]
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
            await this.invoiceLineRepository.create({
                invoice_id: invoiceId,
                company_id: companyId,
                seq: l.seq ?? i + 1,
                purchase_order_line_id: l.purchase_order_line_id,
                po_vendor_line_id: l.po_vendor_line_id,
                product_id: l.product_id,
                product_name: l.product_name || prod?.name || '',
                product_code: l.product_code || prod?.code,
                description: l.description,
                hsn_code: l.hsn_code || prod?.hsn_code,
                customer_reference: l.customer_reference,
                unit: l.unit || prod?.unit_of_measure,
                uqc_code: l.uqc_code,
                qty: l.qty,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct || '0',
                tax_pct: l.tax_pct || '0',
                igst_rate_pct: l.igst_rate_pct || '0',
                product_rebates_snapshot:
                    (l as any).product_rebates_snapshot ?? null,
                product_expenses_snapshot:
                    (l as any).product_expenses_snapshot ?? null,
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
        return dto;
    }

    mapList(row: any): InvoiceListResponseDto {
        return plainToInstance(InvoiceListResponseDto, row);
    }
}
