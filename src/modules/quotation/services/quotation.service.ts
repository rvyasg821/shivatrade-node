import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationLineRepository } from '../repository/repositories/quotation-line.repository';
import { QuotationDoc } from '../repository/entities/quotation.entity';
import { QuotationCreateRequestDto } from '../dtos/request/quotation.create.request.dto';
import { QuotationUpdateRequestDto } from '../dtos/request/quotation.update.request.dto';
import {
    QuotationGetResponseDto,
    QuotationLineResponseDto,
} from '../dtos/response/quotation.get.response.dto';
import { ENUM_QUOTATION_STATUS } from '../enums/quotation.enum';

import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { LeadService } from '@modules/lead/services/lead.service';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';

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
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        customerId: string,
        currencyId: string,
        leadId?: string,
        customerAddressId?: string
    ): Promise<void> {
        const customer = await this.customerRepository.findOne({
            _id: customerId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!customer) throw new BadRequestException('Customer not found');

        const currency = await this.currencyRepository.findOne({
            _id: currencyId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!currency) throw new BadRequestException('Currency not found');

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
                // Don't hard-fail — common case is the address belongs to a
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
        // company_name, contact, address — enough to materialise a Customer
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
        // provide one. Common when arriving from a lead — backend just
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
            data.currency_id,
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
            customer_id: data.customer_id,
            customer_address_id: data.customer_address_id || null,
            quotation_date: data.quotation_date,
            valid_until: data.valid_until || null,
            currency_id: data.currency_id,
            exchange_rate: data.exchange_rate || '1',
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
            data.margin_pct || '0'
        );

        await this.recompute(header._id.toString(), companyId);

        this.logger.log(
            `Quotation created: ${header._id} (${voucher_no})`
        );
        return this.quotationRepository.findOneById(header._id.toString());
    }

    async findOneById(id: string): Promise<QuotationDoc> {
        const row = await this.quotationRepository.findOneById(id);
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
        // row as unlocked — the transition matrix below still validates
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
            data.currency_id || row.currency_id.toString(),
            data.lead_id ?? row.lead_id?.toString(),
            data.customer_address_id ?? row.customer_address_id?.toString()
        );
        if ((refsOut as any)?.addressMismatched) {
            // Stale/mismatched address — null it on the row so the user can
            // pick a fresh one without the save being blocked.
            (data as any).customer_address_id = null;
        }

        const wasApproved = row.status === ENUM_QUOTATION_STATUS.APPROVED;
        const wasSent = row.status === ENUM_QUOTATION_STATUS.SENT;

        // Apply scalar updates (skip nested arrays — replaced separately).
        const { lines, ...scalar } = data as any;
        Object.assign(row, scalar);
        await this.quotationRepository.save(row);

        if (Array.isArray(lines)) {
            await this.replaceLines(
                companyId,
                row._id.toString(),
                lines,
                (data.margin_pct ?? row.margin_pct) || '0'
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
        row.soft_delete = true;
        await this.quotationRepository.save(row);
        this.logger.log(`Quotation soft-deleted: ${row._id}`);
    }

    // ─── Replace-on-update for nested arrays ────────────────────────────

    private async replaceLines(
        companyId: string,
        quotationId: string,
        lines?: any[],
        defaultMarginPct: string = '0'
    ): Promise<void> {
        await this.quotationLineRepository.deleteByQuotationId(quotationId);
        if (!lines?.length) return;

        // Pre-load product master rebate/expense links for ALL products
        // referenced by these lines, in two queries — avoids N+1.
        const productIds = Array.from(
            new Set(
                lines.map((l) => l.product_id).filter((id): id is string => !!id)
            )
        );
        const [pRebateLinks, pExpenseLinks] = await Promise.all([
            productIds.length
                ? this.productRebateRepository.findAll({
                      product_id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
            productIds.length
                ? this.productExpenseRepository.findAll({
                      product_id: { $in: productIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const rebateMasterIds = unique(
            pRebateLinks.map((l: any) => l.rebate_id?.toString())
        );
        const expenseMasterIds = unique(
            pExpenseLinks.map((l: any) => l.expense_id?.toString())
        );
        const [rebateMasters, expenseMasters] = await Promise.all([
            rebateMasterIds.length
                ? this.rebateRepository.findAll({
                      _id: { $in: rebateMasterIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as any[]),
            expenseMasterIds.length
                ? this.expenseRepository.findAll({
                      _id: { $in: expenseMasterIds },
                      is_active: true,
                      soft_delete: false,
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const rebMap = new Map(
            rebateMasters.map((m: any) => [m._id.toString(), m])
        );
        const expMap = new Map(
            expenseMasters.map((m: any) => [m._id.toString(), m])
        );
        const rebatesByProduct = new Map<string, any[]>();
        for (const l of pRebateLinks as any[]) {
            const m: any = rebMap.get(l.rebate_id?.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            const arr = rebatesByProduct.get(pid) || [];
            arr.push({
                rebate_id: l.rebate_id.toString(),
                code: m.code,
                name: m.name,
                pct: l.pct != null ? String(l.pct) : String(m.pct),
            });
            rebatesByProduct.set(pid, arr);
        }
        const expensesByProduct = new Map<string, any[]>();
        for (const l of pExpenseLinks as any[]) {
            const m: any = expMap.get(l.expense_id?.toString());
            if (!m) continue;
            const pid = l.product_id.toString();
            const arr = expensesByProduct.get(pid) || [];
            arr.push({
                expense_id: l.expense_id.toString(),
                code: m.code,
                name: m.name,
                type: m.type,
                value: l.value != null ? String(l.value) : String(m.value),
            });
            expensesByProduct.set(pid, arr);
        }

        let seq = 0;
        for (const l of lines) {
            seq += 1;
            const pid = l.product_id;
            await this.quotationLineRepository.create({
                company_id: companyId,
                quotation_id: quotationId,
                product_id: pid,
                vendor_id: l.vendor_id || null,
                description: l.description || null,
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
                product_rebates_snapshot: rebatesByProduct.get(pid) || [],
                product_expenses_snapshot: expensesByProduct.get(pid) || [],
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
            const out = computeLineTax({
                qty: num(ln.qty),
                unit_price: num(ln.unit_price),
                discount_pct: num(ln.discount_pct),
                tax_pct: num(ln.tax_pct),
                customer_state: customerState,
                company_state: companyState,
            });

            ln.taxable = String(out.taxable);
            ln.cgst = String(out.cgst);
            ln.sgst = String(out.sgst);
            ln.igst = String(out.igst);
            ln.line_total = String(out.line_total);

            // Per-line product rebates: each entry is (taxable × pct/100).
            let lineRebatesAmt = 0;
            for (const r of (ln as any).product_rebates_snapshot || []) {
                lineRebatesAmt += (out.taxable * num(r.pct)) / 100;
            }
            // Per-line product expenses: percent → taxable × value/100;
            // amount → flat value applied once per line.
            let lineExpensesAmt = 0;
            for (const e of (ln as any).product_expenses_snapshot || []) {
                lineExpensesAmt +=
                    e.type === 'percent'
                        ? (out.taxable * num(e.value)) / 100
                        : num(e.value);
            }
            (ln as any).product_rebates_amount = String(round2(lineRebatesAmt));
            (ln as any).product_expenses_amount = String(round2(lineExpensesAmt));

            // Per-line margin: applied to the line's net-of-rebates base.
            const lineMarginPct = num((ln as any).margin_pct);
            const lineMarginBase = out.taxable + lineExpensesAmt - lineRebatesAmt;
            const lineMarginAmt = lineMarginBase * (lineMarginPct / 100);
            (ln as any).margin_amount = String(round2(lineMarginAmt));
            await this.quotationLineRepository.save(ln);

            subtotal += out.taxable;
            tax_total += out.total_tax;
            product_rebates_total += lineRebatesAmt;
            product_expenses_total += lineExpensesAmt;
            line_margin_total += lineMarginAmt;
        }

        // Margin is per-line (sum of line.margin_amount above).
        const margin_amount = line_margin_total;

        const er = num(header.exchange_rate) || 1;
        const grand_total =
            (subtotal +
                product_expenses_total -
                product_rebates_total +
                margin_amount +
                tax_total) *
            er;

        header.subtotal = String(round2(subtotal));
        // Header expense/rebate columns retained on the entity (DB) but no
        // longer used — write zeros so old readers don't see stale aggregates.
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
        header.grand_total = String(round2(grand_total));

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
        const currencyIds = unique(rows.map((r) => r.currency_id?.toString()));
        const leadIds = unique(
            rows
                .map((r) => r.lead_id?.toString())
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

        const [customers, contacts, currencies, leads, vendors] =
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
                currencyIds.length
                    ? this.currencyRepository.findAll({
                          _id: { $in: currencyIds },
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
        const currencyMap = toMap(currencies, '_id');
        const leadMap = toMap(leads, '_id');
        const vendorMap = toMap(vendors, '_id');

        const linesByQ = groupBy(allLines, (l: any) =>
            l.quotation_id.toString()
        );

        return rows.map((r) => {
            const cust = customerMap.get(r.customer_id?.toString());
            const cur = currencyMap.get(r.currency_id?.toString());
            const qid = r._id.toString();
            const primary: any = primaryContactByCustomer.get(
                r.customer_id?.toString()
            );
            // Compose a usable country_code (with formatted) for listing display
            // — same shape Customer/Vendor listings use.
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
            const dto: QuotationGetResponseDto = {
                _id: qid,
                voucher_no: r.voucher_no,
                lead_id: r.lead_id?.toString(),
                customer_id: r.customer_id?.toString(),
                customer_name: (cust as any)?.company_name,
                customer_contact_name: primary?.name,
                customer_contact_email: primary?.email,
                customer_contact_phone: primary?.phone,
                customer_contact_country_code: primaryCC,
                customer_address_id: r.customer_address_id?.toString(),
                quotation_date: r.quotation_date,
                valid_until: r.valid_until,
                currency_id: r.currency_id?.toString(),
                currency_code: (cur as any)?.code,
                currency_symbol: (cur as any)?.symbol,
                exchange_rate: r.exchange_rate,
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
                grand_total: r.grand_total,
                status: r.status,
                version: r.version,
                parent_version_id: r.parent_version_id?.toString(),
                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                lines: (linesByQ.get(qid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (l: any): QuotationLineResponseDto => ({
                            _id: l._id?.toString(),
                            product_id: l.product_id?.toString(),
                            vendor_id: l.vendor_id?.toString(),
                            vendor_name: (vendorMap.get(
                                l.vendor_id?.toString()
                            ) as any)?.company_name,
                            description: l.description,
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
                        })
                    ),
            };
            return dto;
        });
    }

    async mapGet(row: QuotationDoc): Promise<QuotationGetResponseDto> {
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
