import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PURCHASE_ORDER_LINE_COLLECTION_NAME } from '../../constants/purchase-order.entity.constant';

@Entity(PURCHASE_ORDER_LINE_COLLECTION_NAME)
export class PurchaseOrderLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    purchase_order_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Planned vendor for this line. PO is per-customer; vendor lives on
     *  the line (industry-standard multi-vendor PO model — Tally / Zoho).
     *  POVs draw from PO lines whose vendor_id matches. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    /** Vendor's bill-from address for this line (auto-pick default). */
    @Column({ type: 'uuid', nullable: true })
    vendor_address_id?: string;

    /** Traceability back to source Quotation line (if PO created from Q). */
    @Column({ type: 'uuid', nullable: true })
    source_quotation_line_id?: string;

    /** Traceability back to source PFI line (if PO created from PFI). */
    @Column({ type: 'uuid', nullable: true })
    source_pfi_line_id?: string;

    /** Snapshot of product description at PO creation time. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Buyer's Requirement # — propagated from pfi_line / quotation_line;
     *  flows forward to invoice_line + appears on Export Invoice PDF. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    customer_reference?: string;

    /** Vendor/manufacturer part number — snapshot from product, overridable. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    part_no?: string;

    /** Snapshot from product master. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    hsn_code?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    /** INR; pre-filled from
     *  `vendorPriceList.findCurrentPrice(companyId, vendorId, productId)`. */
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: true,
        default: 0,
    })
    discount_pct?: string;

    /** Vendor GST rate (% e.g. 18). */
    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_pct: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    cgst: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    sgst: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    igst: string;

    /** Line subtotal pre-tax (qty × price − discount) */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    taxable: string;

    /** Including tax */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    line_total: string;

    // ── Costing snapshot (propagated from the source Quotation line) ─────
    // The SO's own `unit_price` is the VENDOR cost; the customer-facing sales
    // value is cost + margin (± expenses/rebates). Historically the SO stored
    // none of this and re-read the quotation at calc time — which meant the
    // snapshot never reached the Invoice, collapsing its taxable/assessable
    // value to the purchase cost. We now freeze the costing here (same shape
    // as quotation_line) so it carries forward Quotation → SO → Invoice.
    @Column({ type: 'jsonb', nullable: true, default: null })
    product_rebates_snapshot?: Array<{
        rebate_id: string;
        code?: string;
        name?: string;
        pct: string;
    }>;

    @Column({ type: 'jsonb', nullable: true, default: null })
    product_expenses_snapshot?: Array<{
        expense_id: string;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_rebates_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_expenses_amount: string;

    /** Per-line margin %, frozen from the source Quotation line. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    margin_pct?: string;

    /** Computed: (taxable + product_expenses_amount − product_rebates_amount)
     *  × margin_pct/100. Frozen from the source Quotation line. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    margin_amount: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    // ── Packing snapshot (propagated from quotation/pfi line) ───────────
    // qty × product per-unit weight, user-overridable upstream. Carried
    // forward to invoice_line for the Commercial Invoice / Packing List.
    @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true })
    net_weight_kg?: string;

    @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true })
    gross_weight_kg?: string;

    /** Number of packages contributed by this line. */
    @Column({ type: 'int', nullable: true })
    package_count?: number;
}

export type PurchaseOrderLineDoc = PurchaseOrderLineEntity;
