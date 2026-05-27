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

export enum ENUM_SHIPPING_STATUS {
    DRAFT = 'draft', // operator started form, no booking yet
    BOOKED = 'booked', // forwarder confirmed booking
    DISPATCHED = 'dispatched', // sailed / take-off
    ARRIVED = 'arrived', // berthed / landed at POD
    CLEARED = 'cleared', // customs cleared at destination
    DELIVERED = 'delivered', // door delivery / consignee ack
    CANCELLED = 'cancelled', // any-stage cancel
}

export enum ENUM_SHIPPING_BILL_TYPE {
    FREE = 'free',
    DBK = 'dbk', // Duty Drawback
    RODTEP = 'rodtep', // Remission of Duties and Taxes on Exported Products
    ROSCTL = 'rosctl', // Rebate of State and Central Taxes and Levies
    SEIS = 'seis', // Service Exports from India Scheme
}

export enum ENUM_SHIPPING_EVENT_TYPE {
    // System lifecycle events (is_system = true). Emitted at status flips.
    SHIPPING_CREATED = 'shipping_created',
    SHIPPING_BOOKED = 'shipping_booked',
    SHIPPING_DISPATCHED = 'shipping_dispatched',
    SHIPPING_ARRIVED = 'shipping_arrived',
    SHIPPING_CLEARED = 'shipping_cleared',
    SHIPPING_DELIVERED = 'shipping_delivered',
    SHIPPING_CANCELLED = 'shipping_cancelled',
    SHIPPING_UPDATED = 'shipping_updated',

    // Manual events operators can add from the FE.
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

export const SYSTEM_SHIPPING_EVENT_TYPES: string[] = [
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CREATED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_BOOKED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_DISPATCHED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_ARRIVED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CLEARED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_DELIVERED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_CANCELLED,
    ENUM_SHIPPING_EVENT_TYPE.SHIPPING_UPDATED,
];

/**
 * Forward status transitions. Cancellation is allowed from any non-terminal
 * status; covered separately in the service.
 */
export const SHIPPING_STATUS_TRANSITIONS: Record<string, ENUM_SHIPPING_STATUS[]> = {
    [ENUM_SHIPPING_STATUS.DRAFT]: [
        ENUM_SHIPPING_STATUS.BOOKED,
        ENUM_SHIPPING_STATUS.CANCELLED,
    ],
    [ENUM_SHIPPING_STATUS.BOOKED]: [
        ENUM_SHIPPING_STATUS.DISPATCHED,
        ENUM_SHIPPING_STATUS.CANCELLED,
    ],
    [ENUM_SHIPPING_STATUS.DISPATCHED]: [
        ENUM_SHIPPING_STATUS.ARRIVED,
        ENUM_SHIPPING_STATUS.CANCELLED,
    ],
    [ENUM_SHIPPING_STATUS.ARRIVED]: [
        ENUM_SHIPPING_STATUS.CLEARED,
        ENUM_SHIPPING_STATUS.CANCELLED,
    ],
    [ENUM_SHIPPING_STATUS.CLEARED]: [ENUM_SHIPPING_STATUS.DELIVERED],
    [ENUM_SHIPPING_STATUS.DELIVERED]: [],
    [ENUM_SHIPPING_STATUS.CANCELLED]: [],
};
