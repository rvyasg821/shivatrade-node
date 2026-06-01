export enum ENUM_INVOICE_TYPE {
    /** Export invoice billed to a foreign buyer (Phase 1 default + only wired path). */
    EXPORT = 'export',
    /** Reserved for future domestic billing - not wired in Phase 1. */
    DOMESTIC = 'domestic',
}

export enum ENUM_INVOICE_STATUS {
    DRAFT = 'draft',
    ISSUED = 'issued',
    PARTIALLY_PAID = 'partially_paid',
    PAID = 'paid',
    CANCELLED = 'cancelled',
}

export enum ENUM_INVOICE_GST_ROUTE {
    /** Default for exports - IGST is paid to Govt then reclaimed as refund. */
    IGST_PAID = 'igst_paid',
    /** Zero-rated under Letter of Undertaking - lut_no + lut_date required. */
    LUT_ZERO_RATED = 'lut_zero_rated',
    /** Reserved for future domestic invoice (intra-state, CGST+SGST split). */
    DOMESTIC_INTRA = 'domestic_intra',
    /** Reserved for future domestic invoice (inter-state, IGST). */
    DOMESTIC_INTER = 'domestic_inter',
}

/**
 * Shipment mode — drives the AWB-vs-BL label on the PDF and the
 * "Export Under <scheme>" line. Relocated from the (to-be-deleted) shipping
 * module: shipment actuals now live on the Invoice (SHIPPING_INVOICE_MERGE_PLAN
 * §3a / §11). `shipping.enum.ts` re-exports these until teardown (TKT-6).
 */
export enum ENUM_SHIPPING_MODE {
    SEA_FCL = 'sea_fcl', // Full Container Load
    SEA_LCL = 'sea_lcl', // Less than Container Load (consolidated)
    AIR = 'air', // Air freight (passenger or freighter)
    AIR_COURIER = 'air_courier', // DHL / FedEx / Aramex / UPS
}

export const SEA_MODES: ENUM_SHIPPING_MODE[] = [
    ENUM_SHIPPING_MODE.SEA_FCL,
    ENUM_SHIPPING_MODE.SEA_LCL,
];

export const AIR_MODES: ENUM_SHIPPING_MODE[] = [
    ENUM_SHIPPING_MODE.AIR,
    ENUM_SHIPPING_MODE.AIR_COURIER,
];

/** Export scheme — renders the "Export Under <scheme>" line on the PDF.
 *  Independent of `gst_route`. */
export enum ENUM_SHIPPING_BILL_TYPE {
    FREE = 'free',
    DBK = 'dbk', // Duty Drawback
    RODTEP = 'rodtep', // Remission of Duties and Taxes on Exported Products
    ROSCTL = 'rosctl', // Rebate of State and Central Taxes and Levies
    SEIS = 'seis', // Service Exports from India Scheme
}

/**
 * Manual invoice tracking-event types. Re-homed from the shipping module
 * (SHIPPING_INVOICE_MERGE_PLAN §8). Manual events only — there are NO system
 * lifecycle events on the invoice (lifecycle was dropped with the shipping
 * module). Operators append these from the invoice "Tracking" tab.
 */
export enum ENUM_INVOICE_EVENT_TYPE {
    DOC_HANDOVER = 'doc_handover',
    CONTAINER_LOADED = 'container_loaded',
    GATE_IN = 'gate_in',
    VESSEL_DEPARTED = 'vessel_departed',
    PORT_OF_TRANSHIPMENT = 'port_of_transhipment',
    DELAY_REPORTED = 'delay_reported',
    DOCUMENT_DISPATCHED = 'document_dispatched',
    PAYMENT_RECEIVED = 'payment_received',
    OTHER = 'other',
}

export const INVOICE_EDITABLE_AT_DRAFT = '*';

/** Fields that remain editable after ISSUED (everything else is frozen).
 *  Phase B: the Shipment & Shipping Bill block is recorded after the invoice
 *  is issued (goods ship, customs issues the SB), so the whole §3a shipment
 *  group is editable post-ISSUED — alongside the always-appendable notes.
 *  Financial fields + line items stay frozen. (SHIPPING_INVOICE_MERGE_PLAN §4)
 *  Payments are recorded via the payment endpoints, NOT by editing
 *  advance_received / balance_receivable — those are derived. */
export const INVOICE_EDITABLE_AT_ISSUED: ReadonlyArray<string> = [
    // Shipment & Shipping Bill block (§3a)
    'mode',
    'shipping_bill_type',
    'shipping_bill_no',
    'shipping_bill_date',
    'port_of_loading_id',
    'port_of_loading_snapshot',
    'port_of_discharge_id',
    'port_of_discharge_snapshot',
    'pre_carriage_by',
    'place_of_receipt',
    'place_of_delivery',
    'total_packages',
    'net_weight_kg',
    'gross_weight_kg',
    'bl_awb_no',
    // Always-appendable notes
    'internal_notes',
    'notes_to_buyer',
];
