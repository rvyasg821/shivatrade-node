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

        // Column convention (matches the vendor ledger for a consistent look):
        //   CREDIT = a charge that increases what the party owes (invoice)
        //   DEBIT  = a receipt/relief that reduces it (payment)
        //   Balance = ΣCR − ΣDR = amount receivable from the customer.
        const rows: RawRow[] = [];
        const invoiceById = new Map<string, any>();
        for (const inv of invoices) {
            invoiceById.set(inv._id.toString(), inv);
            rows.push({
                date: inv.invoice_date,
                type: 'invoice',
                particulars: 'Sales Invoice',
                voucher_no: inv.voucher_no,
                dr: 0,
                cr: num(inv.grand_total),
            });
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
                    particulars: `Receipt${
                        inv?.voucher_no ? ` vs ${inv.voucher_no}` : ''
                    }`,
                    voucher_no: p.receipt_voucher_no,
                    dr: num(p.amount),
                    cr: 0,
                });
            }
        }

        // Adjustment notes (customer): the note's own direction maps to the
        // same column — a Debit note (e.g. a damage refund) → DEBIT (reduces
        // receivable), a Credit note (extra charge) → CREDIT (increases it).
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
                particulars: `Adjustment: ${n.reason || ''}`.slice(0, 200),
                voucher_no: n.voucher_no,
                dr: isDebit ? num(n.amount) : 0,
                cr: isDebit ? 0 : num(n.amount),
            });
        }

        const currency =
            customer.currency ||
            invoices[0]?.currency_code ||
            'INR';
        return this.assemble(
            'customer',
            customerId,
            customer.company_name,
            currency,
            rows,
            from,
            to,
            /* debitPositive */ false
        );
    }

    // ── Vendor ledger (always INR) ──
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

        // Reuse PoVendorService.mapList so order_value (lines + charges + GST)
        // and payments match the POV's own computed figures exactly.
        const povRows: any[] = await this.povRepository.findAll({
            company_id: companyId,
            vendor_id: vendorId,
            soft_delete: false,
            status: { $in: LEDGER_POV_STATUSES },
        } as any);
        const povs = await this.povService.mapList(povRows as any);
        // po_date (a date-only column) lives on the raw rows, not the mapped
        // DTO — use it so bills carry a clean date, not the createdAt timestamp.
        const rawById = new Map(
            (povRows as any[]).map((r) => [r._id.toString(), r])
        );

        // Column convention (client rule): the purchase/bill you owe = DEBIT;
        // your payment and any vendor credit-note (money back) = CREDIT.
        // Balance = ΣDR − ΣCR = amount payable to the vendor.
        const rows: RawRow[] = [];
        for (const pov of povs as any[]) {
            const raw = rawById.get((pov as any)._id?.toString());
            rows.push({
                date: raw?.po_date || (pov as any).createdAt,
                type: 'bill',
                particulars: 'Vendor PO',
                voucher_no: pov.voucher_no,
                dr: num(pov.order_value),
                cr: 0,
            });
            for (const pay of pov.payments || []) {
                if (pay.voided_at) continue;
                rows.push({
                    date: pay.payment_date,
                    type: 'payment',
                    particulars: `Payment${
                        pay.invoice_number ? ` vs ${pay.invoice_number}` : ''
                    }`,
                    voucher_no: pay.payment_voucher_no,
                    dr: 0,
                    cr: num(pay.amount),
                });
            }
        }

        // Adjustment notes (vendor): debit → DR (owe more), credit → CR (owe less).
        const notes = await this.adjustmentRepository.findActiveByParty(
            companyId,
            'vendor',
            vendorId
        );
        for (const n of notes as any[]) {
            if (n.voided_at) continue;
            const isDebit = n.direction === ENUM_ADJUSTMENT_DIRECTION.DEBIT;
            rows.push({
                date: n.note_date,
                type: 'adjustment',
                particulars: `Adjustment: ${n.reason || ''}`.slice(0, 200),
                voucher_no: n.voucher_no,
                dr: isDebit ? num(n.amount) : 0,
                cr: isDebit ? 0 : num(n.amount),
            });
        }

        return this.assemble(
            'vendor',
            vendorId,
            vendor.company_name,
            'INR',
            rows,
            from,
            to,
            /* debitPositive */ true
        );
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
        debitPositive: boolean
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
        const rows: LedgerRowDto[] = inRange.map((r) => {
            const dr = round2(r.dr);
            const cr = round2(r.cr);
            totalDr = round2(totalDr + dr);
            totalCr = round2(totalCr + cr);
            bal = round2(bal + (debitPositive ? dr - cr : cr - dr));
            return {
                date: r.date,
                type: r.type,
                particulars: r.particulars,
                voucher_no: r.voucher_no,
                dr,
                cr,
                balance: bal,
            };
        });

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
