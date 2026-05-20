/**
 * Predefined event-type labels for the tracking module (Tracking plan §5).
 * Stored on the row as `varchar(40)`, not a DB enum - adding a new option
 * is a constants change, not a migration. `other` is the free-text
 * escape hatch via `event_type_other`.
 */
export enum ENUM_TRACKING_EVENT_TYPE {
    VEHICLE_LOADED = 'vehicle_loaded',
    LEFT_VENDOR = 'left_vendor',
    IN_TRANSIT_UPDATE = 'in_transit_update',
    REACHED_CHECKPOINT = 'reached_checkpoint',
    CUSTOMS_CLEARANCE = 'customs_clearance',
    NEAR_DESTINATION = 'near_destination',
    ARRIVED_DESTINATION = 'arrived_destination',
    UNLOADING_STARTED = 'unloading_started',
    UNLOADING_COMPLETE = 'unloading_complete',
    DELAY_REPORTED = 'delay_reported',
    DAMAGE_REPORTED = 'damage_reported',
    OTHER = 'other',
}

export const TRACKING_EVENT_TYPE_VALUES: string[] = Object.values(
    ENUM_TRACKING_EVENT_TYPE
);
