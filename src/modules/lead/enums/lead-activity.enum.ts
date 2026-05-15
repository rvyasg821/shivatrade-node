/**
 * Single timeline / activity feed on a Lead. Extend as more system events
 * get wired in (e.g. assignment_change, pfi_created).
 *
 *  - NOTE              user-typed note (editable / deletable by author)
 *  - LEAD_CREATED      auto-recorded once when the lead is created (timeline anchor)
 *  - STATUS_CHANGE     auto-recorded when lead.status moves
 *  - CONVERSION        auto-recorded when lead → customer link is set
 *  - QUOTATION_CREATED auto-recorded when a quotation is created with this lead_id
 *  - ASSIGNMENT_CHANGE auto-recorded when lead.assigned_to changes (future)
 */
export enum ENUM_LEAD_ACTIVITY_TYPE {
    NOTE = 'note',
    LEAD_CREATED = 'lead_created',
    STATUS_CHANGE = 'status_change',
    CONVERSION = 'conversion',
    QUOTATION_CREATED = 'quotation_created',
    ASSIGNMENT_CHANGE = 'assignment_change',
}
