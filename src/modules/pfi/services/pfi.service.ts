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
import { PfiPublicResponseDto } from '../dtos/response/pfi.public.response.dto';
import { ENUM_PFI_STATUS } from '../enums/pfi.enum';

import { randomBytes } from 'crypto';

import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { CustomerAddressRepository } from '@modules/customer/repository/repositories/customer-address.repository';
import { CustomerContactRepository } from '@modules/customer/repository/repositories/customer-contact.repository';
import { CurrencyRepository } from '@modules/currency/repository/repositories/currency.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ExpenseRepository } from '@modules/expense/repository/repositories/expense.repository';
import { RebateRepository } from '@modules/rebate/repository/repositories/rebate.repository';
import { ProductRebateRepository } from '@modules/product/repository/repositories/product-rebate.repository';
import { ProductExpenseRepository } from '@modules/product/repository/repositories/product-expense.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';

import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { LeadService } from '@modules/lead/services/lead.service';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';

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
        private readonly customerContactRepository: CustomerContactRepository,
        private readonly currencyRepository: CurrencyRepository,
        private readonly companyService: CompanyService,
        private readonly companyAddressRepository: CompanyAddressRepository,
        private readonly companyBankAccountRepository: CompanyBankAccountRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly expenseRepository: ExpenseRepository,
        private readonly rebateRepository: RebateRepository,
        private readonly productRebateRepository: ProductRebateRepository,
        private readonly productExpenseRepository: ProductExpenseRepository,
        private readonly productRepository: ProductRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly leadService: LeadService,
        private readonly poRepository: PurchaseOrderRepository,
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
            // ── Consignee (Ship-to) — hybrid FK + snapshot ──
            consignee_id: (data as any).consignee_id || null,
            consignee_snapshot: (data as any).consignee_snapshot || null,
            // ── Shipping / packing / commercial (Phase 1) ──
            port_of_loading: data.port_of_loading || null,
            port_of_loading_id: data.port_of_loading_id || null,
            port_of_loading_snapshot: data.port_of_loading_snapshot || null,
            port_of_discharge: data.port_of_discharge || null,
            port_of_discharge_id: data.port_of_discharge_id || null,
            port_of_discharge_snapshot: data.port_of_discharge_snapshot || null,
            final_destination: data.final_destination || null,
            country_of_origin: data.country_of_origin || null,
            country_of_final_destination:
                data.country_of_final_destination || null,
            mode_of_shipment: data.mode_of_shipment || null,
            est_shipment_date: data.est_shipment_date || null,
            est_delivery_date: data.est_delivery_date || null,
            packing_marks: data.packing_marks || null,
            packing_type: data.packing_type || null,
            container_used:
                data.container_used === undefined ? null : data.container_used,
            container_details: data.container_used
                ? data.container_details || null
                : null,
            container_no: data.container_used ? data.container_no || null : null,
            seal_no: data.container_used ? data.seal_no || null : null,
            container_load_type: data.container_used
                ? data.container_load_type || null
                : null,
            bank_account_id: data.bank_account_id || null,
            payment_terms_text: data.payment_terms_text || null,
            declaration_text: data.declaration_text || null,
            validity_days:
                data.validity_days === undefined ? 30 : data.validity_days,
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
        const row = await this.pfiRepository.findOne({
            _id: id,
            soft_delete: false,
        } as any);
        if (!row) throw new NotFoundException('PFI not found');
        return row;
    }

    async update(row: PfiDoc, data: PfiUpdateRequestDto): Promise<PfiDoc> {
        const companyId = row.company_id.toString();

        // Status lock - only DRAFT is fully editable.
        // Same revert-and-edit allowance as Quotation - payload setting
        // status=DRAFT lifts the lock for this update.
        const willBeDraft = data.status === ENUM_PFI_STATUS.DRAFT;
        const isLocked = row.status !== ENUM_PFI_STATUS.DRAFT && !willBeDraft;
        const isStatusOnlyChange = (() => {
            if (!isLocked) return true;
            const allowedKeys = new Set(['status', 'internal_notes']);
            return Object.keys(data || {}).every(
                k => allowedKeys.has(k) || (data as any)[k] === undefined
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
        // If container is not used, clear its dependent fields so stale
        // values from a previous "Yes" don't linger on the record.
        if ((row as any).container_used !== true) {
            (row as any).container_details = null;
            (row as any).container_no = null;
            (row as any).seal_no = null;
            (row as any).container_load_type = null;
        }
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
                !wasApproved && refreshed.status === ENUM_PFI_STATUS.APPROVED;
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
            [ENUM_PFI_STATUS.APPROVED]: [
                ENUM_PFI_STATUS.DRAFT,
                // CLOSED is set automatically when a Commercial Invoice is
                // generated from this PFI. No auto-trigger in v1 — the CI
                // module wires that when it lands.
                ENUM_PFI_STATUS.CLOSED,
            ],
            [ENUM_PFI_STATUS.REJECTED]: [ENUM_PFI_STATUS.DRAFT],
            // CLOSED is terminal — no further transitions.
            [ENUM_PFI_STATUS.CLOSED]: [],
        };
        const allowed = map[from] || [];
        if (!allowed.includes(to)) {
            throw new BadRequestException(
                `Cannot transition PFI from ${from} to ${to}.`
            );
        }
    }

    async softDelete(row: PfiDoc): Promise<void> {
        // Block delete when any non-soft-deleted PO references this PFI.
        const activePos = await this.poRepository.getTotal({
            pfi_id: row._id.toString(),
            soft_delete: false,
        } as any);
        if (activePos > 0) {
            throw new BadRequestException(
                `Cannot delete PFI: ${activePos} Purchase Order(s) reference it. Delete those first.`
            );
        }

        row.soft_delete = true;
        await this.pfiRepository.save(row);
        this.logger.log(`PFI soft-deleted: ${row._id}`);
    }

    // ─── Public share link ──────────────────────────────────────────────

    /** Generate (or keep) the public token. Only sent/approved PFIs can be
     *  published — a draft is not final enough to share. */
    async publish(id: string): Promise<PfiDoc> {
        const row = await this.findOneById(id);
        this.assertPublishable(row.status);
        if (!row.public_token) {
            row.public_token = randomBytes(24).toString('base64url');
            await this.pfiRepository.save(row);
        }
        return row;
    }

    /** Issue a fresh token — the old public URL stops working immediately. */
    async rotateToken(id: string): Promise<PfiDoc> {
        const row = await this.findOneById(id);
        this.assertPublishable(row.status);
        row.public_token = randomBytes(24).toString('base64url');
        await this.pfiRepository.save(row);
        return row;
    }

    /** Revoke the public link entirely. */
    async unpublish(id: string): Promise<PfiDoc> {
        const row = await this.findOneById(id);
        row.public_token = null as any;
        await this.pfiRepository.save(row);
        return row;
    }

    private assertPublishable(status: ENUM_PFI_STATUS): void {
        if (
            status !== ENUM_PFI_STATUS.SENT &&
            status !== ENUM_PFI_STATUS.APPROVED
        ) {
            throw new BadRequestException(
                'Only sent or approved PFIs can be published'
            );
        }
    }

    /** Public view-only fetch by token — no auth. Returns null for an
     *  unknown token or a PFI that is no longer in a shareable state. */
    async findByPublicToken(token: string): Promise<PfiDoc | null> {
        if (!token) return null;
        const row = await this.pfiRepository.findOne({
            public_token: token,
            soft_delete: false,
        } as any);
        if (!row) return null;
        // Bump view tracking (fire-and-forget — never block the response).
        (row as any).public_view_count =
            ((row as any).public_view_count || 0) + 1;
        (row as any).public_last_viewed_at = new Date();
        this.pfiRepository
            .save(row)
            .catch((err) =>
                this.logger.warn(`Public view-count update failed: ${err}`)
            );
        return row;
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

        // ── Company-level export defaults (Phase 6) ──
        // `default_port_of_loading` / `default_declaration_text` land in
        // Phase 8 on the company entity; access defensively so this code
        // works either way.
        let company: any = null;
        try {
            company = await this.companyService.findOneById(companyId);
        } catch {
            // company lookup failure shouldn't block PFI creation
        }
        const defaultPort: string | undefined =
            company?.default_port_of_loading || undefined;
        const defaultDeclaration: string | undefined =
            company?.default_declaration_text || undefined;
        const countryOfOrigin: string =
            (company?.country && String(company.country).trim()) || 'India';

        // ── Bank account pick — company's HOME currency default ──────
        // Operator can change to a different bank on the PFI form.
        let bankAccountId: string | undefined;
        try {
            const homeCurrencyCode =
                (company?.currency && String(company.currency).trim()) ||
                undefined;
            if (homeCurrencyCode) {
                const currency: any = await this.currencyRepository.findOne({
                    code: homeCurrencyCode,
                } as any);
                if (currency?._id) {
                    const banks =
                        await this.companyBankAccountRepository.findAll({
                            company_id: companyId,
                            currency_id: currency._id.toString(),
                            is_active: true,
                            soft_delete: false,
                        } as any);
                    const def =
                        (banks || []).find((b: any) => b.is_default) ||
                        (banks || [])[0];
                    if (def) bankAccountId = def._id.toString();
                }
            }
        } catch {
            // leave bankAccountId undefined; user picks one on the form
        }

        // ── Per-line product master lookup (HS code + per-unit weights) ──
        const productIds = Array.from(
            new Set(
                qLines
                    .map((l: any) => l.product_id?.toString())
                    .filter(Boolean)
            )
        );
        const products = productIds.length
            ? await this.productRepository.findAll({
                  _id: { $in: productIds },
              } as any)
            : [];
        const productById = new Map<string, any>();
        for (const pr of products as any[]) {
            productById.set(pr._id.toString(), pr);
        }

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
            // ── Export-document defaults (Phase 6 / §5.4) ──
            // Shipping fields (port_of_discharge, mode_of_shipment, etc) are
            // intentionally left blank — user fills these when finalising
            // the PFI.
            port_of_loading: defaultPort,
            country_of_origin: countryOfOrigin,
            payment_terms_text: '100% advance via T/T',
            declaration_text: defaultDeclaration,
            bank_account_id: bankAccountId,
            lines: qLines.map((l: any) => {
                const pid = l.product_id?.toString();
                const prod: any = pid ? productById.get(pid) : undefined;
                const qty = num(l.qty);
                const nwpu = num(prod?.net_weight_per_unit);
                const gwpu = num(prod?.gross_weight_per_unit);
                return {
                    product_id: pid,
                    vendor_id: l.vendor_id?.toString(),
                    source_quotation_line_id: l._id?.toString(),
                    description: l.description,
                    customer_reference: l.customer_reference,
                    qty: l.qty,
                    unit: l.unit,
                    unit_price: l.unit_price,
                    discount_pct: l.discount_pct,
                    tax_pct: l.tax_pct,
                    margin_pct: l.margin_pct,
                    // Carry the product rebate/expense snapshots forward so
                    // the PFI uses the SAME rates the source quotation
                    // captured.
                    product_rebates_snapshot: l.product_rebates_snapshot,
                    product_expenses_snapshot: l.product_expenses_snapshot,
                    // ── Export-document line auto-fill (Phase 6 / §5.4) ──
                    hs_code: prod?.hsn_code,
                    net_weight_kg:
                        qty > 0 && nwpu > 0
                            ? String(round2(qty * nwpu))
                            : undefined,
                    gross_weight_kg:
                        qty > 0 && gwpu > 0
                            ? String(round2(qty * gwpu))
                            : undefined,
                };
            }),
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
                lines.map(l => l.product_id).filter((id): id is string => !!id)
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
                source_quotation_line_id: l.source_quotation_line_id || null,
                vendor_id: l.vendor_id || null,
                description: l.description || null,
                customer_reference: l.customer_reference || null,
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
                // ── Export-document line fields (Phase 2) ──
                hs_code: l.hs_code || null,
                net_weight_kg:
                    l.net_weight_kg != null && l.net_weight_kg !== ''
                        ? String(l.net_weight_kg)
                        : '0',
                gross_weight_kg:
                    l.gross_weight_kg != null && l.gross_weight_kg !== ''
                        ? String(l.gross_weight_kg)
                        : '0',
                package_count:
                    l.package_count != null && l.package_count !== ''
                        ? Number(l.package_count)
                        : 0,
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
        let total_packages = 0;
        let net_weight_kg = 0;
        let gross_weight_kg = 0;

        for (const ln of lines) {
            total_packages += Number((ln as any).package_count || 0);
            net_weight_kg += num((ln as any).net_weight_kg);
            gross_weight_kg += num((ln as any).gross_weight_kg);

            // Use the engine only for the intra/inter split — recompute the
            // tax amount ourselves on the Net Total per spec (p.24).
            const split = computeLineTax({
                qty: num(ln.qty),
                unit_price: num(ln.unit_price),
                discount_pct: num(ln.discount_pct),
                tax_pct: 0, // ignore engine's tax math; we apply on Net Total below
                customer_state: customerState,
                company_state: companyState,
            });

            ln.taxable = String(split.taxable);

            // Sequential costing per spec:
            //   Taxable → − Rebates → + Expenses → + Margin → + GST.
            // Each % step applies to the running balance from the previous
            // step, NOT to the gross Taxable.
            let lineRebatesAmt = 0;
            for (const r of (ln as any).product_rebates_snapshot || []) {
                lineRebatesAmt +=
                    r.type === 'fixed'
                        ? num(r.pct)
                        : (split.taxable * num(r.pct)) / 100;
            }
            const afterRebates = split.taxable - lineRebatesAmt;
            let lineExpensesAmt = 0;
            for (const e of (ln as any).product_expenses_snapshot || []) {
                lineExpensesAmt +=
                    e.type === 'percent'
                        ? (afterRebates * num(e.value)) / 100
                        : num(e.value);
            }
            (ln as any).product_rebates_amount = String(round2(lineRebatesAmt));
            (ln as any).product_expenses_amount = String(
                round2(lineExpensesAmt)
            );

            // Margin %: on the post-expense balance.
            const afterExpenses = afterRebates + lineExpensesAmt;
            const lineMarginPct = num((ln as any).margin_pct);
            const lineMarginAmt = afterExpenses * (lineMarginPct / 100);
            (ln as any).margin_amount = String(round2(lineMarginAmt));

            // GST: per-line tax_pct is captured for reference but NOT
            // rolled into line_total or doc totals on PFI. cgst/sgst/igst
            // are forced to zero so legacy readers don't see stale tax.
            const lineNetTotal = afterExpenses + lineMarginAmt;
            ln.cgst = '0';
            ln.sgst = '0';
            ln.igst = '0';
            ln.line_total = String(round2(lineNetTotal));
            await this.pfiLineRepository.save(ln);

            subtotal += split.taxable;
            line_margin_total += lineMarginAmt;
            product_rebates_total += lineRebatesAmt;
            product_expenses_total += lineExpensesAmt;
        }

        const margin_amount = line_margin_total;
        const er = num(header.exchange_rate) || 1;
        // Home-currency (INR) grand total, rounded to whole rupees. The
        // round_off line carries the ± adjustment; the customer (foreign)
        // total derives from the ROUNDED home total so the doc reconciles.
        // PFI grand total excludes GST — per-line tax_pct is captured
        // for reference only, not added to the doc total.
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

        // ── Auto-summed packing / weight rollups (Phase 2) ──
        (header as any).total_packages = total_packages;
        (header as any).net_weight_kg = String(net_weight_kg.toFixed(3));
        (header as any).gross_weight_kg = String(gross_weight_kg.toFixed(3));

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
        const addresses =
            await this.companyAddressRepository.findByCompanyId(companyId);
        if (!addresses?.length) return undefined;
        const corp =
            addresses.find(a => a.type === 'corporate' && a.is_default) ||
            addresses.find(a => a.type === 'corporate') ||
            addresses.find(a => a.is_default) ||
            addresses[0];
        return corp?.state || undefined;
    }

    // ─── Hydration ──────────────────────────────────────────────────────

    async mapList(rows: PfiDoc[]): Promise<PfiGetResponseDto[]> {
        if (!rows.length) return [];

        const customerIds = unique(rows.map(r => r.customer_id?.toString()));
        const quotationIds = unique(
            rows
                .map(r => r.quotation_id?.toString())
                .filter((v): v is string => !!v)
        );
        const pfiIds = rows.map(r => r._id.toString());

        const allLines = await this.pfiLineRepository.findAll({
            pfi_id: { $in: pfiIds },
        } as any);
        const vendorIds = unique(
            allLines
                .map((l: any) => l.vendor_id?.toString())
                .filter((v: any): v is string => !!v)
        );
        const productIdsAll = unique(
            allLines
                .map((l: any) => l.product_id?.toString())
                .filter((v: any): v is string => !!v)
        );
        const bankIds = unique(
            rows
                .map((r: any) => r.bank_account_id?.toString())
                .filter((v: any): v is string => !!v)
        );

        const [customers, contacts, quotations, vendors, productsAll, bankAccounts] = await Promise.all([
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
            productIdsAll.length
                ? this.productRepository.findAll({
                      _id: { $in: productIdsAll },
                  } as any)
                : Promise.resolve([] as any[]),
            bankIds.length
                ? this.companyBankAccountRepository.findAll({
                      _id: { $in: bankIds },
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

        const customerMap = toMap(customers);
        const quotationMap = toMap(quotations);
        const vendorMap = toMap(vendors);
        const productMap = toMap(productsAll);
        const bankMap = toMap(bankAccounts);
        const linesByP = groupBy(allLines, (l: any) => l.pfi_id.toString());

        return rows.map(r => {
            const cust = customerMap.get(r.customer_id?.toString());
            const q = r.quotation_id
                ? quotationMap.get(r.quotation_id.toString())
                : null;
            const pid = r._id.toString();
            const primary: any = primaryContactByCustomer.get(
                r.customer_id?.toString()
            );
            const dto: PfiGetResponseDto = {
                _id: pid,
                voucher_no: r.voucher_no,
                quotation_id: r.quotation_id?.toString(),
                quotation_voucher_no: (q as any)?.voucher_no,
                lead_id: r.lead_id?.toString(),
                customer_id: r.customer_id?.toString(),
                customer_name: (cust as any)?.company_name,
                customer_contact_name: primary?.name,
                customer_contact_email: primary?.email,
                customer_contact_phone: primary?.phone,
                customer_contact_country_code: primary?.country_code,
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
                // ── Consignee (Ship-to) ──
                consignee_id: (r as any).consignee_id?.toString(),
                consignee_snapshot: (r as any).consignee_snapshot,
                // ── Shipping / packing / commercial (Phase 1) ──
                port_of_loading: (r as any).port_of_loading,
                port_of_loading_id: (r as any).port_of_loading_id,
                port_of_loading_snapshot: (r as any).port_of_loading_snapshot,
                port_of_discharge: (r as any).port_of_discharge,
                port_of_discharge_id: (r as any).port_of_discharge_id,
                port_of_discharge_snapshot: (r as any).port_of_discharge_snapshot,
                final_destination: (r as any).final_destination,
                country_of_origin: (r as any).country_of_origin,
                country_of_final_destination: (r as any)
                    .country_of_final_destination,
                mode_of_shipment: (r as any).mode_of_shipment,
                container_details: (r as any).container_details,
                est_shipment_date: (r as any).est_shipment_date,
                est_delivery_date: (r as any).est_delivery_date,
                packing_marks: (r as any).packing_marks,
                total_packages: (r as any).total_packages,
                packing_type: (r as any).packing_type,
                container_used: (r as any).container_used ?? null,
                container_no: (r as any).container_no || undefined,
                seal_no: (r as any).seal_no || undefined,
                container_load_type:
                    (r as any).container_load_type || undefined,
                gross_weight_kg: (r as any).gross_weight_kg,
                net_weight_kg: (r as any).net_weight_kg,
                bank_account_id: (r as any).bank_account_id?.toString(),
                bank_account: (() => {
                    const bk: any = bankMap.get(
                        (r as any).bank_account_id?.toString()
                    );
                    if (!bk) return undefined;
                    return {
                        _id: bk._id?.toString(),
                        bank_name: bk.bank_name,
                        beneficiary_name: bk.beneficiary_name,
                        account_number: bk.account_number,
                        branch_name: bk.branch_name,
                        branch_address: bk.branch_address,
                        swift_code: bk.swift_code,
                        ifsc: bk.ifsc,
                        iban: bk.iban,
                        ad_code: bk.ad_code,
                        currency_code: bk.currency_code,
                    };
                })(),
                payment_terms_text: (r as any).payment_terms_text,
                declaration_text: (r as any).declaration_text,
                validity_days: (r as any).validity_days,
                public_token: (r as any).public_token,
                public_view_count: (r as any).public_view_count,
                public_last_viewed_at: (r as any).public_last_viewed_at,
                created_by: r.created_by?.toString(),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                lines: (linesByP.get(pid) || [])
                    .sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0))
                    .map(
                        (l: any): PfiLineResponseDto => ({
                            _id: l._id?.toString(),
                            product_id: l.product_id?.toString(),
                            product_name: (
                                productMap.get(l.product_id?.toString()) as any
                            )?.name,
                            product_code: (
                                productMap.get(l.product_id?.toString()) as any
                            )?.code,
                            vendor_id: l.vendor_id?.toString(),
                            vendor_name: (
                                vendorMap.get(l.vendor_id?.toString()) as any
                            )?.company_name,
                            vendor_code: (
                                vendorMap.get(l.vendor_id?.toString()) as any
                            )?.vendor_code,
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
                                l.product_rebates_snapshot,
                            product_expenses_snapshot:
                                l.product_expenses_snapshot,
                            product_rebates_amount: l.product_rebates_amount,
                            product_expenses_amount: l.product_expenses_amount,
                            margin_pct: l.margin_pct,
                            margin_amount: l.margin_amount,
                            seq: l.seq,
                            // ── Export-document line fields (Phase 2) ──
                            hs_code: l.hs_code,
                            net_weight_kg: l.net_weight_kg,
                            gross_weight_kg: l.gross_weight_kg,
                            package_count: l.package_count,
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

    /**
     * Sanitized public projection — what the buyer sees at /p/<token> and
     * what the PDF renders from. All money values are converted into the
     * customer currency; costing internals (margin, expenses, rebates,
     * internal_notes, source IDs) are deliberately omitted.
     */
    async mapPublic(row: PfiDoc): Promise<PfiPublicResponseDto> {
        const full = await this.mapGet(row);
        const er = num(full.exchange_rate) || 1;

        // ── Seller (us) ──
        let company_name: string | undefined;
        let company_email: string | undefined;
        let company_phone: string | undefined;
        let company_iec: string | undefined;
        let company_address: string | undefined;
        try {
            const company: any = await this.companyService.findOneById(
                row.company_id.toString()
            );
            company_name = company?.company_name;
            company_email = company?.email;
            company_iec = company?.iec;
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
                company_address = [
                    (corp as any).address_line1,
                    (corp as any).address_line2,
                    [
                        (corp as any).city,
                        (corp as any).state,
                        (corp as any).postcode,
                    ]
                        .filter(Boolean)
                        .join(', '),
                    (corp as any).country,
                ]
                    .filter(Boolean)
                    .join('\n');
            }
        } catch {
            // leave seller fields undefined — header degrades gracefully
        }

        // ── Buyer bill-to address ──
        let customer_address: string | undefined;
        if (row.customer_address_id) {
            try {
                const addr: any =
                    await this.customerAddressRepository.findOne({
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
            // GST is NOT applied to PFI totals — per-line tax_pct is
            // captured for reference only.
            const gstCust = 0;
            const lineTotal = round2(netCust);
            const rate = qty > 0 ? round2(lineTotal / qty) : 0;
            subtotal += netCust;
            gst_total += gstCust;
            grand_total_calc += lineTotal;
            return {
                product_name: l.product_name,
                description: l.description,
                hs_code: l.hs_code,
                qty: l.qty,
                unit: l.unit,
                unit_price: String(rate),
                discount_pct: l.discount_pct,
                tax_pct: l.tax_pct,
                gst_amount: String(gstCust),
                line_total: String(lineTotal),
                net_weight_kg: l.net_weight_kg,
                gross_weight_kg: l.gross_weight_kg,
                package_count: l.package_count,
            };
        });

        // ── Bank block (live FK lookup) ──
        let bank: PfiPublicResponseDto['bank'] | undefined;
        if (full.bank_account_id) {
            try {
                const bk: any =
                    await this.companyBankAccountRepository.findOne({
                        _id: full.bank_account_id,
                        soft_delete: false,
                    } as any);
                if (bk) {
                    let bankCurrencyCode: string | undefined;
                    try {
                        const cur: any =
                            await this.currencyRepository.findOne({
                                _id: bk.currency_id?.toString(),
                            } as any);
                        bankCurrencyCode = cur?.code;
                    } catch {
                        // ignore — bank block still renders without it
                    }
                    bank = {
                        beneficiary_name:
                            bk.account_holder_name || company_name,
                        bank_name: bk.bank_name,
                        account_number: bk.account_number,
                        ifsc: bk.ifsc,
                        swift_code: bk.swift_code,
                        iban: bk.iban,
                        branch_name: bk.branch_name,
                        branch_address: bk.branch_address,
                        ad_code: bk.ad_code,
                        currency_code: bankCurrencyCode,
                    };
                }
            } catch {
                bank = undefined;
            }
        }

        // Prefer the consignee_snapshot when the PFI carries one (hybrid
        // ship-to model). Otherwise fall back to the buyer — keeps the
        // public PDF / view useful for PFIs that never set a consignee.
        const cs = (full as any).consignee_snapshot;
        const consignee_name = cs?.name || full.customer_name;
        const consignee_address = cs
            ? [
                  cs.address_line1,
                  cs.address_line2,
                  [cs.city, cs.state].filter(Boolean).join(', '),
                  [cs.country, cs.postcode].filter(Boolean).join(' - '),
              ]
                  .filter(Boolean)
                  .join('\n')
            : customer_address;

        const today = new Date().toISOString().slice(0, 10);
        return {
            voucher_no: full.voucher_no,
            pfi_date: full.pfi_date,
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
            customer_name: full.customer_name,
            customer_contact_name: full.customer_contact_name,
            customer_email: full.customer_contact_email,
            customer_phone,
            customer_address,
            consignee_name,
            consignee_address,
            port_of_loading: full.port_of_loading,
            port_of_discharge: full.port_of_discharge,
            final_destination: full.final_destination || full.port_of_discharge,
            country_of_origin: full.country_of_origin,
            country_of_final_destination: full.country_of_final_destination,
            mode_of_shipment: full.mode_of_shipment,
            container_details: full.container_details,
            est_shipment_date: full.est_shipment_date,
            est_delivery_date: full.est_delivery_date,
            packing_marks: full.packing_marks,
            total_packages: full.total_packages,
            packing_type: full.packing_type,
            container_used: (full as any).container_used ?? null,
            container_no: (full as any).container_no || undefined,
            seal_no: (full as any).seal_no || undefined,
            container_load_type:
                (full as any).container_load_type || undefined,
            gross_weight_kg: full.gross_weight_kg,
            net_weight_kg: full.net_weight_kg,
            payment_terms_text: full.payment_terms_text,
            declaration_text: full.declaration_text,
            notes_to_client: full.notes_to_client,
            lines,
            subtotal: String(round2(subtotal)),
            gst_total: String(round2(gst_total)),
            grand_total: String(round2(grand_total_calc)),
            bank,
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
