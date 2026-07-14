import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { IRequestApp } from '../interfaces/request.interface';
import { RequestContextService } from '../services/request-context.service';

/**
 * Opens an AsyncLocalStorage scope for the lifetime of the request, so the
 * TypeORM audit subscriber can discover the acting user
 * (ERP_TRACKING_SYSTEM_PLAN §5.2).
 *
 * `next()` is invoked INSIDE `run()`, so every guard, interceptor, controller and
 * service downstream — and everything they await — shares the context.
 *
 * This middleware only opens a scope. It reads nothing, writes nothing, and
 * cannot alter the request or the response.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    constructor(private readonly requestContext: RequestContextService) {}

    use(req: IRequestApp, _res: Response, next: NextFunction): void {
        this.requestContext.run(
            { requestId: (req as any).id, request: req },
            () => next()
        );
    }
}
