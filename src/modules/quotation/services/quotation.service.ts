import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationLineRepository } from '../repository/repositories/quotation-line.repository';
import { QuotationDoc } from '../repository/entities/quotation.entity';
import { QuotationCreateRequestDto } from '../dtos/request/quotation.create.request.dto';
import { QuotationUpdateRequestDto } from '../dtos/request/quotation.update.request.dto';
import {
    QuotationGetResponseDto,
    QuotationLineResponseDto,
} from '../dtos/response/quotation.get.response.dto';
import { QuotationPublicResponseDto } from '../dtos/response/quotation.public.response.dto';
import { ENUM_QUOTATION_STATUS } from '../enums/quotation.enum';
import { DependencyCheckService } from '@modules/dependency-check/dependency-check.service';

import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { LeadService } from '@modules/lead/services/lead.service';
import { LeadActivityService } from '@modules/lead/services/lead-activity.service';
import { ENUM_LEAD_ACTIVITY_TYPE } from '@modules/lead/enums/lead-activity.enum';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';
import { PfiRepository } from '@modules/pfi/repository/repositories/pfi.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { RfqRepository } from '@modules/rfq/repository/repositories/rfq.repository';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { PdfService } from '@common/pdf/pdf.service';
import { docDate } from '@common/pdf/tally-pdf.util';
import {
    buildPdfLetterhead,
    buildPdfHeaderTemplate,
    buildPdfFooterTemplate,
    loadCompanyLogoDataUri,
} from '@common/pdf/pdf-letterhead.util';
import { CompanySettingsRepository } from '@modules/company-settings/repository/repositories/company-settings.repository';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class QuotationService {
    private readonly logger = new Logger(QuotationService.name);

    constructor(
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly leadRepository: LeadRepository,
        private readonly leadService: LeadService,
        private readonly leadActivityService: LeadActivityService,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly productRepository: ProductRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly pfiRepository: PfiRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly rfqRepository: RfqRepository,
        private readonly voucherService: VoucherService,
        private readonly pdfService: PdfService,
        private readonly companySettingsRepository: CompanySettingsRepository,
        private readonly dependencyCheckService: DependencyCheckService
    ) {}

    /**
     * Delete policy: block if any Sales Order / Invoice references this
     * quotation; otherwise only a DRAFT may be deleted (a sent quotation must
     * be cancelled), and it is HARD-deleted with its lines. `softDelete` above
     * remains for internal use.
     */
    async deleteWithGuard(row: QuotationDoc): Promise<void> {
        await this.dependencyCheckService.assertNoDependents(
            'quotation',
            row._id.toString(),
            'Quotation'
        );
        if (row.status !== ENUM_QUOTATION_STATUS.DRAFT) {
            throw new BadRequestException(
                'Only a draft Quotation can be deleted. Cancel it instead.'
            );
        }
        await this.quotationLineRepository.deleteMany({
            quotation_id: row._id.toString(),
        } as any);
        await this.quotationRepository.delete({ _id: row._id } as any);
    }

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        customerId: string,
        currencyCode: string,
        leadId?: string,
        customerAddressId?: string
    ): Promise<void> {
        const customer = await this.customerRepository.findOne({
            _id: customerId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!customer) throw new BadRequestException('Customer not found');

        if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode.toUpperCase())) {
            throw new BadRequestException('Invalid currency_code');
        }

        if (leadId) {
            const lead = await this.leadRepository.findOne({
                _id: leadId,
                company_id: companyId,
                soft_delete: false,
            } as any);
            if (!lead) throw new BadRequestException('Lead not found');
        }

        if (customerAddressId) {
            const addr = await this.customerAddressRepository.findOne({
                _id: customerAddressId,
                customer_id: customerId,
                soft_delete: false,
            } as any);
            if (!addr) {
                // Don't hard-fail - common case is the address belongs to a
                // different customer (e.g. auto-create-from-Lead set a stale
                // default). Caller should treat as "no address selected".
                return { addressMismatched: true } as any;
            }
        }
        return undefined as any;
    }

    // ─── Voucher prefix lookup ──────────────────────────────────────────

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

    // ─── Public CRUD ────────────────────────────────────────────────────

    async create(
        companyId: string,
        data: QuotationCreateRequestDto,
        createdBy: string
    ): Promise<QuotationDoc> {
        // Auto-resolve customer when only a lead is provided. Lead carries
        // company_name, contact, address - enough to materialise a Customer
        // record so the Quotation can reference it. Idempotent: if the lead
        // already has customer_id / converted_customer_id, that is reused.
        if (!data.customer_id && data.lead_id) {
            const customerId = await this.leadService.linkOrCreateCustomerForLead(
                data.lead_id,
                createdBy
            );
            (data as any).customer_id = customerId;
        }

        if (!data.customer_id) {
            throw new BadRequestException(
                'Either customer_id or lead_id is required'
            );
        }

        // Auto-fill bill-to address from customer's default if FE didn't
        // provide one. Common when arriving from a lead - backend just
        // materialised the customer + address, but the form's payload had
        // no address selected.
        if (!data.customer_address_id) {
            const defaultAddr = await this.customerAddressRepository.findOne({
                customer_id: data.customer_id,
                is_default: true,
                soft_delete: false,
            } as any);
            const fallback =
                defaultAddr ||
                (await this.customerAddressRepository.findOne({
                    customer_id: data.customer_id,
                    type: 'bill_to',
                    soft_delete: false,
                } as any));
            if (fallback) {
                (data as any).customer_address_id = fallback._id.toString();
            }
        }

        const refsOut = await this.assertReferences(
            companyId,
            data.customer_id,
            data.currency_code,
            data.lead_id,
            data.customer_address_id
        );
        if ((refsOut as any)?.addressMismatched) {
            (data as any).customer_address_id = undefined;
        }

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.QUOTATION,
            prefix
        );

        const header = await this.quotationRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            lead_id: data.lead_id || null,
            rfq_id: data.rfq_id || null,
            customer_id: data.customer_id,
            customer_address_id: data.customer_address_id || null,
            consignee_id: data.consignee_id || null,
            consignee_same_as_buyer: data.consignee_same_as_buyer ?? true,
            consignee_address_id: data.consignee_address_id || null,
            consignee_snapshot: data.consignee_snapshot || null,
            quotation_date: data.quotation_date,
            valid_until: data.valid_until || null,
            currency_code: data.currency_code,
            exchange_rate: data.exchange_rate || '1',
            freight_total: data.freight_total || '0',
            payment_terms: data.payment_terms || null,
            delivery_terms: data.delivery_terms || null,
            delivery_location: data.delivery_location || null,
            notes_to_client: data.notes_to_client || null,
            internal_notes: data.internal_notes || null,
            margin_pct: data.margin_pct || '0',
            status: data.status || ENUM_QUOTATION_STATUS.DRAFT,
            version: 1,
        } as any);

        await this.replaceLines(
            companyId,
            header._id.toString(),
            data.lines,
            data.margin_pct || '0',
            voucher_no
        );

        await this.recompute(header._id.toString(), companyId);

        // Auto-advance the source RFQ to "completed" — a quotation has been
        // generated from it. Best-effort; never block quotation creation on it,
        // and don't walk back a cancelled RFQ.
        if (data.rfq_id) {
            try {
                const srcRfq: any = await this.rfqRepository.findOne({
                    _id: data.rfq_id,
                    company_id: companyId,
                } as any);
                if (srcRfq && srcRfq.status !== 'cancelled') {
                    srcRfq.status = 'completed';
                    await this.rfqRepository.save(srcRfq);
                }
            } catch {
                /* non-fatal */
            }
        }

        this.logger.log(
            `Quotation created: ${header._id} (${voucher_no})`
        );

        // Timeline entry on the source lead, if any.
        if (data.lead_id) {
            this.leadActivityService
                .addSystem(
                    companyId,
                    data.lead_id,
                    ENUM_LEAD_ACTIVITY_TYPE.QUOTATION_CREATED,
                    {
                        metadata: {
                            quotation_id: header._id.toString(),
                            voucher_no,
                        },
                        createdBy,
                    }
                )
                .catch((err) =>
                    this.logger.warn(
                        `Failed to log quotation_created activity: ${err.message}`
                    )
                );
        }

        return this.quotationRepository.findOneById(header._id.toString());
    }

    async findOneById(id: string): Promise<QuotationDoc> {
        const row = await this.quotationRepository.findOne({
            _id: id,
            soft_delete: false,
        } as any);
        if (!row) throw new NotFoundException('Quotation not found');
        return row;
    }

    async update(
        row: QuotationDoc,
        data: QuotationUpdateRequestDto
    ): Promise<QuotationDoc> {
        const companyId = row.company_id.toString();

        // ── Status lock ───────────────────────────────────────────────
        // Only DRAFT is fully editable. Other statuses accept ONLY a
        // status transition (and internal_notes), nothing else.
        // Exception: if the same payload is reverting to DRAFT, treat the
        // row as unlocked - the transition matrix below still validates
        // that the revert is allowed. This lets the FE do one-shot
        // "revert + edit" instead of two round-trips.
        const willBeDraft = data.status === ENUM_QUOTATION_STATUS.DRAFT;
        const isLocked =
            row.status !== ENUM_QUOTATION_STATUS.DRAFT && !willBeDraft;
        const isStatusOnlyChange = (() => {
            if (!isLocked) return true;
            const allowedKeys = new Set(['status', 'internal_notes']);
            return Object.keys(data || {}).every((k) =>
                allowedKeys.has(k) || (data as any)[k] === undefined
            );
        })();
        if (isLocked && !isStatusOnlyChange) {
            throw new BadRequestException(
                `Quotation is ${row.status}. Revert to draft to edit fields.`
            );
        }
        if (data.status && data.status !== row.status) {
            this.assertStatusTransitionAllowed(row.status, data.status);
        }

        const refsOut = await this.assertReferences(
            companyId,
            data.customer_id || row.customer_id.toString(),
            data.currency_code || row.currency_code,
            data.lead_id ?? row.lead_id?.toString(),
            data.customer_address_id ?? row.customer_address_id?.toString()
        );
        if ((refsOut as any)?.addressMismatched) {
            // Stale/mismatched address - null it on the row so the user can
            // pick a fresh one without the save being blocked.
            (data as any).customer_address_id = null;
        }

        const wasApproved = row.status === ENUM_QUOTATION_STATUS.APPROVED;
        const wasSent = row.status === ENUM_QUOTATION_STATUS.SENT;

        // Apply scalar updates (skip nested arrays - replaced separately).
        const { lines, ...scalar } = data as any;
        Object.assign(row, scalar);
        await this.quotationRepository.save(row);

        if (Array.isArray(lines)) {
            await this.replaceLines(
                companyId,
                row._id.toString(),
                lines,
                (data.margin_pct ?? row.margin_pct) || '0',
                row.voucher_no
            );
        }

        await this.recompute(row._id.toString(), companyId);

        const refreshed = await this.quotationRepository.findOneById(
            row._id.toString()
        );

        // Side-effects on linked lead:
        //   draft → sent      → mark lead PROPOSAL_SENT
        //   draft|sent → approved → mark lead WON (+ link customer)
        if (refreshed.lead_id) {
            const becomesSent =
                !wasSent &&
                !wasApproved &&
                refreshed.status === ENUM_QUOTATION_STATUS.SENT;
            const becomesApproved =
                !wasApproved &&
                refreshed.status === ENUM_QUOTATION_STATUS.APPROVED;

            if (becomesApproved) {
                await this.leadService.markWon(
                    refreshed.lead_id.toString(),
                    refreshed.customer_id?.toString()
                );
            } else if (becomesSent) {
                await this.leadService.markProposalSent(
                    refreshed.lead_id.toString()
                );
            }
        }

        this.logger.log(`Quotation updated: ${row._id}`);
        return refreshed;
    }

    /**
     * Allowed status transitions:
     *   draft     → sent | approved | rejected
     *   sent      → draft | approved | rejected
     *   approved  → draft (revert; no other moves)
     *   rejected  → draft (re-quote; no other moves)
     */
    private assertStatusTransitionAllowed(
        from: ENUM_QUOTATION_STATUS,
        to: ENUM_QUOTATION_STATUS
    ): void {
        const map: Record<string, ENUM_QUOTATION_STATUS[]> = {
            [ENUM_QUOTATION_STATUS.DRAFT]: [
                ENUM_QUOTATION_STATUS.SENT,
                ENUM_QUOTATION_STATUS.APPROVED,
                ENUM_QUOTATION_STATUS.REJECTED,
            ],
            [ENUM_QUOTATION_STATUS.SENT]: [
                ENUM_QUOTATION_STATUS.DRAFT,
                ENUM_QUOTATION_STATUS.APPROVED,
                ENUM_QUOTATION_STATUS.REJECTED,
            ],
            [ENUM_QUOTATION_STATUS.APPROVED]: [ENUM_QUOTATION_STATUS.DRAFT],
            [ENUM_QUOTATION_STATUS.REJECTED]: [ENUM_QUOTATION_STATUS.DRAFT],
        };
        const allowed = map[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition quotation from ${from} to ${to}.`
            );
        }
    }

    async softDelete(row: QuotationDoc): Promise<void> {
        // Block delete when any non-soft-deleted PFI or PO references it.
        const [activePfis, activePos] = await Promise.all([
            this.pfiRepository.getTotal({
                quotation_id: row._id.toString(),
                soft_delete: false,
            } as any),
            this.poRepository.getTotal({
                quotation_id: row._id.toString(),
                soft_delete: false,
            } as any),
        ]);
        if (activePfis > 0 || activePos > 0) {
            const parts: string[] = [];
            if (activePfis > 0) parts.push(`${activePfis} PFI(s)`);
            if (activePos > 0) parts.push(`${activePos} Purchase Order(s)`);
            throw new BadRequestException(
                `Cannot delete Quotation: ${parts.join(' and ')} reference it. Delete those first.`
            );
        }

        row.soft_delete = true;
        await this.quotationRepository.save(row);
        this.logger.log(`Quotation soft-deleted: ${row._id}`);
    }

    // ─── Replace-on-update for nested arrays ────────────────────────────

    private async replaceLines(
        companyId: string,
        quotationId: string,
        lines?: any[],
        defaultMarginPct: string = '0',
        // Quotation voucher — fallback for an empty per-line buyer-ref
        // (customer_reference). Fills only when the line has no ref so a
        // user-entered value is never clobbered. (TKT-0, §7a)
        voucherNo?: string
    ): Promise<void> {
        await this.quotationLineRepository.deleteByQuotationId(quotationId);
        if (!lines?.length) return;

        // The line's rebate/expense snapshots are the source of truth - they
        // arrive pre-filled from the product master on the FE but are then
        // user-editable per line (edit pct/value/type, add ad-hoc rows,
        // delete). Persist exactly what the FE sends; never rebuild from the
        // product master here (that would silently drop edits + ad-hoc rows).
        let seq = 0;
        for (const l of lines) {
            seq += 1;
            const pid = l.product_id;
            await this.quotationLineRepository.create({
                company_id: companyId,
                quotation_id: quotationId,
                product_id: pid,
                vendor_id: l.vendor_id || null,
                price_list_id: l.price_list_id || null,
                source_rfq_id: l.source_rfq_id || null,
                source_rfq_voucher_no: l.source_rfq_voucher_no || null,
                description: l.description || null,
                customer_reference:
                    (typeof l.customer_reference === 'string' &&
                        l.customer_reference.trim()) ||
                    voucherNo ||
                    null,
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
                product_rebates_snapshot: Array.isArray(
                    l.product_rebates_snapshot
                )
                    ? l.product_rebates_snapshot
                    : [],
                product_expenses_snapshot: Array.isArray(
                    l.product_expenses_snapshot
                )
                    ? l.product_expenses_snapshot
                    : [],
                product_rebates_amount: '0',
                product_expenses_amount: '0',
                // null = inherit from header.margin_pct at recompute time.
                // Only persist a value when the line was explicitly set (non-empty).
                margin_pct:
                    l.margin_pct != null && l.margin_pct !== ''
                        ? String(l.margin_pct)
                        : null,
                margin_amount: '0',
                seq,
                // ── Export / Shipping (mirrors PFI line shape) ──
                part_no: l.part_no || null,
                hs_code: l.hs_code || null,
                net_weight_kg: l.net_weight_kg || '0',
                gross_weight_kg: l.gross_weight_kg || '0',
                package_count: Number(l.package_count || 0),
            } as any);
        }
    }

    // ─── Costing engine ─────────────────────────────────────────────────

    /**
     * Recomputes per-line tax snapshots and header totals according to the
     * costing formula:
     *   subtotal       = Σ taxable per line  (qty × unit_price − discount)
     *   expenses_total = Σ expense.amount
     *   rebates_total  = Σ rebate.amount
     *   net_pre_margin = subtotal + expenses − rebates
     *   margin_amount  = net_pre_margin × (margin_pct / 100)
     *   tax_total      = Σ per-line tax (from tax engine; usually 0 for export)
     *   grand_total    = (net_pre_margin + margin_amount + tax_total) × exchange_rate
     *
     * For ShivaTrades exports, tax_pct is 0 on every line (LUT) so tax_total is 0.
     * The grand_total is in the customer's currency (currency_id), where
     * exchange_rate is "1 INR = X customer-currency-units".
     */
    private async recompute(
        quotationId: string,
        companyId: string
    ): Promise<void> {
        const header = await this.quotationRepository.findOneById(quotationId);
        if (!header) return;

        const lines = await this.quotationLineRepository.findAll({
            quotation_id: quotationId,
        } as any);

        // Resolve states for tax engine (intra-state vs inter-state).
        const customerState = await this.lookupCustomerState(
            header.customer_address_id?.toString()
        );
        const companyState = await this.lookupCompanyState(companyId);

        let subtotal = 0;
        let tax_total = 0;
        let product_rebates_total = 0;
        let product_expenses_total = 0;
        let line_margin_total = 0;

        for (const ln of lines) {
            // Use the engine only for the intra/inter split; recompute the
            // tax amount ourselves on Net Total per spec (p.24).
            const split = computeLineTax({
                qty: num(ln.qty),
                unit_price: num(ln.unit_price),
                discount_pct: num(ln.discount_pct),
                tax_pct: 0,
                customer_state: customerState,
                company_state: companyState,
            });

            ln.taxable = String(split.taxable);

            // Sequential costing per spec:
            //   Taxable → + Expenses → − Rebates → + Margin → + GST
            // Each % step applies to the running balance from the previous
            // step. Rebates (DBK/RODTEP export incentives) are % of the FOB
            // value = Taxable + Expenses, so they run AFTER expenses.
            let lineExpensesAmt = 0;
            for (const e of (ln as any).product_expenses_snapshot || []) {
                lineExpensesAmt +=
                    e.type === 'percent'
                        ? (split.taxable * num(e.value)) / 100
                        : num(e.value);
            }
            const afterExpenses = split.taxable + lineExpensesAmt;
            // Rebate % applies on the post-expense total (FOB value).
            let lineRebatesAmt = 0;
            for (const r of (ln as any).product_rebates_snapshot || []) {
                lineRebatesAmt +=
                    r.type === 'fixed'
                        ? num(r.pct)
                        : (afterExpenses * num(r.pct)) / 100;
            }
            (ln as any).product_rebates_amount = String(round2(lineRebatesAmt));
            (ln as any).product_expenses_amount = String(round2(lineExpensesAmt));

            // Margin % applies on the post-rebate balance.
            const afterRebates = afterExpenses - lineRebatesAmt;
            const lineMarginPct = num((ln as any).margin_pct);
            const lineMarginAmt = afterRebates * (lineMarginPct / 100);
            (ln as any).margin_amount = String(round2(lineMarginAmt));

            // GST: per-line tax_pct is still captured on the line for
            // reference (user enters it in the modal) but is NOT rolled
            // into line_total or doc totals on Quotation. cgst/sgst/igst
            // are forced to zero so legacy readers don't see stale tax.
            const lineNetTotal = afterRebates + lineMarginAmt;
            ln.cgst = '0';
            ln.sgst = '0';
            ln.igst = '0';
            ln.line_total = String(round2(lineNetTotal));
            await this.quotationLineRepository.save(ln);

            subtotal += split.taxable;
            product_rebates_total += lineRebatesAmt;
            product_expenses_total += lineExpensesAmt;
            line_margin_total += lineMarginAmt;
        }

        // Margin is per-line (sum of line.margin_amount above).
        const margin_amount = line_margin_total;

        const er = num(header.exchange_rate) || 1;
        // Home-currency (INR) grand total, rounded to whole rupees. The
        // round_off line carries the ± adjustment; the customer (foreign)
        // total derives from the ROUNDED home total so the doc reconciles.
        // Quotation grand total excludes GST — per-line tax_pct is
        // captured for reference only, not added to the doc total.
        tax_total = 0;
        const grand_inr_raw =
            subtotal +
            product_expenses_total -
            product_rebates_total +
            margin_amount;
        const grand_inr = Math.round(grand_inr_raw);
        const round_off = round2(grand_inr - grand_inr_raw);
        const grand_total = grand_inr * er;

        header.subtotal = String(round2(subtotal));
        // Header expense/rebate columns retained on the entity (DB) but no
        // longer used - write zeros so old readers don't see stale aggregates.
        (header as any).expenses_total = '0';
        (header as any).rebates_total = '0';
        (header as any).product_expenses_total = String(
            round2(product_expenses_total)
        );
        (header as any).product_rebates_total = String(
            round2(product_rebates_total)
        );
        header.margin_amount = String(round2(margin_amount));
        header.tax_total = String(round2(tax_total));
        (header as any).round_off = String(round_off);
        // Round the customer-currency grand total to a whole number so the
        // figure the customer sees/pays is clean (e.g. $80, not $80.44). The
        // rounded total carries forward to the Sales Order + Invoice. The ₹
        // round_off above stays as the home-currency (INR) adjustment.
        header.grand_total = String(Math.round(grand_total));

        await this.quotationRepository.save(header);
    }

    private async lookupCustomerState(
        customerAddressId?: string
    ): Promise<string | undefined> {
        if (!customerAddressId) return undefined;
        const addr = await this.customerAddressRepository.findOne({
            _id: customerAddressId,
        } as any);
        return addr?.state || undefined;
    }

    private async lookupCompanyState(
        companyId: string
    ): Promise<string | undefined> {
        const addresses = await this.companyAddressRepository.findByCompanyId(
            companyId
        );
        if (!addresses?.length) return undefined;
        const corp =
            addresses.find(
                (a) => a.type === 'corporate' && a.is_default
            ) ||
            addresses.find((a) => a.type === 'corporate') ||
            addresses.find((a) => a.is_default) ||
            addresses[0];
        return corp?.state || undefined;
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(rows: QuotationDoc[]): Promise<QuotationGetResponseDto[]> {
        if (!rows.length) return [];

        const customerIds = unique(rows.map((r) => r.customer_id?.toString()));
        const leadIds = unique(
            rows
                .map((r) => r.lead_id?.toString())
                .filter((v): v is string => !!v)
        );
        const rfqIds = unique(
            rows
                .map((r) => (r as any).rfq_id?.toString())
                .filter((v): v is string => !!v)
        );
        const quotationIds = rows.map((r) => r._id.toString());

        // Pre-load lines once so we can collect vendor_ids before the parallel fan-out.
        const allLines = await this.quotationLineRepository.findAll({
            quotation_id: { $in: quotationIds },
        } as any);
        const vendorIds = unique(
            allLines
                .map((l: any) => l.vendor_id?.toString())
                .filter((v: any): v is string => !!v)
        );
        const productIds = unique(
            allLines
                .map((l: any) => l.product_id?.toString())
                .filter((v: any): v is string => !!v)
        );

        const [customers, contacts, leads, vendors, products, rfqs] =
            await Promise.all([
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
                leadIds.length
                    ? this.leadRepository.findAll({
                          _id: { $in: leadIds },
                      } as any)
                    : Promise.resolve([] as any[]),
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
                rfqIds.length
                    ? this.rfqRepository.findAll({
                          _id: { $in: rfqIds },
                          soft_delete: false,
                      } as any)
                    : Promise.resolve([] as any[]),
            ]);

        // Pick the primary contact per customer (or first if no flag set).
        const primaryContactByCustomer = new Map<string, any>();
        for (const c of contacts as any[]) {
            const cid = c.customer_id?.toString();
            if (!cid) continue;
            const existing = primaryContactByCustomer.get(cid);
            if (!existing || (c.is_primary && !existing.is_primary)) {
                primaryContactByCustomer.set(cid, c);
            }
        }

        const customerMap = toMap(customers, '_id');
        const leadMap = toMap(leads, '_id');
        const rfqMap = toMap(rfqs, '_id');
        const vendorMap = toMap(vendors, '_id');
        const productMap = toMap(products, '_id');

        const linesByQ = groupBy(allLines, (l: any) =>
            l.quotation_id.toString()
        );

        return rows.map((r) => {
            const cust = customerMap.get(r.customer_id?.toString());
            const qid = r._id.toString();
            const primary: any = primaryContactByCustomer.get(
                r.customer_id?.toString()
            );
            // Compose a usable country_code (with formatted) for listing display
            // - same shape Customer/Vendor listings use.
            let primaryCC: any = primary?.country_code || null;
            if (!primaryCC && primary?.phone) {
                primaryCC = { dial_code: '+91', phone: primary.phone };
            }
            if (primaryCC && !primaryCC.formatted) {
                const dial = primaryCC.dial_code || primaryCC.dialCode || '';
                const digits = primaryCC.phone || primary?.phone || '';
                if (dial || digits) {
                    primaryCC.formatted = dial && digits
                        ? `${dial} ${digits}`
                        : dial || digits;
                }
            }
            const lead: any = r.lead_id
                ? leadMap.get(r.lead_id.toString())
                : null;
            const rfq: any = (r as any).rfq_id
                ? rfqMap.get((r as any).rfq_id.toString())
                : null;
            const dto: QuotationGetResponseDto = {
                _id: qid,
                voucher_no: r.voucher_no,
                lead_id: r.lead_id?.toString(),
                lead_voucher_no: lead?.voucher_no,
                rfq_id: (r as any).rfq_id?.toString(),
                rfq_voucher_no: rfq?.voucher_no,
                customer_id: r.customer_id?.toString(),
                customer_name: (cust as any)?.company_name,
                customer_contact_name: primary?.name,
                customer_contact_email: primary?.email,
                customer_contact_phone: primary?.phone,
                customer_contact_country_code: primaryCC,
                customer_address_id: r.customer_address_id?.toString(),
                consignee_id: (r as any).consignee_id?.toString(),
                consignee_same_as_buyer:
                    (r as any).consignee_same_as_buyer ?? true,
                consignee_address_id: (r as any).consignee_address_id?.toString(),
                consignee_snapshot: (r as any).consignee_snapshot,
                quotation_date: r.quotation_date,
                valid_until: r.valid_until,
                currency_code: (r as any).currency_code,
                currency_symbol: getCurrencySymbol((r as any).currency_code),
                exchange_rate: r.exchange_rate,
                freight_total: (r as any).freight_total ?? '0',
                payment_terms: r.payment_terms,
                delivery_terms: r.delivery_terms,
                delivery_location: r.delivery_location,
                notes_to_client: r.notes_to_client,
                internal_notes: r.internal_notes,
                subtotal: r.subtotal,
                product_expenses_total: (r as any).product_expenses_total,
                product_rebates_total: (r as any).product_rebates_total,
                skip_product_costing: !!(r as any).skip_product_costing,
                margin_pct: r.margin_pct,
                margin_amount: r.margin_amount,
                tax_total: r.tax_total,
                round_off: r.round_off,
                grand_total: r.grand_total,
                status: r.status,
                version: r.version,
                parent_version_id: r.parent_version_id?.toString(),
                public_token: (r as any).public_token || undefined,
                public_view_count: (r as any).public_view_count || 0,
                public_last_viewed_at: (r as any).public_last_viewed_at,
                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                lines: (linesByQ.get(qid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (l: any): QuotationLineResponseDto => ({
                            _id: l._id?.toString(),
                            product_id: l.product_id?.toString(),
                            product_code: (productMap.get(
                                l.product_id?.toString()
                            ) as any)?.code,
                            product_name: (productMap.get(
                                l.product_id?.toString()
                            ) as any)?.name,
                            // Prefer the per-line value the user entered; fall
                            // back to the product master's part_no.
                            part_no:
                                l.part_no ||
                                (productMap.get(
                                    l.product_id?.toString()
                                ) as any)?.part_no,
                            vendor_id: l.vendor_id?.toString(),
                            vendor_name: (vendorMap.get(
                                l.vendor_id?.toString()
                            ) as any)?.company_name,
                            vendor_code: (vendorMap.get(
                                l.vendor_id?.toString()
                            ) as any)?.vendor_code,
                            price_list_id: l.price_list_id?.toString(),
                            source_rfq_id: l.source_rfq_id?.toString(),
                            source_rfq_voucher_no: l.source_rfq_voucher_no,
                            description: l.description,
                            customer_reference: l.customer_reference,
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
                            product_rebates_snapshot:
                                l.product_rebates_snapshot || [],
                            product_expenses_snapshot:
                                l.product_expenses_snapshot || [],
                            product_rebates_amount: l.product_rebates_amount,
                            product_expenses_amount: l.product_expenses_amount,
                            margin_pct: l.margin_pct,
                            margin_amount: l.margin_amount,
                            seq: l.seq,
                            // Prefer the per-line value; fall back to the
                            // product master's HSN so it always shows even for
                            // legacy lines saved before HSN was persisted.
                            hs_code:
                                l.hs_code ||
                                (productMap.get(
                                    l.product_id?.toString()
                                ) as any)?.hsn_code,
                            net_weight_kg: l.net_weight_kg,
                            gross_weight_kg: l.gross_weight_kg,
                            package_count: l.package_count,
                        }) as any
                    ),
            };
            return dto;
        });
    }

    async mapGet(row: QuotationDoc): Promise<QuotationGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }

    /**
     * Client-facing sanitized projection. Reuses the full hydration from
     * mapGet, then strips every internal costing field and converts the
     * per-line figures to the customer's currency (B1). Never exposes
     * margin / expenses / rebates / internal_notes / exchange rate / INR.
     */
    async mapPublic(row: QuotationDoc): Promise<QuotationPublicResponseDto> {
        const full = await this.mapGet(row);
        const er = num(full.exchange_rate) || 1;

        // ── Billed From (seller) ──
        let company_name: string | undefined;
        let company_email: string | undefined;
        let company_phone: string | undefined;
        let company_iec: string | undefined;
        let company_address: string | undefined;
        let company_gstin: string | undefined;
        let company_pan: string | undefined;
        let company_cin: string | undefined;
        let company_website: string | undefined;
        let company_footer_address: string | undefined;
        let company_logo_url: string | undefined;
        try {
            const company: any = await this.companyService.findOneById(
                row.company_id.toString()
            );
            company_name = company?.company_name;
            company_email = company?.email;
            company_iec = company?.iec;
            company_pan = company?.pan || undefined;
            company_cin = company?.cin || undefined;
            company_website = company?.website || undefined;
            company_footer_address = company?.footer_address || undefined;
            const ccc: any = company?.country_code;
            // Seller is India-based - if no dial code was stored, default to
            // +91 so the number never shows as bare digits.
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
                company_address = [
                    corp.address_line1,
                    corp.address_line2,
                    [corp.city, corp.state, corp.postcode]
                        .filter(Boolean)
                        .join(', '),
                    corp.country,
                ]
                    .filter(Boolean)
                    .join('\n');
            }
            company_gstin =
                (corp as any)?.gstin || company?.tax_number || undefined;
        } catch {
            // leave seller fields undefined - the header degrades gracefully
        }

        // Letterhead logo — from company-settings (same source as the PDF).
        try {
            const settingsRows: any[] =
                await this.companySettingsRepository.findAll({
                    company_id: row.company_id.toString(),
                } as any);
            const setting =
                (settingsRows || []).find((r) => !r.location_id) ||
                (settingsRows || [])[0];
            company_logo_url = setting?.logo_url || undefined;
        } catch {
            company_logo_url = undefined;
        }

        // Resolve the bill-to address for the document header.
        let customer_address: string | undefined;
        if (row.customer_address_id) {
            try {
                const addr: any = await this.customerAddressRepository.findOne({
                    _id: row.customer_address_id.toString(),
                } as any);
                if (addr) {
                    customer_address = [
                        addr.address_line1,
                        addr.address_line2,
                        [addr.city, addr.state, addr.postcode]
                            .filter(Boolean)
                            .join(', '),
                        addr.country,
                    ]
                        .filter(Boolean)
                        .join('\n');
                }
            } catch {
                customer_address = undefined;
            }
        }

        // Resolve the ship-to (consignee) for the document header. When the
        // consignee is the same party as the buyer, it mirrors the bill-to;
        // otherwise it uses the frozen consignee snapshot (falling back to the
        // linked consignee address if the snapshot has no address lines).
        const consignee_same_as_buyer = (row as any).consignee_same_as_buyer !== false;
        let consignee_name: string | undefined;
        let consignee_address: string | undefined;
        if (consignee_same_as_buyer) {
            consignee_name = full.customer_name;
            consignee_address = customer_address;
        } else {
            const snap: any = (row as any).consignee_snapshot || {};
            consignee_name = snap.name || full.customer_name;
            const snapAddress = [
                snap.address_line1,
                snap.address_line2,
                [snap.city, snap.state, snap.postcode].filter(Boolean).join(', '),
                snap.country,
            ]
                .filter(Boolean)
                .join('\n');
            consignee_address = snapAddress || undefined;
            if (!consignee_address && (row as any).consignee_address_id) {
                try {
                    const addr: any =
                        await this.customerAddressRepository.findOne({
                            _id: (row as any).consignee_address_id.toString(),
                        } as any);
                    if (addr) {
                        consignee_address = [
                            addr.address_line1,
                            addr.address_line2,
                            [addr.city, addr.state, addr.postcode]
                                .filter(Boolean)
                                .join(', '),
                            addr.country,
                        ]
                            .filter(Boolean)
                            .join('\n');
                    }
                } catch {
                    consignee_address = undefined;
                }
            }
        }

        // Contact phone - prefer the rich formatted form, else compose it.
        const cc: any = full.customer_contact_country_code;
        const customer_phone =
            cc?.formatted ||
            (cc?.dial_code && full.customer_contact_phone
                ? `${cc.dial_code} ${full.customer_contact_phone}`
                : full.customer_contact_phone) ||
            undefined;

        // ── Lines (per spec p.24 costing formula) ─────────────────────────
        //   Net Total (INR) = (Price + Expenses − Rebates) + Margin
        //   Net (cust)      = Net Total × Exchange Rate
        //   GST (cust)      = Net (cust) × tax_pct / 100   ← applied AFTER FX
        //   Line Total      = Net (cust) + GST (cust)
        let subtotal = 0;
        let gst_total = 0;
        let grand_total_calc = 0;
        const lines = (full.lines || []).map((l) => {
            const qty = num(l.qty);
            const netInr =
                num(l.taxable) +
                num(l.product_expenses_amount) -
                num(l.product_rebates_amount) +
                num(l.margin_amount);
            const netCust = round2(netInr * er);
            // GST is NOT applied to Quotation totals — per-line tax_pct
            // is captured for reference only.
            const gstCust = 0;
            const lineTotal = round2(netCust);
            const rate = qty > 0 ? round2(lineTotal / qty) : 0;
            subtotal += netCust;
            gst_total += gstCust;
            grand_total_calc += lineTotal;
            return {
                product_name: l.product_name,
                part_no: (l as any).part_no,
                hs_code: l.hs_code,
                description: l.description,
                qty: l.qty,
                unit: l.unit,
                unit_price: String(rate),
                discount_pct: l.discount_pct,
                tax_pct: l.tax_pct,
                gst_amount: String(gstCust),
                line_total: String(lineTotal),
            };
        });

        const today = new Date().toISOString().slice(0, 10);
        return {
            voucher_no: full.voucher_no,
            quotation_date: full.quotation_date,
            valid_until: full.valid_until,
            is_expired: !!full.valid_until && full.valid_until < today,
            status: full.status,
            currency_code: full.currency_code,
            currency_symbol: full.currency_symbol,
            company_name,
            company_email,
            company_phone,
            company_iec,
            company_address,
            company_gstin,
            company_pan,
            company_cin,
            company_website,
            company_footer_address,
            company_logo_url,
            customer_name: full.customer_name,
            customer_contact_name: full.customer_contact_name,
            customer_email: full.customer_contact_email,
            customer_phone,
            customer_address,
            consignee_name,
            consignee_address,
            consignee_same_as_buyer,
            payment_terms: full.payment_terms,
            delivery_terms: full.delivery_terms,
            delivery_location: full.delivery_location,
            notes_to_client: full.notes_to_client,
            lines,
            subtotal: String(round2(subtotal)),
            gst_total: String(round2(gst_total)),
            // Whole-number customer-currency total (matches the persisted,
            // rounded header grand_total shown across the doc chain).
            grand_total: String(Math.round(grand_total_calc)),
        };
    }

    // ── Client-facing PDF — mirrors the Sales Order PDF layout (letterhead,
    // seller/buyer grid, line table, grand total, signatory, page footer). ──
    async generatePdf(
        id: string
    ): Promise<{ buffer: Buffer; filename: string }> {
        const row = await this.findOneById(id);
        const data = await this.mapPublic(row);
        const full = await this.mapGet(row);

        // Seller GSTIN + authorised signatory — same hydration as the SO PDF.
        const companyId = (row as any).company_id?.toString();
        let companyGstin = '';
        let signatory = '';
        let footerAddress = '';
        // Footer identity line — GSTIN · PAN · CIN · IEC · website.
        let footerIdLine = '';
        // Company logo for the shared letterhead — from company-settings
        // (falls back to the bundled brand logo when none is set).
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
        try {
            const company: any =
                await this.companyService.findOneById(companyId);
            signatory = company?.authorised_signatory_name || '';
            footerAddress = company?.footer_address || '';
            const addresses =
                await this.companyAddressRepository.findByCompanyId(companyId);
            const corp: any =
                (addresses || []).find(
                    (a: any) => a.type === 'corporate' && a.is_default
                ) ||
                (addresses || []).find((a: any) => a.type === 'corporate') ||
                (addresses || []).find((a: any) => a.is_default) ||
                (addresses || [])[0];
            companyGstin = corp?.gstin || company?.tax_number || '';
            footerIdLine = [
                companyGstin ? `GSTIN: ${companyGstin}` : '',
                company?.pan ? `PAN: ${company.pan}` : '',
                company?.cin ? `CIN: ${company.cin}` : '',
                company?.iec ? `IEC: ${company.iec}` : '',
                company?.website || '',
            ]
                .filter(Boolean)
                .join('  ·  ');
        } catch {
            // graceful — degrades to a name-only seller block
        }

        const sourceVoucher = full.rfq_voucher_no || full.lead_voucher_no || '';
        const sourceLabel = full.rfq_voucher_no
            ? 'Source RFQ'
            : full.lead_voucher_no
              ? 'Source Lead'
              : '';

        const html = this.renderQuotationHtml(data, {
            companyGstin,
            signatory,
            sourceVoucher,
            sourceLabel,
            logoDataUri,
        });
        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
            margin: { top: '18mm', right: '12mm', bottom: '18mm', left: '12mm' },
            displayHeaderFooter: true,
            headerTemplate: buildPdfHeaderTemplate({
                companyName: data.company_name,
                docLabel: 'QUOTATION',
                voucherNo: data.voucher_no,
            }),
            footerTemplate: buildPdfFooterTemplate({
                voucherNo: data.voucher_no,
                addressLine: footerAddress,
                idLine: footerIdLine,
            }),
        });
        const safe = (data.voucher_no || id)
            .replace(/[\\/]+/g, '_')
            .replace(/[^A-Za-z0-9_\-.]/g, '');
        return { buffer, filename: `${safe}.pdf` };
    }

    private esc(s: any): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private renderQuotationHtml(
        q: QuotationPublicResponseDto,
        extras: {
            companyGstin?: string;
            signatory?: string;
            sourceVoucher?: string;
            sourceLabel?: string;
            logoDataUri?: string;
        }
    ): string {
        const sym = q.currency_symbol || q.currency_code || '₹';
        const fmtNum = (v: any) => {
            const n = Number(v);
            return isFinite(n)
                ? n.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                  })
                : this.esc(v);
        };
        const money = (v: any) =>
            v === null || v === undefined || v === ''
                ? '-'
                : `${sym}${fmtNum(v)}`;
        // DD-MM-YYYY, same as every other printed document. Was the raw ISO
        // slice, so the Quotation printed "2026-07-14" while the Sales Order and
        // Vendor PO printed something else entirely.
        const dateOnly = (iso?: string) => (iso ? this.esc(docDate(iso)) : '-');
        const preLine = (s: string) => this.esc(s).replace(/\n/g, '<br/>');

        const rows = (q.lines || []).length
            ? (q.lines || [])
                  .map(
                      (l, i) => `<tr>
          <td class="muted">${i + 1}</td>
          <td>
            <div class="fw">${this.esc(l.product_name || '-')}</div>
            ${l.hs_code ? `<div class="muted">HSN: ${this.esc(l.hs_code)}</div>` : ''}
            ${l.description ? `<div class="muted">${this.esc(l.description)}</div>` : ''}
          </td>
          <td>${this.esc(l.part_no || '-')}</td>
          <td class="num">${l.qty ? fmtNum(l.qty) : '-'}</td>
          <td>${this.esc(l.unit || '-')}</td>
          <td class="num">${money(l.unit_price)}</td>
          <td class="num fw">${money(l.line_total)}</td>
        </tr>`
                  )
                  .join('')
            : `<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">No line items.</td></tr>`;

        const detailLines = [
            q.valid_until
                ? `<div class="party-line"><span class="party-muted">Valid Until:</span> ${dateOnly(q.valid_until)}</div>`
                : '',
            q.payment_terms
                ? `<div class="party-line"><span class="party-muted">Payment:</span> ${this.esc(q.payment_terms)}</div>`
                : '',
            q.delivery_terms
                ? `<div class="party-line"><span class="party-muted">Delivery:</span> ${this.esc(q.delivery_terms)}</div>`
                : '',
        ].join('');

        // Ship-to (consignee) block — mirrors the buyer when same-as-buyer.
        // Falls back to the free-text delivery location when no structured
        // consignee address is present.
        const shipToLines = [
            q.consignee_name
                ? `<div class="party-name">${this.esc(q.consignee_name)}</div>`
                : '',
            q.consignee_address
                ? `<div class="party-line" style="white-space:pre-line">${preLine(q.consignee_address)}</div>`
                : '',
            !q.consignee_address && q.delivery_location
                ? `<div class="party-line">${this.esc(q.delivery_location)}</div>`
                : '',
        ]
            .filter(Boolean)
            .join('');

        // Shared letterhead — logo + company identity (from the company
        // profile) on the left, document meta on the right. Reused across
        // sales-doc PDFs via @common/pdf/pdf-letterhead.util.
        const letterhead = buildPdfLetterhead(
            {
                logoDataUri: extras.logoDataUri,
                name: q.company_name,
                // Address + tax IDs (GSTIN/PAN/CIN/IEC) + website now print
                // in the PDF footer, so the header stays to logo + name +
                // phone + email only.
                phone: q.company_phone,
                email: q.company_email,
            },
            {
                title: 'Quotation',
                voucherNo: q.voucher_no || '-',
                metaLines: [
                    `Date: ${dateOnly(q.quotation_date)} · Currency: ${this.esc(sym)} ${this.esc(q.currency_code || '-')}`,
                    extras.sourceVoucher
                        ? `${this.esc(extras.sourceLabel || 'Source')}: ${this.esc(extras.sourceVoucher)}`
                        : '',
                ].filter(Boolean),
                statusBadge: q.status || '',
            }
        );

        // Layout / CSS reuse the Sales Order PDF (po-pdf.service) so all
        // sales-doc PDFs share one professional letterhead format.
        return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${this.esc(q.voucher_no || 'Quotation')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10.5px; color: #1f2937; margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc { width: 100%; }
  .qd-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 14px; margin-bottom: 18px; }
  .qd-title { font-size: 16px; font-weight: 600; letter-spacing: 2px; margin: 0; color: #1f2937; text-transform: uppercase; }
  .voucher { color: #6b7280; font-size: 10px; margin-top: 2px; }
  .status-badge { display: inline-block; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; padding: 2px 9px; border-radius: 999px; font-size: 9px; font-weight: 600; text-transform: capitalize; letter-spacing: 0.2px; margin-top: 5px; }
  .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 18px; }
  .party-grid-3 { grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
  .label { text-transform: uppercase; color: #6b7280; font-weight: 600; font-size: 8.5px; letter-spacing: 0.6px; margin-bottom: 5px; }
  .party-name { font-weight: 600; color: #1f2937; margin-bottom: 3px; font-size: 10.5px; }
  .party-line { font-size: 9.8px; color: #4b5563; line-height: 1.5; }
  .muted, .party-muted { color: #6b7280; }
  .fw { font-weight: 600; color: #1f2937; }
  table.items { width: 100%; border-collapse: collapse; margin: 6px 0 0; }
  table.items thead th { background: #f9fafb; color: #4b5563; font-weight: 600; font-size: 8.5px; letter-spacing: 0.3px; text-transform: uppercase; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 8px 7px; text-align: left; }
  table.items td { border-bottom: 1px solid #f1f2f4; padding: 8px 7px; font-size: 10px; vertical-align: top; page-break-inside: avoid; }
  table.items tbody tr:last-child td { border-bottom: 1px solid #e5e7eb; }
  table.items th.num, table.items td.num { text-align: right; }
  .totals { width: 280px; margin-left: auto; margin-top: 14px; margin-bottom: 4px; }
  .totals .row-grand { display: flex; justify-content: space-between; padding: 10px 0 4px; border-top: 2px solid #1f2937; font-weight: 700; font-size: 12px; color: #1f2937; }
  .section { margin-top: 14px; }
  .section .body { font-size: 10px; color: #4b5563; line-height: 1.55; white-space: pre-line; }
  .signature { margin-top: 26px; display: flex; justify-content: flex-end; font-size: 9.5px; }
  .signature .box { width: 200px; border-top: 1px solid #9ca3af; padding-top: 4px; text-align: center; color: #6b7280; }
</style></head>
<body>
<div class="doc">
  ${letterhead}

  <div class="party-grid party-grid-3">
    <div>
      <div class="label">Bill To</div>
      <div class="party-name">${this.esc(q.customer_name || '-')}</div>
      ${q.customer_contact_name ? `<div class="party-line">${this.esc(q.customer_contact_name)}</div>` : ''}
      ${q.customer_address ? `<div class="party-line" style="white-space:pre-line">${preLine(q.customer_address)}</div>` : ''}
      ${q.customer_phone ? `<div class="party-line">${this.esc(q.customer_phone)}</div>` : ''}
      ${q.customer_email ? `<div class="party-line">${this.esc(q.customer_email)}</div>` : ''}
    </div>
    <div>
      <div class="label">Ship To${q.consignee_same_as_buyer ? ' <span class="party-muted" style="text-transform:none;font-weight:400">(same as bill to)</span>' : ''}</div>
      ${shipToLines || `<div class="party-line muted">-</div>`}
    </div>
    <div>
      <div class="label">Details</div>
      ${detailLines || `<div class="party-line muted">-</div>`}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:24px">#</th>
        <th>Product</th>
        <th style="width:80px">Part No</th>
        <th class="num" style="width:55px">Qty</th>
        <th style="width:46px">Unit</th>
        <th class="num" style="width:80px">Rate</th>
        <th class="num" style="width:95px">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row-grand"><span>Grand Total</span><span>${money(q.grand_total)}</span></div>
  </div>

  ${q.notes_to_client ? `<div class="section"><div class="label">Notes</div><div class="body">${this.esc(q.notes_to_client)}</div></div>` : ''}

  <div class="signature">
    <div class="box">
      For ${this.esc(q.company_name || '')}
      <div style="height:30px"></div>
      ${extras.signatory ? `<div class="fw" style="color:#1f2937;margin-bottom:2px">${this.esc(extras.signatory)}</div>` : ''}
      <span style="color:#9ca3af">Authorised Signatory</span>
    </div>
  </div>
</div>
</body></html>`;
    }

    // ── Listing filter helper ────────────────────────────────────────────
    //
    // Single source of truth for the `find` object used by BOTH the
    // `/list` endpoint and the `/stats` endpoint. Keeps tile counts and
    // table rows from drifting (Docs/VOUCHER_STATS_PLAN.md §7).
    buildListFind(
        companyId: string,
        filters: {
            customer_id?: string;
            lead_id?: string;
            status?: string | string[];
            date_from?: string;
            date_to?: string;
            search?: string;
        }
    ): Record<string, any> {
        const find: any = { company_id: companyId, soft_delete: false };
        if (filters.customer_id) find.customer_id = filters.customer_id;
        if (filters.lead_id) find.lead_id = filters.lead_id;
        if (filters.status) find.status = filters.status;
        if (filters.date_from && filters.date_to) {
            find.quotation_date = {
                $gte: filters.date_from,
                $lte: filters.date_to,
            };
        } else if (filters.date_from) {
            find.quotation_date = { $gte: filters.date_from };
        } else if (filters.date_to) {
            find.quotation_date = { $lte: filters.date_to };
        }
        const searchTerm =
            typeof filters.search === 'string' ? filters.search.trim() : '';
        if (searchTerm) {
            find.$or = [
                { voucher_no: { $regex: searchTerm, $options: 'i' } },
                { notes_to_client: { $regex: searchTerm, $options: 'i' } },
            ];
        }
        return find;
    }

    // ── KPI stats for the quotation listing tile strip ───────────────────
    //
    // Counts per status + SUM(grand_total / exchange_rate) for the SAME
    // filtered set, converted to INR. `exchange_rate` is stored as
    // "1 INR = X foreign-currency-units" (see quotation.service line 561),
    // so dividing the foreign grand_total by the rate gives the INR value.
    // For INR quotations rate=1 → division is a no-op.
    //
    // The money sum EXCLUDES rejected rows — "Total Value" represents
    // money still in play, not lost-deal money. Per-status counts still
    // include rejected (so the Rejected tile shows the right count).
    // One indexed GROUP BY — sub-ms at our row counts.
    async stats(
        companyId: string,
        filters: {
            customer_id?: string;
            lead_id?: string;
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
    }> {
        // The find object isn't used by aggregate directly, but building
        // it makes sure the helper covers every filter the BE list
        // endpoint accepts before we mirror them in the query builder.
        this.buildListFind(companyId, filters);

        const rows = await this.quotationRepository.aggregate<{
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
            if (filters.lead_id) {
                qb.andWhere('entity.lead_id = :lid', { lid: filters.lead_id });
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
                qb.andWhere('entity.quotation_date >= :df', {
                    df: filters.date_from,
                });
            }
            if (filters.date_to) {
                qb.andWhere('entity.quotation_date <= :dt', {
                    dt: filters.date_to,
                });
            }
            const searchTerm =
                typeof filters.search === 'string'
                    ? filters.search.trim()
                    : '';
            if (searchTerm) {
                qb.andWhere(
                    '(entity.voucher_no ILIKE :q OR entity.notes_to_client ILIKE :q)',
                    { q: `%${searchTerm}%` }
                );
            }
            return qb
                .select('entity.status', 'status')
                .addSelect('COUNT(*)::int', 'count')
                .addSelect(
                    `COALESCE(SUM(
                        CASE
                            WHEN entity.status = '${ENUM_QUOTATION_STATUS.REJECTED}' THEN 0
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

function toMap<T extends { _id: any }>(
    arr: T[],
    key: keyof T = '_id' as keyof T
): Map<string, T> {
    const m = new Map<string, T>();
    for (const item of arr) {
        const k = (item[key] as any)?.toString();
        if (k) m.set(k, item);
    }
    return m;
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const item of arr) {
        const k = keyFn(item);
        const list = m.get(k) || [];
        list.push(item);
        m.set(k, list);
    }
    return m;
}
