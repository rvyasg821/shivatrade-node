/**
 * A single telemetry row, as captured by the middleware and buffered in memory.
 * Deliberately a plain object (not an entity instance) — it is created on the
 * hot path once per request and must stay cheap.
 */
export interface IApiCallLogRow {
    request_id?: string;
    company_id?: string;
    user_id?: string;
    impersonated_by?: string;
    method: string;
    route: string;
    path?: string;
    status_code: number;
    duration_ms: number;
    ip?: string;
    user_agent?: string;
}
