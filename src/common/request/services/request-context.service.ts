import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What we stash per request. The raw request is held rather than the ids
 * themselves — see `resolve()`.
 */
export interface IRequestContextStore {
    requestId?: string;
    /** The live IRequestApp. Read lazily; `user` is not set yet at store time. */
    request?: any;
}

/** The flattened view a consumer actually wants. */
export interface IRequestContext {
    requestId?: string;
    userId?: string;
    companyId?: string;
}

/**
 * Propagates "who is making this request" down through async calls, without
 * threading an actor parameter through every service method
 * (ERP_TRACKING_SYSTEM_PLAN §5.2).
 *
 * A TypeORM `EntitySubscriber` sees the entity but not the HTTP request, so it
 * cannot read `req.user`. The alternative — passing an actor into every `.save()`
 * — would be a 40-file diff and a permanent maintenance tax.
 *
 * WHY WE STORE THE REQUEST, NOT THE IDS: the middleware that opens the context
 * runs BEFORE the auth guard, so `req.user` is still undefined at that moment.
 * Holding the request and dereferencing `user` at read time means the subscriber
 * — which runs during the handler, long after the guard — sees the real actor.
 *
 * FAILS CLOSED: if the async context is ever lost (some library boundaries drop
 * it), `resolve()` returns `undefined` and the audit row is attributed to the
 * system (`user_id: null`). It never attributes the change to the *wrong* user.
 *
 * `AsyncLocalStorage` is a Node builtin — no dependency, no npm install.
 */
@Injectable()
export class RequestContextService {
    private static readonly storage =
        new AsyncLocalStorage<IRequestContextStore>();

    /** Run `fn` with `store` visible to everything it awaits. */
    run<T>(store: IRequestContextStore, fn: () => T): T {
        return RequestContextService.storage.run(store, fn);
    }

    /** `undefined` outside a request (cron, CLI, bootstrap). */
    resolve(): IRequestContext | undefined {
        const store = RequestContextService.storage.getStore();
        if (!store) return undefined;
        const user = store.request?.user;
        return {
            requestId: store.requestId,
            userId: user?.user || undefined,
            companyId: user?.companyId || undefined,
        };
    }
}
