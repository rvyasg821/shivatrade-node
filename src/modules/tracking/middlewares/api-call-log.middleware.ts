import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { IRequestApp } from '@common/request/interfaces/request.interface';
import { ApiCallLogService } from '../services/api-call-log.service';
import {
    TRACKING_EXCLUDED_ROUTE_PREFIXES,
    isTrackingEnabled,
} from '../constants/tracking.constant';

/**
 * Records one telemetry row per HTTP request
 * (ERP_TRACKING_SYSTEM_PLAN §5.1, §13.2).
 *
 * DELIBERATELY A MIDDLEWARE, NOT AN `APP_INTERCEPTOR`.
 *
 * This codebase applies its response interceptors per-method via the
 * `@Response()` / `@ResponsePaging()` / `@ResponseFileExcel()` decorators, and
 * PDF/Excel endpoints bypass the response pipeline entirely with `@Res()`. A
 * global interceptor would sit in the RxJS chain alongside all of them, where a
 * mistake in a `map`/`tap` silently corrupts a PDF stream or strips a pagination
 * envelope.
 *
 * This middleware registers an `res.on('finish')` listener and returns. It holds
 * no reference to the response body and is not in the response chain, so there is
 * no code path by which it can alter a response. `finish` fires once the bytes
 * are flushed — which also means every byte of work done here is invisible to the
 * user's stopwatch.
 *
 * By the time `finish` fires, Express has populated `req.route` (the pattern) and
 * the auth guard has populated `req.user`. Reading them earlier would give us
 * neither.
 */
@Injectable()
export class ApiCallLogMiddleware implements NestMiddleware {
    constructor(private readonly apiCallLogService: ApiCallLogService) {}

    use(req: IRequestApp, res: Response, next: NextFunction): void {
        if (!isTrackingEnabled()) return next();

        const startedAt = process.hrtime.bigint();

        // Registered before next() so it is attached even if the handler throws
        // synchronously. Express guarantees `finish` fires at most once.
        res.on('finish', () => {
            try {
                const route = this.resolveRoute(req);
                if (this.isExcluded(req, route)) return;

                this.apiCallLogService.record({
                    request_id: (req as any).id,
                    company_id: req.user?.companyId || undefined,
                    user_id: req.user?.user || undefined,
                    impersonated_by: req.user?.impersonatedBy || undefined,
                    method: req.method,
                    route,
                    path: this.truncate(req.originalUrl?.split('?')[0], 500),
                    status_code: res.statusCode,
                    duration_ms: Number(
                        (process.hrtime.bigint() - startedAt) / 1_000_000n
                    ),
                    ip: this.truncate(req.ip, 64),
                    user_agent: this.truncate(req.get('user-agent'), 255),
                });
            } catch {
                // Telemetry must never surface to the caller, and this callback
                // runs after the response — throwing here would be an unhandled
                // 'error' on the response emitter.
            }
        });

        next();
    }

    /**
     * The route PATTERN (`/admin/po-vendor/:id/balance`), never the resolved URL.
     * Storing resolved paths yields one distinct `route` per document id and makes
     * "slowest endpoints" unanswerable (plan §11.3).
     *
     * `req.route` is undefined for unmatched requests (404) and for responses sent
     * by a guard/filter before routing — those record `(unmatched)` rather than an
     * attacker-controlled string.
     */
    private resolveRoute(req: IRequestApp): string {
        const pattern = (req as any).route?.path as string | undefined;
        if (!pattern) return '(unmatched)';
        const base = (req as any).baseUrl || '';
        return this.truncate(`${base}${pattern}`, 255) as string;
    }

    /**
     * `main.ts` sets a global prefix (`/api`) and URI versioning (`/v1`), so a
     * real route reads `/api/v1/admin/tracking/api-calls`. Strip that envelope
     * before matching, otherwise every exclusion prefix silently never matches
     * and the Phase-5 console logs its own reads.
     */
    private static readonly PREFIX_RE = /^\/api(\/v\d+)?/;

    private isExcluded(req: IRequestApp, route: string): boolean {
        const rawPath = req.originalUrl?.split('?')[0] || '';
        const candidates = [
            route.replace(ApiCallLogMiddleware.PREFIX_RE, ''),
            rawPath.replace(ApiCallLogMiddleware.PREFIX_RE, ''),
        ];
        return TRACKING_EXCLUDED_ROUTE_PREFIXES.some((prefix) =>
            candidates.some((c) => c.startsWith(prefix))
        );
    }

    private truncate(value: string | undefined, max: number): string | undefined {
        if (!value) return undefined;
        return value.length > max ? value.slice(0, max) : value;
    }
}
