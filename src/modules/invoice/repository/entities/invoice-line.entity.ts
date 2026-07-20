import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { INVOICE_LINE_COLLECTION_NAME } from '../../constants/invoice.entity.constant';

/**
 * Invoice line item - snapshot from PO line (which itself snapshots from PFI/Quotation).
 * `hsn_code` + `uqc_code` are required at ISSUED time:
 *   - hsn_code → prints on the Commercial Invoice line table
 *   - uqc_code → GST-compliant unit code for GSTR-1 + Shipping Bill (NOS / KGS / MTR ...)
 * `igst_rate_pct` drives the per-HSN-rate refund-footer bucket aggregation.
 */
@Entity(INVOICE_LINE_COLLECTION_NAME)
export class InvoiceLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    invoice_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    /**
     * Source PO (Sales Order) line — Invoice's qty guard is
     * `qty ≤ po_line.qty − already_invoiced`. Nullable ONLY to support the
     * bulk historical-import path (decision 5): a back-filled invoice may have
     * no Sales Order in the system. The normal API create still requires it
     * (`@IsNotEmpty` on InvoiceLineDto), so live invoices always carry it.
     */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    purchase_order_line_id?: string;

    /** Source POV line (optional) - Invoice can be raised from a closed POV's lines. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    po_vendor_line_id?: string;

    // ── Product snapshot ──
    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    product_name: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    product_code?: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    part_no?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    hsn_code?: string;

    /** "Requirement number" / PO/PFI reference from PFI. */
    @Column({ type: 'varchar', length: 200, nullable: true })
    customer_reference?: string;

    // ── UOM (operator-facing + GST-compliant) ──
    @Column({ type: 'varchar', length: 20, nullable: false })
    unit: string;

    /** UQC code (NOS, KGS, MTR, LTR, SET, PCS, BOX, PAC, TON, SQM, CBM, GMS, MLT, DOZ). */
    @Column({ type: 'varchar', length: 10, nullable: true })
    uqc_code?: string;

    // ── Quantities + price ──
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    qty: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    unit_price: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: false, default: 0 })
    discount_pct: string;

    /** Per-line margin %, carried from the source Quotation/PO line so the
     *  invoice costing equals the source. Applied in recompute():
     *  margin = (taxable + expenses − rebates) × margin_pct/100. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: false, default: 0 })
    margin_pct: string;

    /** Always 0 on export rows; reserved for future domestic. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: false, default: 0 })
    tax_pct: string;

    // ── Computed amounts ──
    /** qty × unit_price − discount; before tax (always = line_total on export). */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    taxable_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    cgst_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    sgst_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    igst_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    line_total: string;

    /** HSN-derived IGST rate for refund-footer bucketing (5 / 12 / 18 / 28). */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: false, default: 0 })
    igst_rate_pct: string;

    /**
     * Per-line rebates / expenses snapshot — mirrors Quotation/PFI/PO line shape.
     * Editable on DRAFT, frozen on ISSUED. Fed into `taxable_amount` via
     * `recompute()`. Pre-filled from the source PO line at create time.
     *
     * Each entry: { rebate_id?|expense_id?, code?, name, type: 'percent'|'fixed', pct?: string, amount?: string }
     */
    @Column({ type: 'jsonb', nullable: true })
    product_rebates_snapshot?: any;

    @Column({ type: 'jsonb', nullable: true })
    product_expenses_snapshot?: any;

    // ── Packing List (per-line; SHIPPING_INVOICE_MERGE_PLAN §3b) ──
    @Column({ type: 'int', nullable: true })
    packages?: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    net_weight?: string;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    gross_weight?: string;

    // ── Source-doc voucher snapshots (carry refs when bundling multiple SOs) ──
    /** SO (purchase_order) voucher — snapshot from the source PO at create. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    purchase_order_voucher_no?: string;

    /** Quotation voucher — snapshot from PO → PFI → Quotation at create. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    quotation_voucher_no?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type InvoiceLineDoc = InvoiceLineEntity;
