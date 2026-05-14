import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PfiRepository } from '../repository/repositories/pfi.repository';
import { PfiLineRepository } from '../repository/repositories/pfi-line.repository';
import { PfiDoc } from '../repository/entities/pfi.entity';
import { PfiCreateRequestDto } from '../dtos/request/pfi.create.request.dto';
import { PfiUpdateRequestDto } from '../dtos/request/pfi.update.request.dto';
import {
    PfiGetResponseDto,
    PfiLineResponseDto,
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
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';

import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { LeadService } from '@modules/lead/services/lead.service';

import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { computeLineTax } from '@common/tax/utils/tax-engine';
import { getCurrencySymbol } from '@modules/currency/constants/currency.symbols.constant';

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
        private readonly customerRepository: CustomerRepository,
        private readonly customerAddressRepository: CustomerAddressRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly leadService: LeadService,
        private readonly voucherService: VoucherService
    ) {}

    // ─── Reference validation ───────────────────────────────────────────

    private async assertReferences(
        companyId: string,
        customerId: string,
        currencyCode: string,
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
            data.currency_code,
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
            currency_code: data.currency_code,
            exchange_rate: data.exchange_rate || '1',
            payment_terms: data.payment_terms || null,
            delivery_terms: data.delivery_terms || null,
            delivery_location: data.delivery_location || null,
            notes_to_client: data.notes_to_client || null,
            internal_notes: data.internal_notes || null,
            margin_pct: data.margin_pct || '0',
            skip_product_costing: !!data.skip_product_costing,
            status: data.status || ENUM_PFI_STATUS.DRAFT,
            version: 1,
        } as any);

        await this.replaceLines(
            companyId,
            header._id.toString(),
            data.lines,
            data.margin_pct || '0'
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

        // Status lock - only DRAFT is fully editable.
        // Same revert-and-edit allowance as Quotation - payload setting
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
            data.currency_code || row.currency_code,
            data.customer_address_id ?? row.customer_address_id?.toString()
        );
        if ((refsOut as any)?.addressMismatched) {
            (data as any).customer_address_id = null;
        }

        const wasApproved = row.status === ENUM_PFI_STATUS.APPROVED;
        const wasSent = row.status === ENUM_PFI_STATUS.SENT;

        const { lines, ...scalar } = data as any;
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

        const qLines = await this.quotationLineRepository.findAll({
            quotation_id: quotationId,
        } as any);

        const today = new Date().toISOString().slice(0, 10);
        const payload: PfiCreateRequestDto = {
            quotation_id: quotationId,
            lead_id: q.lead_id?.toString(),
            customer_id: q.customer_id.toString(),
            customer_address_id: q.customer_address_id?.toString(),
            pfi_date: today,
            valid_until: q.valid_until,
            currency_code: (q as any).currency_code,
            exchange_rate: q.exchange_rate,
            payment_terms: q.payment_terms,
            delivery_terms: q.delivery_terms,
            delivery_location: q.delivery_location,
            notes_to_client: q.notes_to_client,
            internal_notes: q.internal_notes,
            margin_pct: q.margin_pct,
            skip_product_costing: !!(q as any).skip_product_costing,
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
                // Carry the product rebate/expense snapshots forward so the
                // PFI uses the SAME rates the source quotation captured.
                product_rebates_snapshot: l.product_rebates_snapshot,
                product_expenses_snapshot: l.product_expenses_snapshot,
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

        // Mirror Quotation.replaceLines: pre-load product master rebate/expense
        // links for ALL referenced products in two batched queries (no N+1).
        const productIds = Array.from(
            new Set(
                lines
                    .map((l) => l.product_id)
                    .filter((id): id is string => !!id)
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
                type: m.type,
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
            // If the caller already provided snapshots (e.g. createFromQuotation
            // passes them through), trust those; otherwise rebuild from master.
            const rebSnap =
                l.product_rebates_snapshot ?? rebatesByProduct.get(pid) ?? [];
            const expSnap =
                l.product_expenses_snapshot ?? expensesByProduct.get(pid) ?? [];
            await this.pfiLineRepository.create({
                company_id: companyId,
                pfi_id: pfiId,
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
                product_rebates_snapshot: rebSnap,
                product_expenses_snapshot: expSnap,
                product_rebates_amount: '0',
                product_expenses_amount: '0',
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

    // ─── Costing engine (mirrors Quotation recompute) ───────────────────

    private async recompute(pfiId: string, companyId: string): Promise<void> {
        const header = await this.pfiRepository.findOneById(pfiId);
        if (!header) return;

        const lines = await this.pfiLineRepository.findAll({
            pfi_id: pfiId,
        } as any);

        const customerState = await this.lookupCustomerState(
            header.customer_address_id?.toString()
        );
        const companyState = await this.lookupCompanyState(companyId);

        let subtotal = 0;
        let tax_total = 0;
        let line_margin_total = 0;
        let product_rebates_total = 0;
        let product_expenses_total = 0;

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

            // Per-line product rebates (percent → taxable × pct/100; fixed →
            // flat pct value) + expenses (flat or pct).
            let lineRebatesAmt = 0;
            for (const r of (ln as any).product_rebates_snapshot || []) {
                lineRebatesAmt +=
                    r.type === 'fixed'
                        ? num(r.pct)
                        : (out.taxable * num(r.pct)) / 100;
            }
            let lineExpensesAmt = 0;
            for (const e of (ln as any).product_expenses_snapshot || []) {
                lineExpensesAmt +=
                    e.type === 'percent'
                        ? (out.taxable * num(e.value)) / 100
                        : num(e.value);
            }
            (ln as any).product_rebates_amount = String(round2(lineRebatesAmt));
            (ln as any).product_expenses_amount = String(
                round2(lineExpensesAmt)
            );

            // Margin base: taxable + line product expenses − line product rebates.
            const lineMarginPct = num((ln as any).margin_pct);
            const lineMarginBase =
                out.taxable + lineExpensesAmt - lineRebatesAmt;
            const lineMarginAmt = lineMarginBase * (lineMarginPct / 100);
            (ln as any).margin_amount = String(round2(lineMarginAmt));
            await this.pfiLineRepository.save(ln);

            subtotal += out.taxable;
            tax_total += out.total_tax;
            line_margin_total += lineMarginAmt;
            product_rebates_total += lineRebatesAmt;
            product_expenses_total += lineExpensesAmt;
        }

        const margin_amount = line_margin_total;
        const er = num(header.exchange_rate) || 1;
        // Home-currency (INR) grand total, rounded to whole rupees. The
        // round_off line carries the ± adjustment; the customer (foreign)
        // total derives from the ROUNDED home total so the doc reconciles.
        const grand_inr_raw =
            subtotal +
            product_expenses_total -
            product_rebates_total +
            margin_amount +
            tax_total;
        const grand_inr = Math.round(grand_inr_raw);
        const round_off = round2(grand_inr - grand_inr_raw);
        const grand_total = grand_inr * er;

        header.subtotal = String(round2(subtotal));
        // Header expense/rebate aggregates retained on the entity (DB) but
        // unused - write zeros.
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

        const [customers, quotations, vendors] =
            await Promise.all([
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
                vendorIds.length
                    ? this.vendorRepository.findAll({
                          _id: { $in: vendorIds },
                      } as any)
                    : Promise.resolve([] as any[]),
            ]);

        const customerMap = toMap(customers);
        const quotationMap = toMap(quotations);
        const vendorMap = toMap(vendors);
        const linesByP = groupBy(allLines, (l: any) => l.pfi_id.toString());

        return rows.map((r) => {
            const cust = customerMap.get(r.customer_id?.toString());
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
                currency_code: (r as any).currency_code,
                currency_symbol: getCurrencySymbol((r as any).currency_code),
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
                round_off: (r as any).round_off,
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
                            product_rebates_snapshot: l.product_rebates_snapshot,
                            product_expenses_snapshot: l.product_expenses_snapshot,
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
