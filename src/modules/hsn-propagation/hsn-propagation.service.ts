import { Injectable, Logger } from '@nestjs/common';
import { QuotationLineRepository } from '@modules/quotation/repository/repositories/quotation-line.repository';
import { PurchaseOrderLineRepository } from '@modules/purchase-order/repository/repositories/purchase-order-line.repository';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { DebitNoteLineRepository } from '@modules/grn/repository/repositories/debit-note-line.repository';
import { InvoiceLineRepository } from '@modules/invoice/repository/repositories/invoice-line.repository';
import { LeadLineRepository } from '@modules/lead/repository/repositories/lead-line.repository';
import { RfqLineRepository } from '@modules/rfq/repository/repositories/rfq-line.repository';

export interface HsnPropagationResult {
    hsn_code: string;
    total: number;
    updated: { label: string; count: number }[];
}

/**
 * Pushes a product's HSN code onto EVERY existing document line that uses that
 * product — the opposite of the normal snapshot rule (where each line keeps the
 * HSN it copied at creation time). Triggered explicitly from the product form.
 *
 * Scope is deliberately broad, per the client's requirement:
 *   - ALL document statuses (drafts and finalized/issued alike)
 *   - OVERWRITES any per-line HSN, including manual overrides
 *
 * The line's HSN column differs by module: Quotation / Lead / RFQ use `hs_code`,
 * everything else uses `hsn_code`. Invoice's three PDFs (commercial, export,
 * packing list) all render from invoice_line.hsn_code, so one update covers all
 * three.
 */
@Injectable()
export class HsnPropagationService {
    private readonly logger = new Logger(HsnPropagationService.name);

    constructor(
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly purchaseOrderLineRepository: PurchaseOrderLineRepository,
        private readonly poVendorLineRepository: PoVendorLineRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly debitNoteLineRepository: DebitNoteLineRepository,
        private readonly invoiceLineRepository: InvoiceLineRepository,
        private readonly leadLineRepository: LeadLineRepository,
        private readonly rfqLineRepository: RfqLineRepository
    ) {}

    /**
     * Set `hsnCode` on every line (any status) that references `productId` for
     * this company. Returns a per-document count of rows changed.
     */
    async propagate(
        companyId: string,
        productId: string,
        hsnCode: string
    ): Promise<HsnPropagationResult> {
        const value = (hsnCode || '').trim();

        // label → [repository, hsn column]
        const targets: {
            label: string;
            repo: {
                updateMany(
                    find: Record<string, any>,
                    data: any
                ): Promise<{ affected: number }>;
            };
            field: 'hs_code' | 'hsn_code';
        }[] = [
            { label: 'Lead', repo: this.leadLineRepository, field: 'hs_code' },
            { label: 'RFQ', repo: this.rfqLineRepository, field: 'hs_code' },
            {
                label: 'Quotation',
                repo: this.quotationLineRepository,
                field: 'hs_code',
            },
            {
                label: 'Sales Order',
                repo: this.purchaseOrderLineRepository,
                field: 'hsn_code',
            },
            {
                label: 'Vendor PO',
                repo: this.poVendorLineRepository,
                field: 'hsn_code',
            },
            { label: 'GRN', repo: this.grnLineRepository, field: 'hsn_code' },
            {
                label: 'Debit Note',
                repo: this.debitNoteLineRepository,
                field: 'hsn_code',
            },
            {
                label: 'Invoice',
                repo: this.invoiceLineRepository,
                field: 'hsn_code',
            },
        ];

        const updated: { label: string; count: number }[] = [];
        let total = 0;
        for (const t of targets) {
            const res = await t.repo.updateMany(
                { product_id: productId, company_id: companyId },
                { [t.field]: value }
            );
            const count = res.affected || 0;
            if (count > 0) {
                updated.push({ label: t.label, count });
                total += count;
            }
        }

        this.logger.log(
            `HSN '${value}' propagated to ${total} line(s) for product ${productId}`
        );
        return { hsn_code: value, total, updated };
    }
}
