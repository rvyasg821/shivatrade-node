import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { AdjustmentNoteRepository } from '../repository/repositories/adjustment-note.repository';
import { AdjustmentNoteDoc } from '../repository/entities/adjustment-note.entity';
import { AdjustmentNoteCreateRequestDto } from '../dtos/request/adjustment-note.create.request.dto';
import { AdjustmentNoteResponseDto } from '../dtos/response/adjustment-note.response.dto';
import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../enums/adjustment-note.enum';
import { adjustmentReducesBalance } from '../helpers/adjustment-balance.helper';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { InvoiceService } from '@modules/invoice/services/invoice.service';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorService } from '@modules/po-vendor/services/po-vendor.service';

const round2 = (v: number): number =>
    Math.round((v + Number.EPSILON) * 100) / 100;

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Invoice statuses a note may be applied to — a draft has nothing to settle. */
const LINKABLE_INVOICE_STATUSES = ['issued', 'partially_paid', 'paid'];
/** POV statuses a note may be applied to — anything not cancelled. */
const NON_LINKABLE_POV_STATUSES = ['cancelled'];

/** One selectable document for the note form's "Apply to" dropdown. */
export interface AdjustmentLinkableDocument {
    _id: string;
    voucher_no: string;
    doc_date?: string;
    currency_code: string;
    grand_total: string;
    balance: string;
}

export interface AdjustmentNoteListQuery {
    party_type?: string;
    party_id?: string;
    direction?: string;
    date_from?: string;
    date_to?: string;
    search?: any;
    limit?: number;
    offset?: number;
    order?: any;
}

@Injectable()
export class AdjustmentNoteService {
    private readonly logger = new Logger(AdjustmentNoteService.name);

    constructor(
        private readonly repo: AdjustmentNoteRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyService: CompanyService,
        private readonly voucherService: VoucherService,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoiceService: InvoiceService,
        private readonly povRepository: PoVendorRepository,
        private readonly povService: PoVendorService,
        private readonly companySettings: CompanySettingsService
    ) {}

    // ── "Apply to document" dropdown ────────────────────────────────────

    /**
     * Documents a note may be linked to for one party — invoices for a
     * customer, POVs for a vendor. `balance` is what is still outstanding, so
     * the form can preview "$100.00 → $65.00" and cap the amount.
     */
    async listLinkableDocuments(
        companyId: string,
        partyType: string,
        partyId: string
    ): Promise<AdjustmentLinkableDocument[]> {
        if (partyType === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
            const invoices: any[] = await this.invoiceRepository.findAll({
                company_id: companyId,
                customer_id: partyId,
                soft_delete: false,
                status: { $in: LINKABLE_INVOICE_STATUSES },
            } as any);
            return invoices
                .map((i) => ({
                    _id: i._id.toString(),
                    voucher_no: i.voucher_no,
                    doc_date: i.invoice_date,
                    currency_code: i.currency_code || 'INR',
                    grand_total: String(num(i.grand_total)),
                    balance: String(round2(num(i.balance_receivable))),
                }))
                .sort((a, b) =>
                    String(b.doc_date || '').localeCompare(
                        String(a.doc_date || '')
                    )
                );
        }

        const povRows: any[] = await this.povRepository.findAll({
            company_id: companyId,
            vendor_id: partyId,
            soft_delete: false,
        } as any);
        const povs = await this.povService.mapList(
            povRows.filter(
                (p) => !NON_LINKABLE_POV_STATUSES.includes(String(p.status))
            ) as any
        );
        return (povs as any[])
            .map((p) => ({
                _id: p._id,
                voucher_no: p.voucher_no,
                doc_date: p.po_date || p.order_date,
                currency_code: p.currency_code || 'INR',
                grand_total: String(num(p.order_value)),
                balance: String(round2(num(p.balance_payable))),
            }))
            .sort((a, b) =>
                String(b.doc_date || '').localeCompare(String(a.doc_date || ''))
            );
    }

    /**
     * Validate the optional document link and return its frozen voucher.
     * Rejects: a document that isn't this party's, a currency mismatch, and a
     * "reduce the bill" note bigger than what is still outstanding.
     */
    private async resolveDocumentLink(
        companyId: string,
        dto: AdjustmentNoteCreateRequestDto,
        noteCurrency: string,
        effectiveAmount: number
    ): Promise<string | null> {
        if (!dto.document_id) return null;

        const reduces = adjustmentReducesBalance(dto.party_type, dto.direction);
        let voucherNo = '';
        let balance = 0;
        let docCurrency = 'INR';

        if (dto.party_type === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
            const inv: any = await this.invoiceRepository.findOneById(
                dto.document_id
            );
            if (
                !inv ||
                inv.soft_delete ||
                inv.company_id?.toString() !== companyId
            ) {
                throw new NotFoundException('Invoice not found.');
            }
            if (inv.customer_id?.toString() !== dto.party_id) {
                throw new BadRequestException(
                    'That invoice belongs to a different customer.'
                );
            }
            if (!LINKABLE_INVOICE_STATUSES.includes(String(inv.status))) {
                throw new BadRequestException(
                    `Invoice ${inv.voucher_no} is ${inv.status} — only an issued invoice can be adjusted.`
                );
            }
            voucherNo = inv.voucher_no;
            balance = round2(num(inv.balance_receivable));
            docCurrency = inv.currency_code || 'INR';
        } else {
            const pov: any = await this.povRepository.findOneById(
                dto.document_id
            );
            if (
                !pov ||
                pov.soft_delete ||
                pov.company_id?.toString() !== companyId
            ) {
                throw new NotFoundException('Vendor PO not found.');
            }
            if (pov.vendor_id?.toString() !== dto.party_id) {
                throw new BadRequestException(
                    'That Vendor PO belongs to a different vendor.'
                );
            }
            if (NON_LINKABLE_POV_STATUSES.includes(String(pov.status))) {
                throw new BadRequestException(
                    `Vendor PO ${pov.voucher_no} is cancelled — it cannot be adjusted.`
                );
            }
            voucherNo = pov.voucher_no;
            const mapped = await this.povService.mapList([pov] as any);
            balance = round2(num((mapped as any[])[0]?.balance_payable));
            docCurrency = pov.currency_code || 'INR';
        }

        if (docCurrency !== noteCurrency) {
            throw new BadRequestException(
                `${voucherNo} is in ${docCurrency} but this note is in ${noteCurrency} — they must match.`
            );
        }
        // Only a "reduce the bill" note is capped; increasing a bill has no
        // ceiling. 1e-2 tolerance mirrors the payment guards.
        if (reduces && effectiveAmount - balance > 1e-2) {
            throw new BadRequestException(
                `${voucherNo} has only ${balance.toFixed(2)} outstanding — this note would over-adjust it.`
            );
        }
        return voucherNo;
    }

    /** Re-derive the linked document's balance + status after create/void. */
    private async recomputeLinkedDocument(note: any): Promise<void> {
        const docId = note?.document_id?.toString();
        if (!docId) return;
        if (note.party_type === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
            await this.invoiceService.recomputeAfterAdjustment(docId);
        } else {
            await this.povService.recomputeAfterAdjustment(docId);
        }
    }

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company: any = await this.companyService.findOneById(companyId);
        const explicit = company?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        return (
            (company?.company_name as string | undefined)
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO'
        );
    }

    async create(
        companyId: string,
        dto: AdjustmentNoteCreateRequestDto,
        userId: string
    ): Promise<AdjustmentNoteResponseDto> {
        if (Number(dto.amount) <= 0) {
            throw new BadRequestException('Amount must be greater than 0.');
        }
        // FY closure: block posting an adjustment note into a closed period.
        await this.companySettings.assertPostingDateOpen(
            companyId,
            dto.note_date,
            'adjustment note'
        );

        // Resolve the party, snapshot its name, and pin the currency:
        //   customer → the customer's trading currency (USD/Dinar/…)
        //   vendor   → always INR
        let partyName = '';
        let currencyCode = 'INR';
        if (dto.party_type === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
            const c: any = await this.customerRepository.findOneById(
                dto.party_id
            );
            if (!c || c.company_id?.toString() !== companyId || c.soft_delete) {
                throw new NotFoundException('Customer not found.');
            }
            partyName = c.company_name;
            currencyCode = c.currency || 'INR';
        } else {
            const v: any = await this.vendorRepository.findOneById(dto.party_id);
            if (!v || v.company_id?.toString() !== companyId || v.soft_delete) {
                throw new NotFoundException('Vendor not found.');
            }
            partyName = v.company_name;
            currencyCode = 'INR';
        }

        // GST applies ONLY to a vendor + debit note (an INR claim back on an
        // Indian vendor). For any other combination the fields stay null even
        // if a rate was sent. gst_amount = round2(amount × rate / 100).
        const gstApplies =
            dto.party_type === ENUM_ADJUSTMENT_PARTY_TYPE.VENDOR &&
            dto.direction === ENUM_ADJUSTMENT_DIRECTION.DEBIT &&
            Number(dto.gst_rate) > 0;
        const gstRate = gstApplies ? String(Number(dto.gst_rate)) : null;
        const gstAmount = gstApplies
            ? String(round2((Number(dto.amount) * Number(dto.gst_rate)) / 100))
            : null;

        // Optional document link — validated BEFORE the voucher is minted so a
        // rejected note never burns a number.
        const effectiveAmount = round2(
            Number(dto.amount) + Number(gstAmount ?? 0)
        );
        const documentVoucherNo = await this.resolveDocumentLink(
            companyId,
            dto,
            currencyCode,
            effectiveAmount
        );

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucherNo = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.ADJUSTMENT_NOTE,
            prefix,
            new Date(dto.note_date)
        );

        const note = await this.repo.create({
            company_id: companyId,
            voucher_no: voucherNo,
            party_type: dto.party_type,
            party_id: dto.party_id,
            party_snapshot: { name: partyName },
            direction: dto.direction,
            note_date: dto.note_date,
            amount: dto.amount,
            gst_rate: gstRate,
            gst_amount: gstAmount,
            currency_code: currencyCode,
            document_id: dto.document_id || null,
            document_voucher_no: documentVoucherNo,
            reason: dto.reason,
            created_by: userId,
        } as any);

        // Move the linked document's balance/status now that the note exists.
        await this.recomputeLinkedDocument(note);

        this.logger.log(
            `Adjustment note ${voucherNo} (${dto.direction} ${currencyCode} ${dto.amount}) → ${dto.party_type} ${partyName}${
                documentVoucherNo ? ` [applied to ${documentVoucherNo}]` : ''
            }`
        );
        return this.mapOne(note);
    }

    async list(
        companyId: string,
        query: AdjustmentNoteListQuery
    ): Promise<{ data: AdjustmentNoteResponseDto[]; total: number }> {
        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
        };
        if (query.party_type) find.party_type = query.party_type;
        if (query.party_id) find.party_id = query.party_id;
        if (query.direction) find.direction = query.direction;
        if (query.date_from || query.date_to) {
            find.note_date = {};
            if (query.date_from) find.note_date.$gte = query.date_from;
            if (query.date_to) find.note_date.$lte = query.date_to;
        }
        // _search is a pre-built { $or: [...] } filter from PaginationSearchPipe
        // (availableSearch: voucher_no, reason). Merge it into the find.
        if (
            query.search &&
            typeof query.search === 'object' &&
            Object.keys(query.search).length
        ) {
            Object.assign(find, query.search);
        }

        const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
        const offset = Math.max(0, Number(query.offset) || 0);

        const [rows, total] = await Promise.all([
            this.repo.findAll(find, {
                paging: { limit, offset },
                order: query.order || { note_date: 'DESC', createdAt: 'DESC' },
            } as any),
            this.repo.getTotal(find),
        ]);

        return { data: (rows as AdjustmentNoteDoc[]).map(this.mapOne), total };
    }

    async void(
        companyId: string,
        id: string,
        userId: string,
        reason?: string
    ): Promise<void> {
        const note: any = await this.repo.findOneById(id);
        if (
            !note ||
            note.soft_delete ||
            note.company_id?.toString() !== companyId
        ) {
            throw new NotFoundException('Adjustment note not found.');
        }
        if (note.voided_at) {
            throw new BadRequestException('This note is already voided.');
        }
        note.voided_at = new Date();
        note.voided_by = userId;
        note.voided_reason = reason || null;
        await this.repo.save(note);
        // Voiding reverses the document balance — sumAdjustmentEffect skips
        // voided rows, so a plain recompute is all that's needed.
        await this.recomputeLinkedDocument(note);
        this.logger.log(`Adjustment note ${note.voucher_no} voided.`);
    }

    private mapOne(n: AdjustmentNoteDoc): AdjustmentNoteResponseDto {
        return {
            _id: (n as any)._id.toString(),
            voucher_no: n.voucher_no,
            party_type: n.party_type,
            party_id: (n as any).party_id?.toString(),
            party_name: (n as any).party_snapshot?.name,
            direction: n.direction,
            note_date: n.note_date,
            amount: String(n.amount ?? '0'),
            gst_rate: n.gst_rate != null ? String(n.gst_rate) : undefined,
            gst_amount: n.gst_amount != null ? String(n.gst_amount) : undefined,
            // Base + GST — what actually posts to the ledger.
            total_amount: String(
                round2(Number(n.amount ?? 0) + Number(n.gst_amount ?? 0))
            ),
            currency_code: n.currency_code,
            document_id: (n as any).document_id?.toString(),
            document_voucher_no: (n as any).document_voucher_no || undefined,
            reason: n.reason,
            voided_at: (n as any).voided_at || undefined,
            voided_reason: (n as any).voided_reason || undefined,
            created_by: (n as any).created_by?.toString(),
            createdAt: (n as any).createdAt,
        };
    }
}
