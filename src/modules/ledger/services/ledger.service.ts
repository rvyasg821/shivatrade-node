import { Injectable, NotFoundException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { InvoicePaymentRepository } from '@modules/invoice/repository/repositories/invoice-payment.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorService } from '@modules/po-vendor/services/po-vendor.service';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { AdjustmentNoteRepository } from '@modules/adjustment-note/repository/repositories/adjustment-note.repository';
import { ENUM_ADJUSTMENT_DIRECTION } from '@modules/adjustment-note/enums/adjustment-note.enum';
import { LedgerResponseDto, LedgerRowDto } from '../dtos/response/ledger.response.dto';

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Normalise any date (ISO string, Date, or timestamp) to 'YYYY-MM-DD' so rows
// from different sources sort + display consistently (a PO's createdAt is a
// full timestamp; adjustment/payment dates are date-only strings).
const toIso = (d: any): string => {
    if (!d) return '';
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
};

// Statuses that count as a posted document on the ledger.
const LEDGER_INVOICE_STATUSES = ['issued', 'partially_paid', 'paid'];
const LEDGER_POV_STATUSES = ['dispatched', 'closed'];

interface RawRow {
    date: string;
    type: string;
    particulars: string;
    voucher_no?: string;
    dr: number;
    cr: number;
}

export interface LedgerRegisterQuery {
    party_type?: string;
    party_id?: string;
    direction?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    limit?: number;
    offset?: number;
}

/** One line of the combined party-transaction register (#8 listing page). */
export interface LedgerRegisterRow {
    _id: string;
    /**
     * adjustment | receipt (customer, money in) | payment (vendor, money out).
     * Documents themselves — sales invoices and vendor PO bills — are absent by
     * the same client rule that keeps them off the party ledgers.
     */
    source: string;
    date: string;
    /**
     * Row creation timestamp. Only used to break same-day ties — the document
     * dates are date-only columns, so two things booked on the same day are
     * otherwise indistinguishable.
     */
    created_at?: string;
    voucher_no?: string;
    party_type: string;
    party_id: string;
    party_name?: string;
    direction: string;
    /** The money that posts — base + GST for a vendor+debit note, else base. */
    amount: string;
    /** GST breakdown — present only on a vendor + debit adjustment note. */
    base_amount?: string;
    gst_rate?: string;
    gst_amount?: string;
    currency_code: string;
    /** Invoice / Vendor PO this row relates to, if any — its voucher + id so the
     *  listing can deep-link to that document's page. Set on adjustments (the
     *  applied-to doc), receipts (the invoice) and payments (the Vendor PO). */
    document_voucher_no?: string;
    document_id?: string;
    particulars: string;
    voided_at?: Date;
    voided_reason?: string;
}

@Injectable()
export class LedgerService {
    constructor(
        private readonly invoiceRepository: InvoiceRepository,
        private readonly invoicePaymentRepository: InvoicePaymentRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly povService: PoVendorService,
        private readonly customerRepository: CustomerRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly adjustmentRepository: AdjustmentNoteRepository,
        private readonly fileService: FileService
    ) {}

    // ── Customer ledger (in the customer's currency) ──
    async customerLedger(
        companyId: string,
        customerId: string,
        from?: string,
        to?: string
    ): Promise<LedgerResponseDto> {
        const customer: any = await this.customerRepository.findOneById(
            customerId
        );
        if (
            !customer ||
            customer.company_id?.toString() !== companyId ||
            customer.soft_delete
        ) {
            throw new NotFoundException('Customer not found.');
        }

        const invoices: any[] = await this.invoiceRepository.findAll({
            company_id: companyId,
            customer_id: customerId,
            soft_delete: false,
            status: { $in: LEDGER_INVOICE_STATUSES },
        } as any);

        // Client rule (2026-07-17): a cash-movement record, mirroring the vendor
        // ledger. Only receipts and adjustment notes post here — sales invoices
        // are deliberately NOT rows (the vendor side excludes POV bills the same
        // way). The invoice total lives in the summary cards instead.
        //   CREDIT = money received from the customer
        //   DEBIT  = money returned to them (e.g. a damage refund)
        //   Balance = ΣCR − ΣDR = net amount received from this customer.
        const rows: RawRow[] = [];
        const invoiceById = new Map<string, any>();
        for (const inv of invoices) {
            invoiceById.set(inv._id.toString(), inv);
        }

        // Customer receipts = InvoicePayments against this customer's invoices.
        const invoiceIds = invoices.map((i) => i._id.toString());
        if (invoiceIds.length) {
            const payments: any[] = await this.invoicePaymentRepository.findAll({
                invoice_id: { $in: invoiceIds },
                soft_delete: false,
            } as any);
            for (const p of payments) {
                if (p.voided_at) continue;
                const inv = invoiceById.get(p.invoice_id?.toString());
                rows.push({
                    date: p.payment_date,
                    type: 'receipt',
                    particulars: `Payment${
                        inv?.voucher_no ? ` of ${inv.voucher_no}` : ''
                    }`,
                    voucher_no: p.receipt_voucher_no,
                    dr: 0,
                    cr: num(p.amount),
                });
            }
        }

        // Adjustment notes (customer): the note's own direction maps to the
        // same column — a Debit note → DEBIT, a Credit note (money returned to
        // the customer) → CREDIT.
        const notes = await this.adjustmentRepository.findActiveByParty(
            companyId,
            'customer',
            customerId
        );
        for (const n of notes as any[]) {
            if (n.voided_at) continue;
            const isDebit = n.direction === ENUM_ADJUSTMENT_DIRECTION.DEBIT;
            rows.push({
                date: n.note_date,
                type: 'adjustment',
                // Name the document when the note was applied to one, so the
                // statement shows WHICH invoice/POV it settled.
                particulars: `${
                    n.document_voucher_no
                        ? `Adjustment against ${n.document_voucher_no}`
                        : 'Adjustment'
                }: ${n.reason || ''}`.slice(0, 200),
                voucher_no: n.voucher_no,
                dr: isDebit ? num(n.amount) : 0,
                cr: isDebit ? 0 : num(n.amount),
            });
        }

        const currency =
            customer.currency ||
            invoices[0]?.currency_code ||
            'INR';

        // Mirrors the vendor cards: lifetime totals, never narrowed by from/to
        // ("what's still owed" isn't a date-range question).
        //
        // Client rule (2026-07-21, supersedes 2026-07-17): adjustment notes ARE
        // counted, so Outstanding finally agrees with the Balance column below
        // it. Total Received is therefore the SETTLED total (net of notes), not
        // pure cash — same ΣCR − ΣDR the balance column uses:
        //   Credit note (we owe the customer back) → CR → ↓ outstanding
        //   Debit note   (we charge them more)     → DR → ↑ outstanding
        const totalBilled = round2(
            invoices.reduce((s, i) => s + num(i.grand_total), 0)
        );
        const totalPaid = round2(
            rows.reduce((s, r) => s + num(r.cr) - num(r.dr), 0)
        );
        // Migration opening balance. For a customer, a DEBIT opening = they
        // already owe us → adds to outstanding; a CREDIT opening = we hold their
        // advance → reduces it.
        const openingAmt = num(customer.opening_balance);
        const opening =
            openingAmt > 0
                ? {
                      amount: openingAmt,
                      type: customer.opening_balance_type || 'debit',
                      date: customer.opening_balance_date,
                  }
                : undefined;
        const openingOut = opening
            ? opening.type === 'debit'
                ? openingAmt
                : -openingAmt
            : 0;
        const summary = {
            total_billed: totalBilled,
            total_paid: totalPaid,
            opening_balance: round2(openingOut),
            outstanding: round2(totalBilled - totalPaid + openingOut),
        };

        const ledger = this.assemble(
            'customer',
            customerId,
            customer.company_name,
            currency,
            rows,
            from,
            to,
            /* debitPositive */ false,
            opening
        );
        return { ...ledger, summary };
    }

    // ── Vendor ledger (native — in the vendor's own currency) ──
    async vendorLedger(
        companyId: string,
        vendorId: string,
        from?: string,
        to?: string
    ): Promise<LedgerResponseDto> {
        const vendor: any = await this.vendorRepository.findOneById(vendorId);
        if (
            !vendor ||
            vendor.company_id?.toString() !== companyId ||
            vendor.soft_delete
        ) {
            throw new NotFoundException('Vendor not found.');
        }

        // Reuse PoVendorService.mapList so the payment rows (gross amount, void
        // flag, voucher) match the POV Payments tab exactly.
        const povRows: any[] = await this.povRepository.findAll({
            company_id: companyId,
            vendor_id: vendorId,
            soft_delete: false,
            status: { $in: LEDGER_POV_STATUSES },
        } as any);
        const povs = await this.povService.mapList(povRows as any);

        // Client rule (2026-07-17): the vendor ledger is a cash-movement record,
        // NOT a payable statement. Only two sources post to it — payments made
        // from a POV's Payments tab, and adjustment notes. Vendor PO bills are
        // deliberately NOT rows here.
        //   DEBIT  = money Shivatrade paid out to the vendor
        //   CREDIT = money that came back from the vendor (e.g. damage refund)
        //   Balance = ΣDR − ΣCR = net amount paid to this vendor.
        const rows: RawRow[] = [];
        for (const pov of povs as any[]) {
            for (const pay of pov.payments || []) {
                if (pay.voided_at) continue;
                rows.push({
                    date: pay.payment_date,
                    type: 'payment',
                    particulars: `Payment${
                        pov.voucher_no ? ` of ${pov.voucher_no}` : ''
                    }`,
                    voucher_no: pay.payment_voucher_no,
                    dr: num(pay.amount),
                    cr: 0,
                });
            }
        }

        // Adjustment notes (vendor): the note's own direction maps to the same
        // column — a Debit note → DEBIT, a Credit note (money back from the
        // vendor, e.g. for damaged goods) → CREDIT.
        const notes = await this.adjustmentRepository.findActiveByParty(
            companyId,
            'vendor',
            vendorId
        );
        for (const n of notes as any[]) {
            if (n.voided_at) continue;
            const isDebit = n.direction === ENUM_ADJUSTMENT_DIRECTION.DEBIT;
            // A vendor + debit note may carry GST — the money that posts is the
            // base + GST. gst_amount is null on every other note, so this equals
            // the base there (see AdjustmentNote entity).
            const eff = round2(num(n.amount) + num(n.gst_amount));
            rows.push({
                date: n.note_date,
                type: 'adjustment',
                // Name the document when the note was applied to one, so the
                // statement shows WHICH invoice/POV it settled.
                particulars: `${
                    n.document_voucher_no
                        ? `Adjustment against ${n.document_voucher_no}`
                        : 'Adjustment'
                }: ${n.reason || ''}`.slice(0, 200),
                voucher_no: n.voucher_no,
                dr: isDebit ? eff : 0,
                cr: isDebit ? 0 : eff,
            });
        }

        // Headline totals. Computed over ALL rows (not the from/to slice) —
        // "what do we owe this vendor overall?" isn't a date-range question.
        //
        // Client rule (2026-07-21, supersedes 2026-07-17): adjustment notes ARE
        // counted, so Outstanding agrees with the Balance column below it. Same
        // ΣDR − ΣCR the balance column uses:
        //   Debit note  (short supply — we owe less) → DR → ↓ outstanding
        //   Credit note (money back from the vendor) → CR → ↑ outstanding
        // Consequence: Outstanding no longer equals the plain sum of the VPO
        // pages' Balance Payable cards once a note exists — the VPO card can't
        // see party-level notes. That difference is intended.
        const totalBilled = round2(
            (povs as any[]).reduce((s, p) => s + num(p.order_value), 0)
        );
        const totalPaid = round2(
            rows.reduce((s, r) => s + num(r.dr) - num(r.cr), 0)
        );
        // Migration opening balance. For a vendor, a CREDIT opening = we already
        // owe them → adds to outstanding; a DEBIT opening = we hold an advance
        // with them → reduces it.
        const openingAmt = num(vendor.opening_balance);
        const opening =
            openingAmt > 0
                ? {
                      amount: openingAmt,
                      type: vendor.opening_balance_type || 'credit',
                      date: vendor.opening_balance_date,
                  }
                : undefined;
        const openingOut = opening
            ? opening.type === 'credit'
                ? openingAmt
                : -openingAmt
            : 0;
        const summary = {
            total_billed: totalBilled,
            total_paid: totalPaid,
            opening_balance: round2(openingOut),
            outstanding: round2(totalBilled - totalPaid + openingOut),
        };

        const ledger = this.assemble(
            'vendor',
            vendorId,
            vendor.company_name,
            vendor.currency_code || 'INR',
            rows,
            from,
            to,
            /* debitPositive */ true,
            opening
        );
        return { ...ledger, summary };
    }

    // ── Combined register (Adjustment Notes listing page) ──
    /**
     * Every party money-movement in one paginated list: adjustment notes,
     * vendor payments (POV Payments tab) and customer receipts (Invoice
     * payments). Voided rows are INCLUDED and flagged — this is an audit
     * register, unlike the party ledgers which drop them.
     *
     * Assembled in memory rather than in SQL: the three sources live in
     * unrelated tables with no common view, and a single company's volume is
     * small. If this ever gets slow, a DB view is the fix.
     */
    async register(
        companyId: string,
        q: LedgerRegisterQuery
    ): Promise<{ data: LedgerRegisterRow[]; total: number }> {
        const wantCustomer = !q.party_type || q.party_type === 'customer';
        const wantVendor = !q.party_type || q.party_type === 'vendor';
        const rows: LedgerRegisterRow[] = [];

        // Adjustment notes — both party types, direction is the note's own.
        const noteFind: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
        };
        if (q.party_type) noteFind.party_type = q.party_type;
        if (q.party_id) noteFind.party_id = q.party_id;
        const notes: any[] = await this.adjustmentRepository.findAll(
            noteFind as any
        );
        for (const n of notes) {
            const hasGst = n.gst_amount != null;
            rows.push({
                _id: n._id.toString(),
                source: 'adjustment',
                date: toIso(n.note_date),
                created_at: n.createdAt,
                voucher_no: n.voucher_no,
                party_type: n.party_type,
                party_id: n.party_id?.toString(),
                party_name: n.party_snapshot?.name,
                direction: n.direction,
                // Base + GST for a vendor+debit note; base otherwise.
                amount: String(round2(num(n.amount) + num(n.gst_amount))),
                base_amount: hasGst ? String(n.amount ?? '0') : undefined,
                gst_rate: hasGst ? String(n.gst_rate) : undefined,
                gst_amount: hasGst ? String(n.gst_amount) : undefined,
                currency_code: n.currency_code,
                // Which invoice / Vendor PO this note was applied to (blank on
                // a party-level note) — surfaced as its own register column,
                // linked to that document's page.
                document_voucher_no: n.document_voucher_no || undefined,
                document_id: (n as any).document_id?.toString() || undefined,
                particulars: n.reason || '',
                voided_at: n.voided_at || undefined,
                voided_reason: n.voided_reason || undefined,
            });
        }

        // Vendor payments — money out of Shivatrade → always DEBIT, INR.
        if (wantVendor) {
            const povFind: Record<string, any> = {
                company_id: companyId,
                soft_delete: false,
                status: { $in: LEDGER_POV_STATUSES },
            };
            if (q.party_id) povFind.vendor_id = q.party_id;
            const povRows: any[] = await this.povRepository.findAll(
                povFind as any
            );
            const povs = await this.povService.mapList(povRows as any);
            for (const pov of povs as any[]) {
                for (const pay of pov.payments || []) {
                    rows.push({
                        _id: pay._id,
                        source: 'payment',
                        date: toIso(pay.payment_date),
                        created_at: pay.createdAt,
                        voucher_no: pay.payment_voucher_no,
                        party_type: 'vendor',
                        party_id: pov.vendor_id,
                        party_name: pov.vendor_name,
                        direction: 'debit',
                        // Vendor payments are stored NATIVE in the POV's own
                        // currency (the GROSS that settles the vendor), so use
                        // the amount AS-IS — no INR conversion. It already
                        // matches the currency_code symbol shown in the register.
                        amount: String(round2(num(pay.amount))),
                        currency_code: pov.currency_code || 'INR',
                        particulars: `Payment of ${pov.voucher_no || ''}`.trim(),
                        // Vendor PO this payment settles → deep-link target.
                        document_voucher_no: pov.voucher_no || undefined,
                        document_id: pov._id?.toString?.() || pov._id || undefined,
                        voided_at: pay.voided_at || undefined,
                        voided_reason: pay.voided_reason || undefined,
                    });
                }
            }
        }

        // Customer receipts — money in from the customer → CREDIT, mirroring the
        // vendor side (payments) and the customer ledger. Sales invoices are NOT
        // listed: a paid invoice and its receipt carry the same amount, so the
        // pair read as a duplicate. Invoices live on the Invoices tab.
        if (wantCustomer) {
            const invFind: Record<string, any> = {
                company_id: companyId,
                soft_delete: false,
                status: { $in: LEDGER_INVOICE_STATUSES },
            };
            if (q.party_id) invFind.customer_id = q.party_id;
            const invoices: any[] = await this.invoiceRepository.findAll(
                invFind as any
            );
            const invoiceIds = invoices.map((i) => i._id.toString());
            if (invoiceIds.length) {
                const custIds = Array.from(
                    new Set(
                        invoices
                            .map((i) => i.customer_id?.toString())
                            .filter(Boolean)
                    )
                );
                const [payments, customers] = await Promise.all([
                    this.invoicePaymentRepository.findAll({
                        invoice_id: { $in: invoiceIds },
                        soft_delete: false,
                    } as any),
                    this.customerRepository.findAll({
                        _id: { $in: custIds },
                    } as any),
                ]);
                const invById = new Map(
                    invoices.map((i) => [i._id.toString(), i])
                );
                const custById = new Map(
                    (customers as any[]).map((c) => [c._id.toString(), c])
                );
                for (const p of payments as any[]) {
                    const inv = invById.get(p.invoice_id?.toString());
                    if (!inv) continue;
                    const cust = custById.get(inv.customer_id?.toString());
                    rows.push({
                        _id: p._id.toString(),
                        source: 'receipt',
                        date: toIso(p.payment_date),
                        created_at: p.createdAt,
                        voucher_no: p.receipt_voucher_no,
                        party_type: 'customer',
                        party_id: inv.customer_id?.toString(),
                        party_name: cust?.company_name || cust?.name,
                        direction: 'credit',
                        amount: String(p.amount ?? '0'),
                        currency_code:
                            p.currency_code || inv.currency_code || 'INR',
                        particulars: `Payment of ${inv.voucher_no || ''}`.trim(),
                        // Invoice this receipt settles → deep-link target.
                        document_voucher_no: inv.voucher_no || undefined,
                        document_id: inv._id?.toString() || undefined,
                        voided_at: p.voided_at || undefined,
                        voided_reason: p.voided_reason || undefined,
                    });
                }
            }
        }

        // Filters that can't be pushed into the per-source queries.
        const needle = (q.search || '').trim().toLowerCase();
        const filtered = rows.filter((r) => {
            if (q.direction && r.direction !== q.direction) return false;
            if (q.date_from && r.date < q.date_from) return false;
            if (q.date_to && r.date > q.date_to) return false;
            if (needle) {
                const hay = `${r.voucher_no || ''} ${r.particulars || ''} ${
                    r.party_name || ''
                }`.toLowerCase();
                if (!hay.includes(needle)) return false;
            }
            return true;
        });

        // Newest first: this is a paginated work list with no running balance,
        // so the most recent postings belong on page 1. (The party ledgers sort
        // oldest-first instead — their balance column only reads downward.)
        // Same-day ties fall back to created_at, since the document dates are
        // date-only and can't separate two things booked on one day.
        const stamp = (r: LedgerRegisterRow) =>
            r.created_at ? new Date(r.created_at).getTime() : 0;
        filtered.sort((a, b) =>
            a.date !== b.date ? (a.date < b.date ? 1 : -1) : stamp(b) - stamp(a)
        );

        const limit = Math.min(200, Math.max(1, Number(q.limit) || 25));
        const offset = Math.max(0, Number(q.offset) || 0);
        return {
            data: filtered.slice(offset, offset + limit),
            total: filtered.length,
        };
    }

    // ── Shared: date-filter, sort, running balance, totals ──
    private assemble(
        partyType: string,
        partyId: string,
        partyName: string,
        currency: string,
        raw: RawRow[],
        from: string | undefined,
        to: string | undefined,
        debitPositive: boolean,
        opening?: { amount: number; type: string; date?: string }
    ): LedgerResponseDto {
        // Normalise every row date to 'YYYY-MM-DD' up front so filter, sort and
        // display all agree (fixes PO timestamps sorting above older rows).
        const normalised = raw.map((r) => ({ ...r, date: toIso(r.date) }));
        const inRange = normalised.filter((r) => {
            if (from && r.date < from) return false;
            if (to && r.date > to) return false;
            return true;
        });
        // Sort by date, then bills/invoices before their payments on the same day.
        const rank = (t: string) =>
            t === 'invoice' || t === 'bill' ? 0 : 1;
        inRange.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return rank(a.type) - rank(b.type);
        });

        let bal = 0;
        let totalDr = 0;
        let totalCr = 0;
        const rows: LedgerRowDto[] = [];
        // Migration opening balance — always the FIRST row and NOT date-filtered
        // (it is the carried-forward balance at migration). Seeds the running
        // balance + totals so everything below flows from it.
        if (opening && opening.amount > 0) {
            const dr = opening.type === 'debit' ? round2(opening.amount) : 0;
            const cr = opening.type === 'credit' ? round2(opening.amount) : 0;
            totalDr = round2(totalDr + dr);
            totalCr = round2(totalCr + cr);
            bal = round2(debitPositive ? dr - cr : cr - dr);
            rows.push({
                date: opening.date ? toIso(opening.date) : '',
                type: 'opening',
                particulars: 'Opening Balance',
                voucher_no: null,
                dr,
                cr,
                balance: bal,
            });
        }
        for (const r of inRange) {
            const dr = round2(r.dr);
            const cr = round2(r.cr);
            totalDr = round2(totalDr + dr);
            totalCr = round2(totalCr + cr);
            bal = round2(bal + (debitPositive ? dr - cr : cr - dr));
            rows.push({
                date: r.date,
                type: r.type,
                particulars: r.particulars,
                voucher_no: r.voucher_no,
                dr,
                cr,
                balance: bal,
            });
        }

        return {
            party_type: partyType,
            party_id: partyId,
            party_name: partyName,
            currency_code: currency,
            rows,
            total_dr: totalDr,
            total_cr: totalCr,
            balance: bal,
        };
    }

    // ── Excel export ──
    async ledgerExcel(ledger: LedgerResponseDto): Promise<Buffer> {
        const sym = ledger.currency_code;
        const aoa: (string | number)[][] = [
            [`${ledger.party_name || ''} — Ledger (${sym})`],
            ['Date', 'Particulars', 'Voucher', 'Debit', 'Credit', 'Balance'],
            ...ledger.rows.map((r) => [
                // DD-MM-YYYY to match the on-screen statement.
                r.date ? r.date.split('-').reverse().join('-') : '',
                r.particulars,
                r.voucher_no || '',
                r.dr || '',
                r.cr || '',
                r.balance,
            ]),
            [
                '',
                'Total',
                '',
                ledger.total_dr,
                ledger.total_cr,
                ledger.balance,
            ],
        ];
        return this.fileService.writeExcelFromArray(aoa as any);
    }
}
