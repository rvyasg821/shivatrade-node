import { Injectable, NotFoundException } from '@nestjs/common';
import { FileService } from '@common/file/services/file.service';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { InvoicePaymentRepository } from '@modules/invoice/repository/repositories/invoice-payment.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { PoVendorService } from '@modules/po-vendor/services/po-vendor.service';
import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { ENUM_GRN_STATUS } from '@modules/grn/enums/grn.enum';
import { ENUM_PURCHASE_ORDER_STATUS } from '@modules/purchase-order/enums/purchase-order.enum';
import { ENUM_INVOICE_STATUS } from '@modules/invoice/enums/invoice.enum';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
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

// Statuses that count as a BILLED document (drive `total_billed` / outstanding).
const LEDGER_INVOICE_STATUSES = ['issued', 'partially_paid', 'paid'];
const LEDGER_POV_STATUSES = ['dispatched', 'closed'];
// Statuses to scan when gathering cash movements (receipts / payments). DRAFT is
// included because an upfront ADVANCE can be paid/received while the doc is still
// a draft (Vendor PO advance, or a customer invoice advance seeded as a receipt),
// and that cash MUST post to the ledger + register. Draft docs are still EXCLUDED
// from `total_billed` (a `status !== 'draft'` filter on each reduce below), so a
// draft never counts as invoiced/ordered — only its cash row shows.
const LEDGER_INVOICE_STATUSES_TXN = ['draft', ...LEDGER_INVOICE_STATUSES];
const LEDGER_POV_STATUSES_TXN = ['draft', ...LEDGER_POV_STATUSES];

interface RawRow {
    date: string;
    type: string;
    particulars: string;
    voucher_no?: string;
    dr: number;
    cr: number;
    // Base-currency (INR) equivalent of dr/cr, using THIS row's own rate (the
    // POV/invoice/receipt rate captured at the time it was booked) — never a
    // shared/current rate. Defaults to dr/cr themselves (rate = 1) when not
    // supplied, which is correct for INR-native rows.
    dr_inr?: number;
    cr_inr?: number;
    // Row creation timestamp — breaks same-day ties so postings appear in the
    // order they were actually recorded (document dates are date-only).
    created_at?: string | Date;
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
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly povService: PoVendorService,
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly poRepository: PurchaseOrderRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly adjustmentRepository: AdjustmentNoteRepository,
        private readonly fileService: FileService
    ) {}

    // Sales-Order advance received → customer CREDIT (client 2026-08-07). The
    // down-payment entered on the Sales Order form is money received from the
    // customer BEFORE any invoice. One CR row per non-cancelled SO carrying an
    // advance, in the SO's currency — shown UNTIL an invoice is generated from
    // that SO, at which point the invoice seeds its OWN advance receipt (even on
    // a draft invoice), so the SO row is dropped to avoid double-counting.
    private async customerSoAdvances(
        companyId: string,
        customerId?: string
    ): Promise<
        Array<{
            so_id: string;
            voucher_no?: string;
            date: string;
            value: number;
            currency_code: string;
            exchange_rate: number;
            customer_id?: string;
            created_at?: Date;
        }>
    > {
        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
            status: { $ne: ENUM_PURCHASE_ORDER_STATUS.CANCELLED },
        };
        if (customerId) find.customer_id = customerId;
        const sos: any[] = await this.poRepository.findAll(find as any);
        const withAdvance = sos.filter((s) => num(s.advance_amount) > 0);
        if (!withAdvance.length) return [];
        // Dedup: an SO whose advance was already carried onto a (non-cancelled)
        // invoice is represented by that invoice's advance receipt instead.
        const soIds = withAdvance.map((s) => s._id.toString());
        const invoices: any[] = await this.invoiceRepository.findAll({
            company_id: companyId,
            soft_delete: false,
            purchase_order_id: { $in: soIds },
        } as any);
        const invoicedSoIds = new Set(
            invoices
                .filter((i) => i.status !== ENUM_INVOICE_STATUS.CANCELLED)
                .map((i) => i.purchase_order_id?.toString())
        );
        return withAdvance
            .filter((s) => !invoicedSoIds.has(s._id.toString()))
            .map((s) => ({
                so_id: s._id.toString(),
                voucher_no: s.voucher_no,
                // Fall back to the SO date when no explicit advance date.
                date: s.advance_date || s.po_date,
                value: round2(num(s.advance_amount)),
                currency_code: s.currency_code || 'INR',
                // Prefer the rate captured AT RECEIPT (`advance_exchange_rate`)
                // over the SO's own header rate — they can legitimately differ
                // (the header rate may be set/updated later; the advance was
                // received at whatever rate applied that day). `!== 1` treats
                // the column's default as "not really set" the same way
                // `InvoiceService.sourceAdvanceRate` already does.
                exchange_rate:
                    num(s.advance_exchange_rate) > 0 &&
                    num(s.advance_exchange_rate) !== 1
                        ? num(s.advance_exchange_rate)
                        : num(s.exchange_rate) || 1,
                customer_id: s.customer_id?.toString(),
                created_at: s.createdAt,
            }));
    }

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
            // Include draft so a draft invoice's advance receipt posts here;
            // drafts are dropped from total_billed below.
            status: { $in: LEDGER_INVOICE_STATUSES_TXN },
        } as any);

        // Client rule (2026-08-19, supersedes 2026-07-17): the client asked for
        // invoices to be visible transaction-wise, not just folded into the
        // "Total Invoiced" card — so each invoice now posts its own DEBIT row
        // (money the customer now owes), alongside receipts/adjustments/advances.
        //   CREDIT = money received from the customer (or an SO advance)
        //   DEBIT  = an invoice raised, OR money returned to them (a refund)
        //   Balance = ΣCR − ΣDR = net amount still receivable (unsigned on
        //   screen) — this is now a running "what they owe", not pure cash.
        const rows: RawRow[] = [];
        // Cash-movement rows only (receipts/advances/adjustments) — kept apart
        // from `rows` so the summary cards' "Total Received"/"Outstanding" math
        // below (which nets against invoice totals separately) doesn't double
        // count once invoice rows are appended to `rows` further down.
        const cashRows: RawRow[] = [];
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
                // Sales-doc convention: rate = doc-currency per ₹1, so
                // INR = amount × round2(1/rate). Receipt's own rate first
                // (rate at the time money came in), falling back to the
                // invoice's rate — same as the forex gain/loss calc.
                const rcptRate = num(p.exchange_rate) || num(inv?.exchange_rate) || 1;
                const amt = num(p.amount);
                cashRows.push({
                    date: p.payment_date,
                    type: 'receipt',
                    particulars: `Payment${
                        inv?.voucher_no ? ` of ${inv.voucher_no}` : ''
                    }`,
                    voucher_no: p.receipt_voucher_no,
                    dr: 0,
                    cr: amt,
                    dr_inr: 0,
                    cr_inr: round2(amt * (rcptRate > 0 ? round2(1 / rcptRate) : 1)),
                    created_at: p.createdAt,
                });
            }
        }

        // Sales-Order advance received → CREDIT (money in, before invoicing).
        // Dropped once the SO is invoiced (its invoice's advance receipt then
        // represents the same money).
        const soAdvances = await this.customerSoAdvances(companyId, customerId);
        for (const a of soAdvances) {
            if (a.value <= 0) continue;
            const rate = a.exchange_rate || 1;
            cashRows.push({
                date: a.date,
                type: 'advance',
                particulars: `Advance received${
                    a.voucher_no ? ` (${a.voucher_no})` : ''
                }`,
                voucher_no: a.voucher_no,
                dr: 0,
                cr: a.value,
                dr_inr: 0,
                cr_inr: round2(a.value * (rate > 0 ? round2(1 / rate) : 1)),
                created_at: a.created_at,
            });
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
            const amt = num(n.amount);
            // No rate is captured on the note itself — use the invoice it
            // settles (when linked); a bare party-level note in a foreign
            // currency has no rate to draw on, so it falls back to 1 (rare;
            // the vast majority of notes are either INR or document-linked).
            const linkedInv = n.document_id
                ? invoiceById.get(n.document_id.toString())
                : undefined;
            const noteRate = num(linkedInv?.exchange_rate) || 1;
            const rateInr = noteRate > 0 ? round2(1 / noteRate) : 1;
            cashRows.push({
                date: n.note_date,
                type: 'adjustment',
                // Name the document when the note was applied to one, so the
                // statement shows WHICH invoice/POV it settled. The note's own
                // free-text reason is deliberately left OUT (can be long/wrap
                // the Particulars column) — still visible on the note itself.
                particulars: n.document_voucher_no
                    ? `Adjustment against ${n.document_voucher_no}`
                    : 'Adjustment',
                voucher_no: n.voucher_no,
                dr: isDebit ? amt : 0,
                cr: isDebit ? 0 : amt,
                dr_inr: isDebit ? round2(amt * rateInr) : 0,
                cr_inr: isDebit ? 0 : round2(amt * rateInr),
                created_at: n.createdAt,
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
            invoices
                .filter((i) => i.status !== 'draft')
                .reduce((s, i) => s + num(i.grand_total), 0)
        );
        // INR equivalent — sales-doc convention (grand_total ÷ exchange_rate),
        // same as every report; each invoice's OWN rate, never today's rate.
        const totalBilledInr = round2(
            invoices
                .filter((i) => i.status !== 'draft')
                .reduce(
                    (s, i) =>
                        s + num(i.grand_total) / (num(i.exchange_rate) || 1),
                    0
                )
        );
        const totalPaid = round2(
            cashRows.reduce((s, r) => s + num(r.cr) - num(r.dr), 0)
        );
        const totalPaidInr = round2(
            cashRows.reduce(
                (s, r) => s + num(r.cr_inr ?? r.cr) - num(r.dr_inr ?? r.dr),
                0
            )
        );

        // Invoice Raised → DEBIT (client 2026-08-19): each non-draft invoice
        // now posts its own row alongside the cash rows above, so the
        // transaction-wise statement shows WHERE "Total Invoiced" comes from,
        // not just the summary card. Kept OUT of totalPaid/totalBilled above
        // (those stay card-accurate, sourced from `invoices`/`cashRows`) —
        // these rows only feed the on-screen/exported STATEMENT + its own
        // Total/Balance footer via `assemble()` below.
        for (const inv of invoices) {
            if (inv.status === 'draft') continue;
            const rate = num(inv.exchange_rate) || 1;
            const amt = num(inv.grand_total);
            rows.push({
                date: inv.invoice_date,
                type: 'invoice',
                particulars: `Invoice raised${
                    inv.voucher_no ? ` (${inv.voucher_no})` : ''
                }`,
                voucher_no: inv.voucher_no,
                dr: amt,
                cr: 0,
                dr_inr: round2(amt / rate),
                cr_inr: 0,
                created_at: inv.createdAt,
            });
        }
        rows.push(...cashRows);

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
            total_billed_inr: totalBilledInr,
            total_paid_inr: totalPaidInr,
            // openingOut has no captured rate (migrated as a flat figure) —
            // it has NO real INR figure, so it's excluded here entirely
            // (matches the ledger row's own dr_inr/cr_inr = 0 treatment).
            outstanding_inr: round2(totalBilledInr - totalPaidInr),
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
    // GRN goods-received → vendor CREDIT (client 2026-08-06). One row per GRN,
    // valued at Σ(accepted qty × unit price × (1−disc%) × (1+GST%)) — the
    // GST-inclusive billed value (client 2026-08-07) — in the vendor currency.
    // Only CONFIRMED GRNs post (a draft receipt is still being
    // entered). Returns one entry per GRN; callers map it to a ledger CR row /
    // a register row.
    private async vendorGrnCredits(
        companyId: string,
        vendorId?: string
    ): Promise<
        Array<{
            grn_id: string;
            voucher_no?: string;
            date: string;
            value: number;
            currency_code: string;
            exchange_rate: number;
            vendor_id?: string;
            created_at?: Date;
            po_vendor_voucher_no?: string;
        }>
    > {
        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
            status: ENUM_GRN_STATUS.CONFIRMED,
        };
        if (vendorId) find.vendor_id = vendorId;
        const grns: any[] = await this.grnRepository.findAll(find as any);
        if (!grns.length) return [];
        const grnIds = grns.map((g) => g._id.toString());
        const povIds = Array.from(
            new Set(
                grns.map((g) => g.po_vendor_id?.toString()).filter(Boolean)
            )
        ) as string[];
        const [grnLines, povLines, povs] = await Promise.all([
            this.grnLineRepository.findAll({
                grn_id: { $in: grnIds },
                soft_delete: false,
            } as any) as Promise<any[]>,
            povIds.length
                ? (this.povLineRepository.findAll({
                      po_vendor_id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
            povIds.length
                ? (this.povRepository.findAll({
                      _id: { $in: povIds },
                  } as any) as Promise<any[]>)
                : Promise.resolve([] as any[]),
        ]);
        // Keep the whole POV line (price + discount + GST rate), so the GRN
        // value can mirror what the vendor actually bills, not just the raw
        // goods value.
        const povLineById = new Map<string, any>();
        for (const pl of povLines) povLineById.set(pl._id.toString(), pl);
        const currencyByPovId = new Map<string, string>();
        const rateByPovId = new Map<string, number>();
        for (const pv of povs) {
            currencyByPovId.set(pv._id.toString(), pv.currency_code || 'INR');
            rateByPovId.set(pv._id.toString(), num(pv.exchange_rate) || 1);
        }
        // Value = Σ(accepted qty × unit price × (1 − disc%) × (1 + GST%)) — the
        // GST-INCLUSIVE amount for the received goods (client 2026-08-07), so a
        // partial GRN (e.g. 5 of 10 @ 18% GST) posts 5 × price × 1.18. Discount
        // is applied first, exactly like the POV line_total. "Received" =
        // good/accepted qty (the GRN's Received column); rejected units are
        // debit-noted separately. GST is 0 on a foreign POV (tax_pct = 0 there).
        const valueByGrn = new Map<string, number>();
        for (const l of grnLines) {
            const k = l.grn_id.toString();
            const pl = povLineById.get(l.po_vendor_line_id?.toString());
            const price = num(pl?.unit_price);
            const disc = num(pl?.discount_pct);
            const tax = num(pl?.tax_pct);
            const lineVal =
                num(l.accepted_qty) *
                price *
                (1 - disc / 100) *
                (1 + tax / 100);
            valueByGrn.set(k, (valueByGrn.get(k) || 0) + lineVal);
        }
        return grns.map((g) => ({
            grn_id: g._id.toString(),
            voucher_no: g.voucher_no,
            date: g.grn_date,
            value: round2(valueByGrn.get(g._id.toString()) || 0),
            currency_code: g.po_vendor_id
                ? currencyByPovId.get(g.po_vendor_id.toString()) || 'INR'
                : 'INR',
            exchange_rate: g.po_vendor_id
                ? rateByPovId.get(g.po_vendor_id.toString()) || 1
                : 1,
            vendor_id: g.vendor_id?.toString(),
            created_at: g.createdAt,
            po_vendor_voucher_no: g.po_vendor_voucher_no,
        }));
    }

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
            // Include draft so a draft POV's advance payment posts here; drafts
            // are dropped from total_billed below.
            status: { $in: LEDGER_POV_STATUSES_TXN },
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
            // POV convention: exchange_rate = INR per 1 unit of the POV
            // currency (multiply), the opposite direction of sales docs.
            const rate = num(pov.exchange_rate) || 1;
            for (const pay of pov.payments || []) {
                if (pay.voided_at) continue;
                const amt = num(pay.amount);
                rows.push({
                    date: pay.payment_date,
                    type: 'payment',
                    particulars: `Payment${
                        pov.voucher_no ? ` of ${pov.voucher_no}` : ''
                    }`,
                    voucher_no: pay.payment_voucher_no,
                    dr: amt,
                    cr: 0,
                    dr_inr: round2(amt * rate),
                    cr_inr: 0,
                    created_at: pay.createdAt,
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
                // statement shows WHICH invoice/POV it settled. The note's own
                // free-text reason is deliberately left OUT (can be long/wrap
                // the Particulars column) — still visible on the note itself.
                particulars: n.document_voucher_no
                    ? `Adjustment against ${n.document_voucher_no}`
                    : 'Adjustment',
                voucher_no: n.voucher_no,
                dr: isDebit ? eff : 0,
                cr: isDebit ? 0 : eff,
                // Vendor adjustment-note amount is always INR (see entity) —
                // no conversion needed.
                dr_inr: isDebit ? eff : 0,
                cr_inr: isDebit ? 0 : eff,
                created_at: n.createdAt,
            });
        }

        // Headline totals. Computed over ALL cash/adjustment rows (not the
        // from/to slice) — "what do we owe this vendor overall?" isn't a
        // date-range question. GRN rows are deliberately EXCLUDED here (they
        // get pushed into `rows` further below, for the on-screen/exported
        // statement + Balance footer only) — a GRN posts money BILLED, not
        // money PAID, so folding it into `totalPaid`'s ΣDR−ΣCR would count
        // the same bill twice once `totalBilled` (from POV order_value) is
        // also added in the `outstanding` formula below. Mirrors the customer
        // ledger's `cashRows`-before-`invoice-rows` split (see customer
        // method above) — same bug pattern, same fix.
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
            (povs as any[])
                .filter((p) => p.status !== 'draft')
                .reduce((s, p) => s + num(p.order_value), 0)
        );
        // INR equivalent — POV convention (order_value × exchange_rate), each
        // POV's OWN rate, never today's rate.
        const totalBilledInr = round2(
            (povs as any[])
                .filter((p) => p.status !== 'draft')
                .reduce(
                    (s, p) =>
                        s + num(p.order_value) * (num(p.exchange_rate) || 1),
                    0
                )
        );
        const totalPaid = round2(
            rows.reduce((s, r) => s + num(r.dr) - num(r.cr), 0)
        );
        const totalPaidInr = round2(
            rows.reduce(
                (s, r) => s + num(r.dr_inr ?? r.dr) - num(r.cr_inr ?? r.cr),
                0
            )
        );

        // GRN goods received → CREDIT (client 2026-08-06): GST-inclusive value
        // of goods received (accepted qty × price × (1−disc%) × (1+GST%),
        // vendor currency). Pushed AFTER the totals above so it flows into the
        // Balance column and the on-screen/exported statement, like a credit
        // note, WITHOUT double-counting into total_paid/outstanding (those
        // already capture it via `totalBilled`, sourced from the POV itself).
        const grnCredits = await this.vendorGrnCredits(companyId, vendorId);
        for (const g of grnCredits) {
            if (g.value <= 0) continue;
            rows.push({
                date: g.date,
                type: 'grn',
                particulars: `Goods received${
                    g.voucher_no ? ` (${g.voucher_no})` : ''
                }`,
                voucher_no: g.voucher_no,
                dr: 0,
                cr: g.value,
                dr_inr: 0,
                cr_inr: round2(g.value * (g.exchange_rate || 1)),
                created_at: g.created_at,
            });
        }
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
            total_billed_inr: totalBilledInr,
            total_paid_inr: totalPaidInr,
            // openingOut has no captured rate (migrated as a flat figure) —
            // it has NO real INR figure, so it's excluded here entirely
            // (matches the ledger row's own dr_inr/cr_inr = 0 treatment).
            outstanding_inr: round2(totalBilledInr - totalPaidInr),
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
                // Include draft so advance payments on draft POVs list here.
                status: { $in: LEDGER_POV_STATUSES_TXN },
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

            // GRN goods received → vendor CREDIT (client 2026-08-06). Same value
            // as the vendor ledger's GRN rows. Read-only (no void from here).
            const grnCredits = await this.vendorGrnCredits(
                companyId,
                q.party_id
            );
            const grnVendorIds = Array.from(
                new Set(grnCredits.map((g) => g.vendor_id).filter(Boolean))
            ) as string[];
            const grnVendors = grnVendorIds.length
                ? ((await this.vendorRepository.findAll({
                      _id: { $in: grnVendorIds },
                  } as any)) as any[])
                : [];
            const vendorNameById = new Map<string, string>(
                grnVendors.map((v) => [v._id.toString(), v.company_name])
            );
            for (const g of grnCredits) {
                if (g.value <= 0) continue;
                rows.push({
                    _id: g.grn_id,
                    source: 'grn',
                    date: toIso(g.date),
                    created_at: g.created_at as any,
                    voucher_no: g.voucher_no,
                    party_type: 'vendor',
                    party_id: g.vendor_id,
                    party_name: g.vendor_id
                        ? vendorNameById.get(g.vendor_id)
                        : undefined,
                    direction: 'credit',
                    amount: String(g.value),
                    currency_code: g.currency_code,
                    // Source Vendor PO → deep-link target (no GRN page route in
                    // the register today; the voucher still identifies it).
                    document_voucher_no: g.po_vendor_voucher_no || undefined,
                    particulars: `Goods received${
                        g.voucher_no ? ` (${g.voucher_no})` : ''
                    }`,
                });
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
                // Include draft so advance receipts on draft invoices list here.
                status: { $in: LEDGER_INVOICE_STATUSES_TXN },
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

            // Sales-Order advance received → customer CREDIT (money in). Same
            // rows + dedup as the customer ledger; read-only (no void here).
            const soAdvances = await this.customerSoAdvances(
                companyId,
                q.party_id
            );
            const advCustIds = Array.from(
                new Set(soAdvances.map((a) => a.customer_id).filter(Boolean))
            ) as string[];
            const advCustomers = advCustIds.length
                ? ((await this.customerRepository.findAll({
                      _id: { $in: advCustIds },
                  } as any)) as any[])
                : [];
            const advCustNameById = new Map<string, string>(
                advCustomers.map((c) => [
                    c._id.toString(),
                    c.company_name || c.name,
                ])
            );
            for (const a of soAdvances) {
                if (a.value <= 0) continue;
                rows.push({
                    _id: a.so_id,
                    source: 'advance',
                    date: toIso(a.date),
                    created_at: a.created_at as any,
                    voucher_no: a.voucher_no,
                    party_type: 'customer',
                    party_id: a.customer_id,
                    party_name: a.customer_id
                        ? advCustNameById.get(a.customer_id)
                        : undefined,
                    direction: 'credit',
                    amount: String(a.value),
                    currency_code: a.currency_code,
                    // Source Sales Order → deep-link target.
                    document_voucher_no: a.voucher_no || undefined,
                    document_id: a.so_id,
                    particulars: `Advance received${
                        a.voucher_no ? ` (${a.voucher_no})` : ''
                    }`,
                });
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
        // Sort by date, then bills/invoices before their payments on the same
        // day, then by creation time so same-day rows read in the order they
        // were actually recorded (dates are date-only; without this a payment
        // could sort above a GRN booked earlier the same day).
        const rank = (t: string) =>
            t === 'invoice' || t === 'bill' ? 0 : 1;
        const stamp = (r: RawRow) =>
            r.created_at ? new Date(r.created_at).getTime() : 0;
        inRange.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            const rk = rank(a.type) - rank(b.type);
            if (rk !== 0) return rk;
            return stamp(a) - stamp(b);
        });

        let bal = 0;
        let totalDr = 0;
        let totalCr = 0;
        let balInr = 0;
        let totalDrInr = 0;
        let totalCrInr = 0;
        const rows: LedgerRowDto[] = [];
        // Migration opening balance — always the FIRST row and NOT date-filtered
        // (it is the carried-forward balance at migration). Seeds the running
        // NATIVE balance/totals so everything below flows from it. No rate was
        // captured at migration, so it has NO real INR figure — it contributes
        // 0 to the INR totals/running balance (rather than a fake 1:1
        // native-as-INR value), so the table's INR footer stays consistent
        // with the "Total Received"/"Outstanding" summary cards, which already
        // exclude it (see customerLedger/vendorLedger outstanding_inr).
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
                dr_inr: 0,
                cr_inr: 0,
                balance_inr: 0,
            });
        }
        for (const r of inRange) {
            const dr = round2(r.dr);
            const cr = round2(r.cr);
            const drInr = round2(r.dr_inr ?? r.dr);
            const crInr = round2(r.cr_inr ?? r.cr);
            totalDr = round2(totalDr + dr);
            totalCr = round2(totalCr + cr);
            totalDrInr = round2(totalDrInr + drInr);
            totalCrInr = round2(totalCrInr + crInr);
            bal = round2(bal + (debitPositive ? dr - cr : cr - dr));
            balInr = round2(
                balInr + (debitPositive ? drInr - crInr : crInr - drInr)
            );
            rows.push({
                date: r.date,
                type: r.type,
                particulars: r.particulars,
                voucher_no: r.voucher_no,
                dr,
                cr,
                balance: bal,
                dr_inr: drInr,
                cr_inr: crInr,
                balance_inr: balInr,
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
            total_dr_inr: totalDrInr,
            total_cr_inr: totalCrInr,
            balance_inr: balInr,
        };
    }

    // ── Excel export ──
    async ledgerExcel(ledger: LedgerResponseDto): Promise<Buffer> {
        const sym = ledger.currency_code;
        const aoa: (string | number)[][] = [
            [`${ledger.party_name || ''} — Ledger (${sym})`],
            [
                'Date',
                'Particulars',
                'Voucher',
                'Debit',
                'Credit',
                'Balance',
                'Debit (INR)',
                'Credit (INR)',
                'Balance (INR)',
            ],
            ...ledger.rows.map((r) => [
                // DD-MM-YYYY to match the on-screen statement.
                r.date ? r.date.split('-').reverse().join('-') : '',
                r.particulars,
                r.voucher_no || '',
                r.dr || '',
                r.cr || '',
                r.balance,
                // Opening Balance has no captured exchange rate (flat migrated
                // figure) — its INR value would just equal the native one,
                // which reads as a bug rather than a real conversion.
                r.type === 'opening' ? '' : r.dr_inr || '',
                r.type === 'opening' ? '' : r.cr_inr || '',
                r.type === 'opening' ? '' : r.balance_inr,
            ]),
            [
                '',
                'Total',
                '',
                ledger.total_dr,
                ledger.total_cr,
                ledger.balance,
                ledger.total_dr_inr,
                ledger.total_cr_inr,
                ledger.balance_inr,
            ],
        ];
        return this.fileService.writeExcelFromArray(aoa as any);
    }
}
