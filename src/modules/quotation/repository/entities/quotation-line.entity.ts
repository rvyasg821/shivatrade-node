import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { QUOTATION_LINE_COLLECTION_NAME } from '../../constants/quotation.entity.constant';

@Entity(QUOTATION_LINE_COLLECTION_NAME)
export class QuotationLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    quotation_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Vendor selected for this line (from price list). Drives PO grouping. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    // ── Source / traceability ──
    /** Price-list row the unit_price/vendor were auto-picked from. */
    @Column({ type: 'uuid', nullable: true })
    price_list_id?: string;

    /** RFQ that ultimately sourced this price (carried from the price-list
     *  row's source_rfq_id). Completes the Lead → RFQ → Price → Quote trace. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    source_rfq_id?: string;

    /** Denormalized RFQ voucher no for the "from RFQ …" badge on the line. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    source_rfq_voucher_no?: string;

    /** Snapshot of product description at quote time. */
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Buyer's Requirement # — buyer's internal part code / requisition number.
     *  Propagated from Quotation → PFI → PO → Invoice. Appears on the
     *  Export Invoice PDF as the "Requirement # (PFI)" column. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    customer_reference?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    discount_pct?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    tax_pct?: string;

    /** Per-line tax allocation snapshots — populated by tax engine. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    cgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    sgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    igst?: string;

    /** taxable amount = (qty × unit_price) − discount. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    taxable: string;

    /** taxable + cgst + sgst + igst. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    line_total: string;

    /** Snapshot of product master's rebates at line-save time. Each entry:
     *  { rebate_id, code, name, pct }. `pct` is the effective rate (override
     *  on product link if present, else master's pct). Lets recompute apply
     *  per-line rebates without re-reading masters and shields old quotes
     *  from rate changes. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    product_rebates_snapshot?: Array<{
        rebate_id: string;
        code?: string;
        name?: string;
        pct: string;
    }>;

    /** Same idea for expenses. type='percent' applies value as % of line
     *  taxable; type='amount' applies value as flat per-line. */
    @Column({ type: 'jsonb', nullable: true, default: null })
    product_expenses_snapshot?: Array<{
        expense_id: string;
        code?: string;
        name?: string;
        type: string;
        value: string;
    }>;

    /** Sum of rebate amounts derived from product_rebates_snapshot.
     *  Cached for fast totals without re-iterating the jsonb array. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_rebates_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    product_expenses_amount: string;

    /** Per-line margin %. Seeded from header.margin_pct on create; user can
     *  override per line. Header margin_pct stays as the default-for-new-lines
     *  seed only — the authoritative margin lives here. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    margin_pct?: string;

    /** Computed: (taxable + product_expenses_amount − product_rebates_amount)
     *  × margin_pct/100. Cached so totals don't re-iterate. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    margin_amount: string;

    /** Display order in the quotation document. */
    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    // ── Export / Shipping fields (mirrors PFI line). Optional on quote;
    //   become authoritative once the line is copied into a PFI. ──

    /** Vendor/manufacturer part number — auto-filled from product, overridable. */
    @Column({ type: 'varchar', length: 120, nullable: true })
    part_no?: string;

    /** HS / HSN code — auto-filled from product.hsn_code, overridable. */
    @Column({ type: 'varchar', length: 15, nullable: true })
    hs_code?: string;

    /** qty × product.net_weight_per_unit; user may override. */
    @Column({
        type: 'numeric',
        precision: 14,
        scale: 3,
        nullable: false,
        default: 0,
    })
    net_weight_kg: string;

    /** qty × product.gross_weight_per_unit; user may override. */
    @Column({
        type: 'numeric',
        precision: 14,
        scale: 3,
        nullable: false,
        default: 0,
    })
    gross_weight_kg: string;

    /** Number of packages contributed by this line. */
    @Column({ type: 'int', nullable: false, default: 0 })
    package_count: number;
}

export type QuotationLineDoc = QuotationLineEntity;
