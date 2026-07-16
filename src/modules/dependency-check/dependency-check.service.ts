import { Injectable, BadRequestException } from '@nestjs/common';
import { RfqRepository } from '@modules/rfq/repository/repositories/rfq.repository';
import { QuotationRepository } from '@modules/quotation/repository/repositories/quotation.repository';
import { PurchaseOrderRepository } from '@modules/purchase-order/repository/repositories/purchase-order.repository';
import { InvoiceRepository } from '@modules/invoice/repository/repositories/invoice.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { DebitNoteRepository } from '@modules/grn/repository/repositories/debit-note.repository';
import { PriceListRepository } from '@modules/price-list/repository/repositories/price-list.repository';
import { RfqVendorRepository } from '@modules/rfq/repository/repositories/rfq-vendor.repository';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { LeadRepository } from '@modules/lead/repository/repositories/lead.repository';
import { AdjustmentNoteRepository } from '@modules/adjustment-note/repository/repositories/adjustment-note.repository';

export interface DependencySummary {
    total: number;
    dependents: { label: string; count: number }[];
}

interface DependencyRule {
    label: string;
    repo: { getTotal(find?: Record<string, any>): Promise<number> };
    field: string;
}

/**
 * Counts the live (non-deleted) downstream documents that reference a given
 * source document, so the UI can warn before deleting something that's mid-
 * pipeline. The chain is snapshot-based (each doc copies data forward), so a
 * delete never corrupts downstream records — this is an informational guard,
 * not a hard block. Lead → RFQ → Quotation → Sales Order → { Invoice, POV →
 * GRN → Debit Note }.
 */
@Injectable()
export class DependencyCheckService {
    constructor(
        private readonly rfqRepository: RfqRepository,
        private readonly quotationRepository: QuotationRepository,
        private readonly purchaseOrderRepository: PurchaseOrderRepository,
        private readonly invoiceRepository: InvoiceRepository,
        private readonly poVendorRepository: PoVendorRepository,
        private readonly grnRepository: GrnRepository,
        private readonly debitNoteRepository: DebitNoteRepository,
        private readonly priceListRepository: PriceListRepository,
        private readonly rfqVendorRepository: RfqVendorRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly leadRepository: LeadRepository,
        private readonly adjustmentNoteRepository: AdjustmentNoteRepository
    ) {}

    private rulesFor(type: string): DependencyRule[] | null {
        switch (type) {
            case 'lead':
                return [
                    { label: 'RFQ', repo: this.rfqRepository, field: 'lead_id' },
                    { label: 'Quotation', repo: this.quotationRepository, field: 'lead_id' },
                ];
            case 'rfq':
                return [
                    { label: 'Quotation', repo: this.quotationRepository, field: 'rfq_id' },
                ];
            case 'quotation':
                return [
                    { label: 'Sales Order', repo: this.purchaseOrderRepository, field: 'quotation_id' },
                    { label: 'Invoice', repo: this.invoiceRepository, field: 'quotation_id' },
                ];
            case 'purchase_order':
                return [
                    { label: 'Invoice', repo: this.invoiceRepository, field: 'purchase_order_id' },
                    { label: 'Vendor PO', repo: this.poVendorRepository, field: 'purchase_order_id' },
                    { label: 'GRN', repo: this.grnRepository, field: 'purchase_order_id' },
                    { label: 'Debit Note', repo: this.debitNoteRepository, field: 'purchase_order_id' },
                ];
            case 'po_vendor':
                return [
                    { label: 'GRN', repo: this.grnRepository, field: 'po_vendor_id' },
                    { label: 'Debit Note', repo: this.debitNoteRepository, field: 'po_vendor_id' },
                ];
            case 'grn':
                return [
                    { label: 'Debit Note', repo: this.debitNoteRepository, field: 'grn_id' },
                ];
            default:
                return null;
        }
    }

    async check(type: string, id: string): Promise<DependencySummary> {
        const rules = this.rulesFor(type);
        if (!rules) {
            throw new BadRequestException(`Unsupported dependency type '${type}'`);
        }

        const dependents: { label: string; count: number }[] = [];
        let total = 0;
        for (const rule of rules) {
            // FK ids are globally-unique UUIDs, so a FK match is enough (no need
            // to also scope by company). getTotal() already excludes base-deleted
            // rows; add soft_delete:false for the app-level flag.
            const count = await rule.repo.getTotal({
                [rule.field]: id,
                soft_delete: false,
            });
            if (count > 0) {
                dependents.push({ label: rule.label, count });
                total += count;
            }
        }
        return { total, dependents };
    }

    /**
     * Throws a friendly BadRequest listing the linked documents if any exist.
     * Callers use this at the top of a delete flow to hard-block deletion of a
     * document that still has downstream records.
     */
    async assertNoDependents(
        type: string,
        id: string,
        entityName: string
    ): Promise<void> {
        const summary = await this.check(type, id);
        if (summary.total > 0) {
            const parts = summary.dependents.map(
                (d) => `${d.count} ${d.label}${d.count > 1 ? 's' : ''}`
            );
            throw new BadRequestException(
                `Cannot delete this ${entityName} — it has linked ${parts.join(
                    ', '
                )}. Cancel or remove those first.`
            );
        }
    }

    /**
     * Vendor is a MASTER record (soft-delete + revive). Block its deletion when
     * any live document still uses it — PO-Vendor / Purchase-Order / GRN /
     * Debit-Note / Price-List (parent vendor_id) plus RFQ (rfq-vendor row) and
     * Quotation (quotation-line). Presence-based (child tables count lines, not
     * docs), so the message names the types, not counts.
     */
    async assertVendorNotInUse(vendorId: string): Promise<void> {
        const used: string[] = [];
        const check = async (label: string, count: Promise<number>) => {
            if ((await count) > 0) used.push(label);
        };
        await check(
            'PO-Vendor records',
            this.poVendorRepository.getTotal({ vendor_id: vendorId, soft_delete: false } as any)
        );
        await check(
            'Purchase Orders',
            this.purchaseOrderRepository.getTotal({ vendor_id: vendorId, soft_delete: false } as any)
        );
        await check(
            'GRNs',
            this.grnRepository.getTotal({ vendor_id: vendorId, soft_delete: false } as any)
        );
        await check(
            'Debit Notes',
            this.debitNoteRepository.getTotal({ vendor_id: vendorId, soft_delete: false } as any)
        );
        await check(
            'Price Lists',
            this.priceListRepository.getTotal({ vendor_id: vendorId } as any)
        );
        await check(
            'RFQs',
            this.rfqVendorRepository.getTotal({ vendor_id: vendorId, soft_delete: false } as any)
        );
        await check(
            'Quotations',
            this.quotationLineRepository.getTotal({ vendor_id: vendorId } as any)
        );
        await check(
            'Adjustment Notes',
            this.adjustmentNoteRepository.getTotal({
                party_type: 'vendor',
                party_id: vendorId,
                soft_delete: false,
            } as any)
        );

        if (used.length > 0) {
            throw new BadRequestException(
                `Cannot delete this Vendor — it is still used by ${used.join(
                    ', '
                )}. Remove or reassign those first.`
            );
        }
    }

    /**
     * Customer is a MASTER record (soft-delete + revive). Block its deletion
     * when any live document still uses it — Lead (linked or converted),
     * Quotation, Sales Order, or Invoice. All are parent-level `customer_id`.
     */
    async assertCustomerNotInUse(customerId: string): Promise<void> {
        const used: string[] = [];
        const check = async (label: string, count: Promise<number>) => {
            if ((await count) > 0) used.push(label);
        };
        await check(
            'Leads',
            this.leadRepository.getTotal({
                $or: [
                    { customer_id: customerId },
                    { converted_customer_id: customerId },
                ],
                soft_delete: false,
            } as any)
        );
        await check(
            'Quotations',
            this.quotationRepository.getTotal({ customer_id: customerId, soft_delete: false } as any)
        );
        await check(
            'Sales Orders',
            this.purchaseOrderRepository.getTotal({ customer_id: customerId, soft_delete: false } as any)
        );
        await check(
            'Invoices',
            this.invoiceRepository.getTotal({ customer_id: customerId, soft_delete: false } as any)
        );
        await check(
            'Adjustment Notes',
            this.adjustmentNoteRepository.getTotal({
                party_type: 'customer',
                party_id: customerId,
                soft_delete: false,
            } as any)
        );

        if (used.length > 0) {
            throw new BadRequestException(
                `Cannot delete this Customer — it is still used by ${used.join(
                    ', '
                )}. Remove or reassign those first.`
            );
        }
    }
}
