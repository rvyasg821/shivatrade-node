import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_PURCHASE_ORDER_STATUS } from '../../enums/purchase-order.enum';
import { PURCHASE_ORDER_COLLECTION_NAME } from '../../constants/purchase-order.entity.constant';

@Entity(PURCHASE_ORDER_COLLECTION_NAME)
export class PurchaseOrderEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/OS0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    /** Legacy header-level vendor. PO is multi-vendor at line level
     *  (2026-05-21); new POs leave this null and store `vendor_id`
     *  per line on `purchase_order_lines` instead. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    /** Legacy header-level vendor address. Same status as `vendor_id`. */
    @Column({ type: 'uuid', nullable: true })
    vendor_address_id?: string;

    /** Customer auto-linked from source PFI / Quotation (traceability only). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    customer_id?: string;

    /** Bill-to address snapshot (mirrors PFI). */
    @Column({ type: 'uuid', nullable: true })
    customer_address_id?: string;

    /** Consignee (Ship-to) — hybrid model. Set when PO was created via
     *  createPoAndPovsFromSource and the source PFI/Quotation carried a
     *  consignee. Used internally + propagated onto Invoice on Generate
     *  Invoice. PO PDFs are vendor-facing; consignee block is not
     *  rendered there. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    consignee_id?: string;

    /** True when the consignee is the same party as the buyer (customer).
     *  Drives the "Same as Buyer" text on the PDF; the consignee FK/snapshot
     *  still mirror the customer for downstream Invoice generation. */
    @Column({ type: 'boolean', default: true })
    consignee_same_as_buyer: boolean;

    /** Consignee customer's selected address. Snapshot below freezes it. */
    @Column({ type: 'uuid', nullable: true })
    consignee_address_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    consignee_snapshot?: {
        name?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
    };

    /** Source Quotation - set when PO was created via createFromQuotation. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    quotation_id?: string;

    /** Source PFI - set when PO was created via createFromPfi. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    pfi_id?: string;

    @Column({ type: 'date', nullable: false })
    po_date: string;

    @Column({ type: 'date', nullable: true })
    expected_delivery_date?: string;

    // ── Customer order reference + advance (S4) ──────────────────────
    /** The customer's own PO number for this order. Propagates onto the
     *  Invoice's "Buyer's PO #" when generating the invoice. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    customer_po_number?: string;

    /** Manual, free-text tracking reference typed by the operator (alphanumeric).
     *  Distinct from the system `voucher_no` and from the buyer's
     *  `customer_po_number`. Printed on the SO PDF and carried onto the Invoice
     *  at Generate Invoice. Not unique. */
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    reference_no?: string;

    /** Advance / down-payment received against this sales order. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    advance_amount: string;

    @Column({ type: 'date', nullable: true })
    advance_date?: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    advance_notes?: string;

    /** Forwarder warehouse / port — frozen snapshot text printed on the
     *  PO PDF. Inherits from a picked company address (via
     *  `delivery_address_id`) or from a manual text override. */
    @Column({ type: 'text', nullable: false })
    delivery_address: string;

    /** Soft FK → company_addresses._id. Traceability: which company
     *  address the snapshot was generated from at create time.
     *  Null when the user provided a manual text override. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    delivery_address_id?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    payment_terms?: string;

    /** Incoterms (free-text or enum) */
    @Column({ type: 'varchar', length: 100, nullable: true })
    delivery_terms?: string;

    /** Mode of dispatch printed on the SO PDF (e.g. By Sea / By Road / By Air) */
    @Column({ type: 'varchar', length: 50, nullable: true })
    dispatched_through?: string;

    /** Hidden from PDF */
    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    /** Customer-facing remarks block printed on the Sales Order PDF.
     *  Defaults from the company's `default_remarks` at create time; editable
     *  per SO. */
    @Column({ type: 'text', nullable: true })
    remarks?: string;

    /** Always `INR` for v1 (domestic procurement only). */
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false, default: 'INR' })
    currency_code: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 6,
        nullable: false,
        default: 1,
    })
    exchange_rate: string;

    /** Shipment freight for a CNF sales order, in the DOCUMENT currency (same
     *  basis as the customer-facing amounts). Split by qty across lines at
     *  display time; NOT part of the costing chain. Carried from the source
     *  quotation and onto the Invoice's `freight_charges` on Generate Invoice. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    freight_total: string;

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
    cgst_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    sgst_total: string;

    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    igst_total: string;

    /** Sum of CGST + SGST + IGST */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    tax_total: string;

    /** Whole-rupee rounding adjustment (GST-compliant "Round Off" line). */
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
        default: ENUM_PURCHASE_ORDER_STATUS.DRAFT,
    })
    status: ENUM_PURCHASE_ORDER_STATUS;

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

export type PurchaseOrderDoc = PurchaseOrderEntity;
