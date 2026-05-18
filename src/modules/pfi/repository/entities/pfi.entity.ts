import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PFI_STATUS } from '../../enums/pfi.enum';
import { PFI_COLLECTION_NAME } from '../../constants/pfi.entity.constant';

@Entity(PFI_COLLECTION_NAME)
export class PfiEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/PI0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    /** Source Quotation - set when PFI was created via createFromQuotation. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    quotation_id?: string;

    /** Denormalised lead link for filtering - copied from source Quotation. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    lead_id?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    customer_id: string;

    @Column({ type: 'uuid', nullable: true })
    customer_address_id?: string;

    @Column({ type: 'date', nullable: false })
    pfi_date: string;

    @Column({ type: 'date', nullable: true })
    valid_until?: string;

    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    currency_code: string;

    @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
    exchange_rate?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    payment_terms?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    delivery_terms?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    delivery_location?: string;

    @Column({ type: 'text', nullable: true })
    notes_to_client?: string;

    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    // ── Costing snapshot (recomputed on save) ──
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    subtotal: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    expenses_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    rebates_total: string;

    /** Effective per-product totals (zeroed when skip_product_costing=true). */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    product_expenses_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    product_rebates_total: string;

    /** Opt out of per-line product rebates/expenses (e.g. when the
     *  customer-facing rebate is already captured at quote level). */
    @Column({ type: 'boolean', default: false })
    skip_product_costing: boolean;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
    margin_pct?: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    margin_amount: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_total: string;

    /** Home-currency (INR) rounding adjustment — the ± difference applied to
     *  the raw home grand total to reach a whole-rupee figure. GST-compliant
     *  "Round Off" line. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    round_off: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    grand_total: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_PFI_STATUS.DRAFT,
    })
    status: ENUM_PFI_STATUS;

    @Column({ type: 'int', nullable: false, default: 1 })
    version: number;

    @Column({ type: 'uuid', nullable: true })
    parent_version_id?: string;

    // ── Consignee (optional; falls back to buyer in public DTO/PDF) ──
    @Column({ type: 'varchar', length: 200, nullable: true })
    consignee_name?: string;

    @Column({ type: 'text', nullable: true })
    consignee_address?: string;

    // ── Shipping ──
    @Column({ type: 'varchar', length: 150, nullable: true })
    port_of_loading?: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    port_of_discharge?: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    final_destination?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country_of_origin?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    country_of_final_destination?: string;

    /** enum: `sea` / `air` / `road` */
    @Column({ type: 'varchar', length: 20, nullable: true })
    mode_of_shipment?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    container_details?: string;

    @Column({ type: 'date', nullable: true })
    est_shipment_date?: string;

    @Column({ type: 'date', nullable: true })
    est_delivery_date?: string;

    // ── Packing ──
    @Column({ type: 'varchar', length: 200, nullable: true })
    packing_marks?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    total_packages: number;

    @Column({ type: 'varchar', length: 50, nullable: true })
    packing_type?: string;

    @Column({
        type: 'numeric',
        precision: 14,
        scale: 3,
        nullable: false,
        default: 0,
    })
    gross_weight_kg: string;

    @Column({
        type: 'numeric',
        precision: 14,
        scale: 3,
        nullable: false,
        default: 0,
    })
    net_weight_kg: string;

    // ── Bank + commercial defaults ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    bank_account_id?: string;

    @Column({ type: 'text', nullable: true })
    payment_terms_text?: string;

    @Column({ type: 'text', nullable: true })
    declaration_text?: string;

    @Column({ type: 'int', nullable: false, default: 30 })
    validity_days: number;

    // ── Public link ──
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 64, nullable: true })
    public_token?: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    public_view_count: number;

    @Column({ type: 'timestamptz', nullable: true })
    public_last_viewed_at?: Date;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PfiDoc = PfiEntity;
