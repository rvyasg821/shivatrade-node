import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import {
    ENUM_SHIPPING_MODE,
    ENUM_SHIPPING_STATUS,
    ENUM_SHIPPING_BILL_TYPE,
} from '@modules/shipping/enums/shipping.enum';
import { SHIPPING_COLLECTION_NAME } from '../../constants/shipping.entity.constant';

/**
 * Export shipment header. Sea + Air only per SHIPPING_MODULE_PLAN §3.
 * Carries the actuals - BL/AWB, vessel/flight, container, shipping bill,
 * LEO date, ports (FK port_master), weights, packages, costs.
 *
 * 1:N with Invoice via `shipping_invoices` join table (one shipment can
 * carry multiple invoices - LCL consolidation case).
 */
@Entity(SHIPPING_COLLECTION_NAME)
export class ShippingEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by?: string;

    /** Voucher no - assigned at BOOKED (`STIPL/SHP0001/2026-27`). Null in DRAFT. */
    @Index()
    @Column({ type: 'varchar', length: 60, nullable: true })
    voucher_no?: string;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
    })
    mode: ENUM_SHIPPING_MODE;

    @Index()
    @Column({
        type: 'varchar',
        length: 20,
        nullable: false,
        default: ENUM_SHIPPING_STATUS.DRAFT,
    })
    status: ENUM_SHIPPING_STATUS;

    // ── Parties (FK + snapshot pattern) ──
    @Index()
    @Column({ type: 'uuid', nullable: false })
    customer_id: string;

    @Column({ type: 'jsonb', nullable: true })
    customer_snapshot?: any;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    consignee_id: string;

    @Column({ type: 'uuid', nullable: true })
    consignee_address_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    consignee_snapshot?: any;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    notify_party_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    notify_party_snapshot?: any;

    // ── Forwarder (CHA / freight forwarder - usually a vendor) ──
    @Index()
    @Column({ type: 'uuid', nullable: true })
    forwarder_id?: string;

    @Column({ type: 'jsonb', nullable: true })
    forwarder_snapshot?: any;

    // ── Transport document ──
    @Column({ type: 'varchar', length: 60, nullable: true })
    bl_awb_no?: string; // Bill of Lading / Air Waybill

    @Column({ type: 'date', nullable: true })
    bl_awb_date?: string;

    /** "BL" / "AWB" / "Courier" - auto-set from mode. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    bl_awb_type?: string;

    // ── Customs (export from India) ──
    @Column({ type: 'varchar', length: 60, nullable: true })
    shipping_bill_no?: string;

    @Column({ type: 'date', nullable: true })
    shipping_bill_date?: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    shipping_bill_type?: ENUM_SHIPPING_BILL_TYPE;

    /** Let Export Order - customs clearance approval; required to dispatch. */
    @Column({ type: 'date', nullable: true })
    let_export_order_date?: string;

    /** Export General Manifest (shipping-line filing). */
    @Column({ type: 'varchar', length: 60, nullable: true })
    egm_no?: string;

    @Column({ type: 'date', nullable: true })
    egm_date?: string;

    // ── Container / Vessel / Flight (mode-conditional) ──
    @Column({ type: 'varchar', length: 30, nullable: true })
    container_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    seal_no?: string;

    /** "20FT" / "40FT" / "40FT-HC" / "LCL". */
    @Column({ type: 'varchar', length: 20, nullable: true })
    container_type?: string;

    @Column({ type: 'varchar', length: 80, nullable: true })
    vessel_name?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    voyage_no?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    flight_no?: string;

    // ── Route ──
    @Column({ type: 'varchar', length: 80, nullable: true })
    pre_carriage_by?: string;

    @Column({ type: 'varchar', length: 80, nullable: true })
    place_of_receipt?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    port_of_loading_id: string;

    @Column({ type: 'jsonb', nullable: false })
    port_of_loading_snapshot: any;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    port_of_discharge_id?: string;

    @Column({ type: 'jsonb', nullable: false })
    port_of_discharge_snapshot: any;

    @Column({ type: 'varchar', length: 80, nullable: true })
    place_of_delivery?: string;

    @Column({ type: 'varchar', length: 80, nullable: false, default: 'India' })
    country_of_origin: string;

    @Column({ type: 'varchar', length: 80, nullable: false })
    country_of_destination: string;

    // ── Dates / ETA ──
    @Column({ type: 'date', nullable: true })
    booking_date?: string;

    @Column({ type: 'date', nullable: true })
    gate_in_date?: string;

    @Column({ type: 'date', nullable: true })
    etd?: string;

    @Column({ type: 'date', nullable: true })
    actual_dispatch_date?: string;

    @Column({ type: 'date', nullable: true })
    eta?: string;

    @Column({ type: 'date', nullable: true })
    actual_arrival_date?: string;

    @Column({ type: 'date', nullable: true })
    customs_cleared_date?: string;

    @Column({ type: 'date', nullable: true })
    delivered_date?: string;

    // ── Cargo aggregate ──
    @Column({ type: 'int', nullable: true })
    total_packages?: number;

    @Column({ type: 'varchar', length: 40, nullable: true })
    package_type?: string; // drums / pallets / cartons / boxes

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    net_weight_kg?: string;

    @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
    gross_weight_kg?: string;

    @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
    volume_cbm?: string;

    @Column({ type: 'text', nullable: true })
    marks_and_nos?: string;

    // ── Marine insurance (CIF/CIP only) ──
    @Column({ type: 'varchar', length: 60, nullable: true })
    marine_insurance_policy_no?: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    insurance_company?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
    policy_amount_inr?: string;

    // ── Costs (INR) ──
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    freight_charges_inr: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    insurance_charges_inr: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    cha_charges_inr: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    forwarder_charges_inr: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    other_charges_inr: string;

    /** Σ above - maintained on save. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    total_cost_inr: string;

    // ── Compliance snapshots (from Company at create) ──
    @Column({ type: 'varchar', length: 30, nullable: true })
    iec_code?: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    ad_code?: string;

    // ── Notes ──
    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ type: 'text', nullable: true })
    internal_notes?: string;

    // ── Audit ──
    @Column({ type: 'uuid', nullable: true })
    booked_by?: string;

    @Column({ type: 'timestamp with time zone', nullable: true })
    booked_at?: Date;

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

export type ShippingDoc = ShippingEntity;
