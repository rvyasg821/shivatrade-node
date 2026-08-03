import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_PO_VENDOR_STATUS,
    ENUM_PO_VENDOR_PAYMENT_STATUS,
} from '../../enums/po-vendor.enum';
import { PO_VENDOR_COLLECTION_NAME } from '../../constants/po-vendor.entity.constant';

@Entity(PO_VENDOR_COLLECTION_NAME)
export class PoVendorEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    /** Display voucher number e.g. `STIPL/POV0001/2026-27`. Unique per company. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: false })
    voucher_no: string;

    /** Source PO — must be `confirmed` (or `in_process`) at create time.
     *  Nullable since 2026-06: a POV can be raised standalone (no parent
     *  Sales Order). Null = standalone POV; it does not participate in any
     *  PO coverage roll-up. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    purchase_order_id?: string;

    /** Soft links to one or more Sales Orders, for traceability on a
     *  standalone POV (many — unlike the single `purchase_order_id` coverage
     *  link above). Snapshot of `[{ id, voucher_no }]` frozen at create time so
     *  the detail view/PDF can list them without a join. Empty by default.
     *  Does NOT participate in PO coverage roll-ups. */
    @Column({ type: 'jsonb', nullable: false, default: () => "'[]'::jsonb" })
    linked_sales_orders: Array<{ id: string; voucher_no: string }>;

    /** Set when this POV was raised as the BALANCE of an earlier one — i.e.
     *  to re-order what that POV never delivered (undispatched, plus any short
     *  receipt once it closed). Lets the source POV subtract what has already
     *  been re-ordered, so the balance action can't be run twice for the same
     *  units. Null for every other POV. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    balance_of_po_vendor_id?: string;

    /** Snapshot of vendor at POV creation — inherited from PO header. */
    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    /** Snapshot of vendor address — inherited from PO header. */
    @Column({ type: 'uuid', nullable: true })
    vendor_address_id?: string;

    /** Captured on Dispatch action. */
    @Column({ type: 'date', nullable: true })
    dispatch_date?: string;

    @Column({ type: 'date', nullable: true })
    expected_arrival_date?: string;

    /** Captured on Receive action. */
    @Column({ type: 'date', nullable: true })
    actual_arrival_date?: string;

    // ── Vendor terms printed on the POV PDF ──────────────────────────────
    //
    // The POV's own terms — deliberately NOT inherited from the parent Sales
    // Order, which carries the customer-side terms. Free text: the operator
    // types whatever the vendor agreed to.

    /** Mode of dispatch, e.g. "By Sea". Prints as "Dispatched through". */
    @Column({ type: 'varchar', length: 150, nullable: true })
    dispatched_through?: string;

    /** e.g. "50% ADVANCE & 50% AT DISPATCH TIME". */
    @Column({ type: 'varchar', length: 500, nullable: true })
    payment_terms?: string;

    /** e.g. "OUR PFI NO:STIPL/PI0344/2025-26, DELIVERY TERM: 4 TO 5 WEEKS". */
    @Column({ type: 'varchar', length: 1000, nullable: true })
    delivery_terms?: string;

    // ── Transport / tracking ─────────────────────────────────────────────
    @Column({ type: 'varchar', length: 150, nullable: true })
    transporter_name?: string;

    @Column({ type: 'varchar', length: 40, nullable: true })
    vehicle_no?: string;

    /** Lorry Receipt / Bilty number. */
    @Column({ type: 'varchar', length: 60, nullable: true })
    lr_no?: string;

    @Column({ type: 'date', nullable: true })
    lr_date?: string;

    @Column({ type: 'varchar', length: 40, nullable: true })
    eway_bill_no?: string;

    @Column({ type: 'date', nullable: true })
    eway_bill_date?: string;

    /** Snapshot text — pre-fills from PO header's delivery_address.
     *  Frozen on create; the PDF (when added) prints this directly. */
    @Column({ type: 'text', nullable: false })
    delivery_address: string;

    /** Soft FK → company_addresses._id. Traceability: which company
     *  address the snapshot was generated from at create time. Null
     *  when the user provided a manual text override or the parent PO
     *  itself had no `delivery_address_id`. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    delivery_address_id?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    /** Hidden from any vendor-facing view (POV has no PDF in v1 — internal only). */
    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    /** Snapshot of the company's home currency at create time. POV is
     *  always in home currency, but snapshotting it means historical
     *  POVs render in the currency they were priced in even if the
     *  company later switches home currency. */
    @Index()
    @Column({ type: 'varchar', length: 10, nullable: false, default: 'INR' })
    currency_code: string;

    /** Rate vs. the company's *current* base — `1` when the snapshot
     *  currency equals the live home currency. Useful for normalising
     *  historical POVs in cross-period reports. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 6,
        nullable: false,
        default: 1,
    })
    exchange_rate: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_PO_VENDOR_STATUS.DRAFT,
    })
    status: ENUM_PO_VENDOR_STATUS;

    /** Vendor-side charges snapshotted from expense master at POV
     *  creation (per PFI→POV flow) or appended later on the POV
     *  detail page. Each row carries enough info to render the
     *  vendor invoice copy independently of the master.
     *
     *  Shape: [{ expense_id, code, name, hsn_code, type ("percent"|"fixed"),
     *           value (string), amount (string, computed), gst_pct (string) }]
     */
    @Column({
        type: 'jsonb',
        nullable: false,
        default: () => "'[]'::jsonb",
    })
    expenses_snapshot: Array<{
        expense_id: string;
        code: string;
        name: string;
        hsn_code?: string;
        type: string;
        value: string;
        amount: string;
        gst_pct?: string;
    }>;

    /** Cached sum of active (non-voided) vendor payments. Derived from the
     *  po_vendor_payments table on every record/void — never set directly.
     *  Independent of the dispatch `status`. */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    amount_paid: string;

    /**
     * Net effect of the Adjustment Notes linked to this POV, as a POSITIVE
     * number meaning "the payable is reduced by this much" (a vendor Debit
     * note reduces, a Credit note increases → negative). Derived from active
     * notes; see `sumAdjustmentEffect`.
     */
    @Column({
        type: 'numeric',
        precision: 18,
        scale: 2,
        nullable: false,
        default: 0,
    })
    adjustment_total: string;

    /** Vendor payment status — unpaid / partially_paid / paid. Derived from
     *  amount_paid + adjustment_total vs the live order value (payable). Runs
     *  independently of the dispatch `status`. */
    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_PO_VENDOR_PAYMENT_STATUS.UNPAID,
    })
    payment_status: ENUM_PO_VENDOR_PAYMENT_STATUS;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type PoVendorDoc = PoVendorEntity;
