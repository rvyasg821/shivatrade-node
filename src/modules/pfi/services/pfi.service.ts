import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PfiRepository } from '../repository/repositories/pfi.repository';
import { PfiLineRepository } from '../repository/repositories/pfi-line.repository';
import { PfiExpenseRepository } from '../repository/repositories/pfi-expense.repository';
import { PfiRebateRepository } from '../repository/repositories/pfi-rebate.repository';
import { PfiDoc } from '../repository/entities/pfi.entity';
import { PfiCreateRequestDto } from '../dtos/request/pfi.create.request.dto';
import { PfiUpdateRequestDto } from '../dtos/request/pfi.update.request.dto';
import {
    PfiGetResponseDto,
    PfiLineResponseDto,
    PfiExpenseResponseDto,
    PfiRebateResponseDto,
} from '../dtos/response/pfi.get.response.dto';
import { ENUM_PFI_STATUS } from '../enums/pfi.enum';

import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';

import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { QuotationExpenseRepository } from '@modules/quotation/repository/repositories/quotation-expense.repository';
import { QuotationRebateRepository } from '@modules/quotation/repository/repositories/quotation-rebate.repository';
import { LeadService } from '@modules/lead/services/lead.service';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';

const num = (v: any): number =>
    v === null || v === undefined || v === '' ? 0 : Number(v);
const round2 = (n: number): number =>
    !isFinite(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PfiService {
    private readonly logger = new Logger(PfiService.name);

    constructor(
        private readonly pfiRepository: PfiRepository,
        private readonly pfiLineRepository: PfiLineRepository,
        private readonly pfiExpenseRepository: PfiExpenseRepository,
        private readonly pfiRebateRepository: PfiRebateRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly quotationExpenseRepository: QuotationExpenseRepository,
        private readonly quotationRebateRepository: QuotationRebateRepository,
        private readonly leadService: LeadService,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        customerId: string,
        currencyId: string,
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

        if (customerAddressId) {
            const addr = await this.customerAddressRepository.findOne({
                _id: customerAddressId,
                customer_id: customerId,
                soft_delete: false,
            } as any);
            if (!addr) {
                return { addressMismatched: true } as any;
            }
        }
        return undefined as any;
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

    // ─── Public CRUD ────────────────────────────────────────────────────

    async create(
        companyId: string,
        data: PfiCreateRequestDto,
        createdBy: string
    ): Promise<PfiDoc> {
        const refsOut = await this.assertReferences(
            companyId,
            data.customer_id,
            data.currency_id,
            data.customer_address_id
        );
        if ((refsOut as any)?.addressMismatched) {
            (data as any).customer_address_id = undefined;
        }

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucher_no = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.PFI,
            prefix
        );

        const header = await this.pfiRepository.create({
            company_id: companyId,
            created_by: createdBy,
            voucher_no,
            quotation_id: data.quotation_id || null,
            lead_id: data.lead_id || null,
            customer_id: data.customer_id,
            customer_address_id: data.customer_address_id || null,
            pfi_date: data.pfi_date,
            valid_until: data.valid_until || null,
            currency_id: data.currency_id,
            exchange_rate: data.exchange_rate || '1',
            payment_terms: data.payment_terms || null,
            delivery_terms: data.delivery_terms || null,
            delivery_location: data.delivery_location || null,
            notes_to_client: data.notes_to_client || null,
            internal_notes: data.internal_notes || null,
            margin_pct: data.margin_pct || '0',
            status: data.status || ENUM_PFI_STATUS.DRAFT,
            version: 1,
        } as any);

        await this.replaceLines(
            companyId,
            header._id.toString(),
            data.lines,
            data.margin_pct || '0'
        );
        await this.replaceExpenses(
            companyId,
            header._id.toString(),
            data.expenses
        );
        await this.replaceRebates(
            companyId,
            header._id.toString(),
            data.rebates
        );

        await this.recompute(header._id.toString(), companyId);

        this.logger.log(`PFI created: ${header._id} (${voucher_no})`);
        return this.pfiRepository.findOneById(header._id.toString());
    }

    async findOneById(id: string): Promise<PfiDoc> {
        const row = await this.pfiRepository.findOneById(id);
        if (!row) throw new NotFoundException('PFI not found');
        return row;
    }

    async update(row: PfiDoc, data: PfiUpdateRequestDto): Promise<PfiDoc> {
        const companyId = row.company_id.toString();

        // Status lock — only DRAFT is fully editable.
        // Same revert-and-edit allowance as Quotation — payload setting
        // status=DRAFT lifts the lock for this update.
        const willBeDraft = data.status === ENUM_PFI_STATUS.DRAFT;
        const isLocked =
            row.status !== ENUM_PFI_STATUS.DRAFT && !willBeDraft;
        const isStatusOnlyChange = (() => {
            if (!isLocked) return true;
            const allowedKeys = new Set(['status', 'internal_notes']);
            return Object.keys(data || {}).every((k) =>
                allowedKeys.has(k) || (data as any)[k] === undefined
            );
        })();
        if (isLocked && !isStatusOnlyChange) {
            throw new BadRequestException(
                `PFI is ${row.status}. Revert to draft to edit fields.`
            );
        }
        if (data.status && data.status !== row.status) {
            this.assertStatusTransitionAllowed(row.status, data.status);
        }

        const refsOut = await this.assertReferences(
            companyId,
            data.customer_id || row.customer_id.toString(),
            data.currency_id || row.currency_id.toString(),
            data.customer_address_id ?? row.customer_address_id?.toString()
        );
        if ((refsOut as any)?.addressMismatched) {
            (data as any).customer_address_id = null;
        }

        const wasApproved = row.status === ENUM_PFI_STATUS.APPROVED;
        const wasSent = row.status === ENUM_PFI_STATUS.SENT;

        const { lines, expenses, rebates, ...scalar } = data as any;
        Object.assign(row, scalar);
        await this.pfiRepository.save(row);

        if (Array.isArray(lines)) {
            await this.replaceLines(
                companyId,
                row._id.toString(),
                lines,
                (data.margin_pct ?? row.margin_pct) || '0'
            );
        }
        if (Array.isArray(expenses)) {
            await this.replaceExpenses(companyId, row._id.toString(), expenses);
        }
        if (Array.isArray(rebates)) {
            await this.replaceRebates(companyId, row._id.toString(), rebates);
        }

        await this.recompute(row._id.toString(), companyId);
        const refreshed = await this.pfiRepository.findOneById(
            row._id.toString()
        );

        // Side-effects on linked lead (mirror Quotation):
        //   draft → sent     → mark lead PROPOSAL_SENT
        //   *    → approved → mark lead WON (+ link customer)
        // markWon / markProposalSent are idempotent so re-firing is safe
        // when Quotation already triggered the same transition.
        if (refreshed.lead_id) {
            const becomesSent =
                !wasSent &&
                !wasApproved &&
                refreshed.status === ENUM_PFI_STATUS.SENT;
            const becomesApproved =
                !wasApproved &&
                refreshed.status === ENUM_PFI_STATUS.APPROVED;
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

        this.logger.log(`PFI updated: ${row._id}`);
        return refreshed;
    }

    private assertStatusTransitionAllowed(
        from: ENUM_PFI_STATUS,
        to: ENUM_PFI_STATUS
    ): void {
        const map: Record<string, ENUM_PFI_STATUS[]> = {
            [ENUM_PFI_STATUS.DRAFT]: [
                ENUM_PFI_STATUS.SENT,
                ENUM_PFI_STATUS.APPROVED,
                ENUM_PFI_STATUS.REJECTED,
            ],
            [ENUM_PFI_STATUS.SENT]: [
                ENUM_PFI_STATUS.DRAFT,
                ENUM_PFI_STATUS.APPROVED,
                ENUM_PFI_STATUS.REJECTED,
            ],
            [ENUM_PFI_STATUS.APPROVED]: [ENUM_PFI_STATUS.DRAFT],
            [ENUM_PFI_STATUS.REJECTED]: [ENUM_PFI_STATUS.DRAFT],
        };
        const allowed = map[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition PFI from ${from} to ${to}.`
            );
        }
    }

    async softDelete(row: PfiDoc): Promise<void> {
        row.soft_delete = true;
        await this.pfiRepository.save(row);
        this.logger.log(`PFI soft-deleted: ${row._id}`);
    }

    /**
     * Clone an approved Quotation into a new PFI: header fields, lines,
     * expenses, rebates. New voucher_no is allocated from the PFI sequence.
     * The PFI starts as DRAFT regardless of the source Quotation status.
     */
    async createFromQuotation(
        companyId: string,
        quotationId: string,
        createdBy: string
    ): Promise<PfiDoc> {
        const q = await this.quotationRepository.findOne({
            _id: quotationId,
            company_id: companyId,
            soft_delete: false,
        } as any);
        if (!q) throw new NotFoundException('Source quotation not found');

        const [qLines, qExpenses, qRebates] = await Promise.all([
            this.quotationLineRepository.findAll({
                quotation_id: quotationId,
            } as any),
            this.quotationExpenseRepository.findAll({
                quotation_id: quotationId,
            } as any),
            this.quotationRebateRepository.findAll({
                quotation_id: quotationId,
            } as any),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        const payload: PfiCreateRequestDto = {
            quotation_id: quotationId,
            lead_id: q.lead_id?.toString(),
            customer_id: q.customer_id.toString(),
            customer_address_id: q.customer_address_id?.toString(),
            pfi_date: today,
            valid_until: q.valid_until,
            currency_id: q.currency_id.toString(),
            exchange_rate: q.exchange_rate,
            payment_terms: q.payment_terms,
            delivery_terms: q.delivery_terms,
            delivery_location: q.delivery_location,
            notes_to_client: q.notes_to_client,
            internal_notes: q.internal_notes,
            margin_pct: q.margin_pct,
            status: ENUM_PFI_STATUS.DRAFT,
            lines: qLines.map((l: any) => ({
                product_id: l.product_id?.toString(),
                vendor_id: l.vendor_id?.toString(),
                description: l.description,
                qty: l.qty,
                unit: l.unit,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                tax_pct: l.tax_pct,
                margin_pct: l.margin_pct,
            })),
            expenses: qExpenses.map((e: any) => ({
                expense_id: e.expense_id?.toString(),
                name: e.name,
                amount: e.amount,
                is_overridden: !!e.is_overridden,
            })),
            rebates: qRebates.map((r: any) => ({
                rebate_id: r.rebate_id?.toString(),
                name: r.name,
                amount: r.amount,
                is_overridden: !!r.is_overridden,
            })),
        };

        return this.create(companyId, payload, createdBy);
    }

    // ─── Replace-on-update for nested arrays ────────────────────────────

    private async replaceLines(
        companyId: string,
        pfiId: string,
        lines?: any[],
        defaultMarginPct: string = '0'
    ): Promise<void> {
        await this.pfiLineRepository.deleteByPfiId(pfiId);
        if (!lines?.length) return;
        let seq = 0;
        for (const l of lines) {
            seq += 1;
            await this.pfiLineRepository.create({
                company_id: companyId,
                pfi_id: pfiId,
                product_id: l.product_id,
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
                // null = inherit from header.margin_pct at recompute time.
                margin_pct:
                    l.margin_pct != null && l.margin_pct !== ''
                        ? String(l.margin_pct)
                        : null,
                margin_amount: '0',
                seq,
            } as any);
        }
    }

    private async replaceExpenses(
        companyId: string,
        pfiId: string,
        expenses?: any[]
    ): Promise<void> {
        await this.pfiExpenseRepository.deleteByPfiId(pfiId);
        if (!expenses?.length) return;
        let seq = 0;
        for (const e of expenses) {
            seq += 1;
            await this.pfiExpenseRepository.create({
                company_id: companyId,
                pfi_id: pfiId,
                expense_id: e.expense_id || null,
                name: e.name,
                amount: e.amount || '0',
                is_overridden: !!e.is_overridden,
                seq,
            } as any);
        }
    }

    private async replaceRebates(
        companyId: string,
        pfiId: string,
        rebates?: any[]
    ): Promise<void> {
        await this.pfiRebateRepository.deleteByPfiId(pfiId);
        if (!rebates?.length) return;
        let seq = 0;
        for (const r of rebates) {
            seq += 1;
            await this.pfiRebateRepository.create({
                company_id: companyId,
                pfi_id: pfiId,
                rebate_id: r.rebate_id || null,
                name: r.name,
                amount: r.amount || '0',
                is_overridden: !!r.is_overridden,
                seq,
            } as any);
        }
    }

    // ─── Costing engine (mirrors Quotation recompute) ───────────────────

    private async recompute(pfiId: string, companyId: string): Promise<void> {
        const header = await this.pfiRepository.findOneById(pfiId);
        if (!header) return;

        const [lines, expenses, rebates] = await Promise.all([
            this.pfiLineRepository.findAll({ pfi_id: pfiId } as any),
            this.pfiExpenseRepository.findAll({ pfi_id: pfiId } as any),
            this.pfiRebateRepository.findAll({ pfi_id: pfiId } as any),
        ]);

        const customerState = await this.lookupCustomerState(
            header.customer_address_id?.toString()
        );
        const companyState = await this.lookupCompanyState(companyId);

        let subtotal = 0;
        let tax_total = 0;
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

            // PFI lines don't yet carry per-line product expense/rebate
            // snapshots (a future port from Quotation), so the line margin
            // base is just the taxable goods cost.
            const rawLineMargin = (ln as any).margin_pct;
            const lineMarginPct =
                rawLineMargin === null || rawLineMargin === undefined
                    ? num(header.margin_pct)
                    : num(rawLineMargin);
            const lineMarginAmt = out.taxable * (lineMarginPct / 100);
            (ln as any).margin_amount = String(round2(lineMarginAmt));
            await this.pfiLineRepository.save(ln);

            subtotal += out.taxable;
            tax_total += out.total_tax;
            line_margin_total += lineMarginAmt;
        }

        const expenseMasterIds = unique(
            expenses
                .filter((e: any) => e.expense_id && !e.is_overridden)
                .map((e: any) => e.expense_id?.toString())
        );
        const rebateMasterIds = unique(
            rebates
                .filter((r: any) => r.rebate_id && !r.is_overridden)
                .map((r: any) => r.rebate_id?.toString())
        );
        const [expenseMasters, rebateMasters] = await Promise.all([
            expenseMasterIds.length
                ? this.expenseRepository.findAll({
                      _id: { $in: expenseMasterIds },
                  } as any)
                : Promise.resolve([] as any[]),
            rebateMasterIds.length
                ? this.rebateRepository.findAll({
                      _id: { $in: rebateMasterIds },
                  } as any)
                : Promise.resolve([] as any[]),
        ]);
        const expMap = new Map(
            expenseMasters.map((m: any) => [m._id.toString(), m])
        );
        const rebMap = new Map(
            rebateMasters.map((m: any) => [m._id.toString(), m])
        );

        let expenses_total = 0;
        for (const e of expenses) {
            let amt = num(e.amount);
            if (e.expense_id && !e.is_overridden) {
                const master: any = expMap.get(e.expense_id.toString());
                if (master) {
                    amt =
                        master.type === 'percent'
                            ? (subtotal * num(master.value)) / 100
                            : num(master.value);
                    e.amount = String(round2(amt));
                    await this.pfiExpenseRepository.save(e);
                }
            }
            expenses_total += amt;
        }
        let rebates_total = 0;
        for (const r of rebates) {
            let amt = num(r.amount);
            if (r.rebate_id && !r.is_overridden) {
                const master: any = rebMap.get(r.rebate_id.toString());
                if (master) {
                    amt = (subtotal * num(master.pct)) / 100;
                    r.amount = String(round2(amt));
                    await this.pfiRebateRepository.save(r);
                }
            }
            rebates_total += amt;
        }

        // Margin is now per-line (sum of line.margin_amount above).
        const margin_amount = line_margin_total;
        const er = num(header.exchange_rate) || 1;
        const grand_total =
            (subtotal +
                expenses_total -
                rebates_total +
                margin_amount +
                tax_total) *
            er;

        header.subtotal = String(round2(subtotal));
        header.expenses_total = String(round2(expenses_total));
        header.rebates_total = String(round2(rebates_total));
        header.margin_amount = String(round2(margin_amount));
        header.tax_total = String(round2(tax_total));
        header.grand_total = String(round2(grand_total));

        await this.pfiRepository.save(header);
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
            addresses.find((a) => a.type === 'corporate' && a.is_default) ||
            addresses.find((a) => a.type === 'corporate') ||
            addresses.find((a) => a.is_default) ||
            addresses[0];
        return corp?.state || undefined;
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(rows: PfiDoc[]): Promise<PfiGetResponseDto[]> {
        if (!rows.length) return [];

        const customerIds = unique(rows.map((r) => r.customer_id?.toString()));
        const currencyIds = unique(rows.map((r) => r.currency_id?.toString()));
        const quotationIds = unique(
            rows
                .map((r) => r.quotation_id?.toString())
                .filter((v): v is string => !!v)
        );
        const pfiIds = rows.map((r) => r._id.toString());

        const allLines = await this.pfiLineRepository.findAll({
            pfi_id: { $in: pfiIds },
        } as any);
        const vendorIds = unique(
            allLines
                .map((l: any) => l.vendor_id?.toString())
                .filter((v: any): v is string => !!v)
        );

        const [customers, currencies, quotations, vendors, expenses, rebates] =
            await Promise.all([
                customerIds.length
                    ? this.customerRepository.findAll({
                          _id: { $in: customerIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                currencyIds.length
                    ? this.currencyRepository.findAll({
                          _id: { $in: currencyIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                quotationIds.length
                    ? this.quotationRepository.findAll({
                          _id: { $in: quotationIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                vendorIds.length
                    ? this.vendorRepository.findAll({
                          _id: { $in: vendorIds },
                      } as any)
                    : Promise.resolve([] as any[]),
                this.pfiExpenseRepository.findAll({
                    pfi_id: { $in: pfiIds },
                } as any),
                this.pfiRebateRepository.findAll({
                    pfi_id: { $in: pfiIds },
                } as any),
            ]);

        const customerMap = toMap(customers);
        const currencyMap = toMap(currencies);
        const quotationMap = toMap(quotations);
        const vendorMap = toMap(vendors);
        const linesByP = groupBy(allLines, (l: any) => l.pfi_id.toString());
        const expensesByP = groupBy(expenses, (e: any) => e.pfi_id.toString());
        const rebatesByP = groupBy(rebates, (r: any) => r.pfi_id.toString());

        return rows.map((r) => {
            const cust = customerMap.get(r.customer_id?.toString());
            const cur = currencyMap.get(r.currency_id?.toString());
            const q = r.quotation_id
                ? quotationMap.get(r.quotation_id.toString())
                : null;
            const pid = r._id.toString();
            const dto: PfiGetResponseDto = {
                _id: pid,
                voucher_no: r.voucher_no,
                quotation_id: r.quotation_id?.toString(),
                quotation_voucher_no: (q as any)?.voucher_no,
                lead_id: r.lead_id?.toString(),
                customer_id: r.customer_id?.toString(),
                customer_name: (cust as any)?.company_name,
                customer_address_id: r.customer_address_id?.toString(),
                pfi_date: r.pfi_date,
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
                expenses_total: r.expenses_total,
                rebates_total: r.rebates_total,
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
                lines: (linesByP.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (l: any): PfiLineResponseDto => ({
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
                            margin_pct: l.margin_pct,
                            margin_amount: l.margin_amount,
                            seq: l.seq,
                        })
                    ),
                expenses: (expensesByP.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (e: any): PfiExpenseResponseDto => ({
                            _id: e._id?.toString(),
                            expense_id: e.expense_id?.toString(),
                            name: e.name,
                            amount: e.amount,
                            is_overridden: !!e.is_overridden,
                            seq: e.seq,
                        })
                    ),
                rebates: (rebatesByP.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (r2: any): PfiRebateResponseDto => ({
                            _id: r2._id?.toString(),
                            rebate_id: r2.rebate_id?.toString(),
                            name: r2.name,
                            amount: r2.amount,
                            is_overridden: !!r2.is_overridden,
                            seq: r2.seq,
                        })
                    ),
            };
            return dto;
        });
    }

    async mapGet(row: PfiDoc): Promise<PfiGetResponseDto> {
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
