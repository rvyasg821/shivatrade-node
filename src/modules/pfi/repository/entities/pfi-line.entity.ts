import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PFI_LINE_COLLECTION_NAME } from '../../constants/pfi.entity.constant';

@Entity(PFI_LINE_COLLECTION_NAME)
export class PfiLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    pfi_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Vendor selected on the PFI line — copied from source quotation_line. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

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

    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: true,
        default: 0,
    })
    tax_pct?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: true,
        default: 0,
    })
    cgst?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: true,
        default: 0,
    })
    sgst?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: true,
        default: 0,
    })
    igst?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    taxable: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    line_total: string;

    /** Snapshot of product master's rebates at line-save time — same
     *  semantics as quotation_line.product_rebates_snapshot. */
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

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    product_rebates_amount: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    product_expenses_amount: string;

    /** Per-line margin %. Copied from source quotation_line on
     *  createFromQuotation, or auto-filled from price-list on line save. */
    @Column({
        type: 'numeric',
        precision: 5,
        scale: 2,
        nullable: true,
        default: 0,
    })
    margin_pct?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    margin_amount: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;

    // ── Export-document line fields (Phase 2) ──
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

export type PfiLineDoc = PfiLineEntity;
