import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_INVOICE_TYPE,
    ENUM_INVOICE_STATUS,
    ENUM_INVOICE_GST_ROUTE,
    ENUM_SHIPPING_MODE,
    ENUM_SHIPPING_BILL_TYPE,
} from '@modules/invoice/enums/invoice.enum';
import { INVOICE_COLLECTION_NAME } from '../../constants/invoice.entity.constant';

/**
 * Export Commercial Invoice header. Mirrors the STIPL119 template exactly:
 *   - 3-party export (Shipper / Consignee / Notify-Party-or-Buyer)
 *   - IGST-paid (default) vs LUT zero-rated routes
 *   - FOB / Freight / Insurance / Other breakdown → grand_total
 *   - Multi-bank snapshots
 *   - country_of_destination snapshot (independent of Shipping)
 *   - igst_refund_buckets jsonb for the PDF footer block (per HSN rate)
 *
 * Shipping linkage (`shipping_id`) is optional - Invoice can be issued
 * before Shipping is booked.
 */
@Entity(INVOICE_COLLECTION_NAME)
export class InvoiceEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    /** Voucher no - assigned at ISSUED (`STIPL119/2025-26` format). Null in DRAFT. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: true })
    voucher_no?: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_INVOICE_TYPE.EXPORT,
    })
    invoice_type: ENUM_INVOICE_TYPE;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_INVOICE_STATUS.DRAFT,
    })
    status: ENUM_INVOICE_STATUS;

    @Column({ type: 'date', nullable: false })
    invoice_date: string;

    @Column({ type: 'date', nullable: true })
    due_date?: string;

    // ── Source linkage ──
    // Nullable "primary SO" pointer — a multi-SO invoice may span several POs;
    // the authoritative per-line linkage is invoice_line.purchase_order_line_id.
    // (SHIPPING_INVOICE_MERGE_PLAN §5c)
    @Index()
    @Column({ type: 'uuid', nullable: true })
    purchase_order_id?: string;

    // Comma-joined list of every source Sales Order voucher on a multi-source
    // invoice — one voucher is ~22 chars, so 3+ sources overflow varchar(60).
    // Widened to hold the full chain (synchronize alters it on boot).
    @Column({ type: 'varchar', length: 255, nullable: true })
    purchase_order_voucher_no?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    pfi_id?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    pfi_voucher_no?: string;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    quotation_id?: string;

    // Comma-joined list of source quotation vouchers — same overflow risk as
    // purchase_order_voucher_no above, so widened to match.
    @Column({ type: 'varchar', length: 255, nullable: true })
    quotation_voucher_no?: string;

    /** Customer's own PO reference (text on their letterhead). */
    @Column({ type: 'varchar', length: 60, nullable: true })
    customer_po_no?: string;

    /** Manual, free-text tracking reference. Carried from the source Sales
     *  Order's `reference_no` at Generate Invoice (operator can override);
     *  printed on all three invoice PDFs. Distinct from voucher_no /
     *  customer_po_no. Not unique. */
    @Index()
    @Column({ type: 'varchar', length: 100, nullable: true })
    reference_no?: string;

    // ── Destination snapshot (visible on Commercial Invoice header) ──
    @Column({ type: 'varchar', length: 80, nullable: true })
    country_of_destination?: string;

    @Column({ type: 'varchar', length: 80, nullable: false, default: 'India' })
    country_of_origin: string;

    // ── Shipping linkage ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    shipping_id?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    shipping_voucher_no?: string;

    // ── Shipment & Shipping Bill (recorded on the Invoice; SHIPPING_INVOICE_MERGE_PLAN §3a) ──
    // All optional at create; the shipment block is filled in Phase B (after
    // goods ship + customs issues the Shipping Bill) and stays editable even
    // after the invoice is ISSUED.

    /** sea/air family — drives the AWB-vs-BL label on the PDF. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    mode?: ENUM_SHIPPING_MODE;

    /** Export scheme — renders "Export Under <scheme>" on the PDF (both GST routes). */
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_SHIPPING_BILL_TYPE.FREE,
    })
    shipping_bill_type: ENUM_SHIPPING_BILL_TYPE;

    /** Shipping Bill no/date — record-only (CHA generates the SB externally; not printed). */
    @Column({ type: 'varchar', length: 60, nullable: true })
    shipping_bill_no?: string;

    @Column({ type: 'date', nullable: true })
    shipping_bill_date?: string;

    /** Port of Loading — FK to port master + snapshot (so the PDF is stable). */
    @Column({ type: 'uuid', nullable: true })
    port_of_loading_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    port_of_loading_snapshot?: any;

    /** Port of Discharge — FK to port master + snapshot. */
    @Column({ type: 'uuid', nullable: true })
    port_of_discharge_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    port_of_discharge_snapshot?: any;

    // ── Route ──
    @Column({ type: 'varchar', length: 80, nullable: true })
    pre_carriage_by?: string;

    @Column({ type: 'varchar', length: 80, nullable: true })
    place_of_receipt?: string;

    @Column({ type: 'varchar', length: 80, nullable: true })
    place_of_delivery?: string;

    // ── Cargo totals ──
    @Column({ type: 'int', nullable: true })
    total_packages?: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    net_weight_kg?: string;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    gross_weight_kg?: string;

    /** Master transport doc no — label "AWB/BL No" on the PDF. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    bl_awb_no?: string;

    // ── Parties (FK + snapshot pattern) ──
    @Index()
    @Column({ type: 'uuid', nullable: false })
    customer_id: string;

    @Column({ type: 'uuid', nullable: true })
    customer_address_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    customer_snapshot?: any;

    /** Optional FK — set only when consignee was picked from customer master.
     *  Free-text consignees (ad-hoc third parties) leave this null and rely
     *  entirely on `consignee_snapshot`. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    consignee_id?: string;

    @Column({ type: 'uuid', nullable: true })
    consignee_address_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    consignee_snapshot?: any;

    /** 3-party export: Notify Party / Buyer (the one paying, often LC issuer). */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    notify_party_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    notify_party_snapshot?: any;

    /** Company address (shipper) — FK + snapshot so historical invoices
     *  print the address that was current at issue time even if master
     *  is later edited. Snapshot captured at draft save, refreshed at issue. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    company_address_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    company_address_snapshot?: any;

    // ── Money (in invoice currency) ──
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false })
    currency_code: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_symbol?: string;

    @Column({ type: 'numeric', precision: 18, scale: 6, nullable: false, default: 1 })
    exchange_rate: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    subtotal: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    discount_total: string;

    /** subtotal − discount_total. Labelled FOB on the PDF when incoterm = FOB. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    fob_value: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    freight_charges: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    insurance_charges: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    other_charges: string;

    /** fob_value + freight + insurance + other. Labelled FOB/CNF/CIF per incoterm. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    grand_total: string;

    /** INR-equivalent of grand_total - snapshot at issue for GSTR-1 + refund. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    grand_total_inr: string;

    @Column({ type: 'text', nullable: true })
    amount_in_words?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    advance_received: string;

    /**
     * Net effect of the Adjustment Notes linked to this invoice, as a POSITIVE
     * number meaning "the receivable is reduced by this much" (a customer
     * Credit note reduces, a Debit note increases → negative). Derived from
     * active notes; see `sumAdjustmentEffect`.
     */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    adjustment_total: string;

    /** grand_total − advance_received − adjustment_total. Maintained on save. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    balance_receivable: string;

    // ── GST / compliance ──
    @Index()
    @Column({
        type: 'varchar',
        length: 30,
        nullable: false,
        default: ENUM_INVOICE_GST_ROUTE.IGST_PAID,
    })
    gst_route: ENUM_INVOICE_GST_ROUTE;

    @Column({ type: 'varchar', length: 60, nullable: true })
    lut_no?: string;

    @Column({ type: 'date', nullable: true })
    lut_date?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    cgst_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    sgst_amount: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    igst_amount: string;

    /** For `igst_paid` route - total IGST refund claimable across HSN buckets. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    igst_refund_amount: string;

    /** Per-HSN-rate breakdown for the PDF refund footer:
     *  [{ rate: 0.18, assessable_value_inr: 191780.51, igst_amount_inr: 34520.49 }, ...] */
    @Column({ type: 'jsonb', nullable: true })
    igst_refund_buckets?: any;

    /** "96 - Other Territory" for exports under GST. Domestic = state code. */
    @Column({ type: 'varchar', length: 20, nullable: false, default: '96' })
    place_of_supply: string;

    // ── Company snapshots (frozen at issue) ──
    @Column({ type: 'varchar', length: 30, nullable: true })
    gst_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    pan_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    iec_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    ad_code?: string;

    // ── Trade terms ──
    @Column({ type: 'varchar', length: 20, nullable: true })
    incoterm?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    payment_terms?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    delivery_terms?: string;

    // ── DGFT (scheme codes) ──
    @Column({ type: 'varchar', length: 60, nullable: true })
    end_use_code?: string;

    @Column({ type: 'varchar', length: 60, nullable: true })
    preferential_agreement?: string;

    // ── Banks (multi-bank jsonb array - at least one required at ISSUED) ──
    /** [{ name, account_no, beneficiary, ad_code, swift_code, branch, currency_code }, ...] */
    @Column({ type: 'jsonb', nullable: true })
    bank_snapshots?: any;

    // ── Notes ──
    @Column({ type: 'text', nullable: true })
    notes_to_buyer?: string;

    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    @Column({ type: 'text', nullable: true })
    declaration_text?: string;

    /** Per-invoice Terms & Conditions. Defaults from company.default_terms
     *  at create time; editable per invoice; rendered on Commercial /
     *  Export PDFs. */
    @Column({ type: 'text', nullable: true })
    terms?: string;

    // ── Audit ──
    @Column({ type: 'uuid', nullable: true })
    issued_by?: string;

    @Column({ type: 'timestamp with time zone', nullable: true })
    issued_at?: Date;

    @Column({ type: 'uuid', nullable: true })
    cancelled_by?: string;

    @Column({ type: 'timestamp with time zone', nullable: true })
    cancelled_at?: Date;

    @Column({ type: 'text', nullable: true })
    cancelled_reason?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type InvoiceDoc = InvoiceEntity;
