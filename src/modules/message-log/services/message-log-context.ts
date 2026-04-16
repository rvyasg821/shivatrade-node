import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-call context that lets the high-level NotificationService stash event metadata
 * for the low-level provider services (NodemailerService, TwilioSmsService, WhatsAppService)
 * to pick up automatically. Avoids threading the context through every send signature.
 */
export interface IMessageLogContext {
    eventKey?: string;
    companyId?: string;
    locationId?: string;
    recipientType?: string;
    recipientUserId?: string;
    recipientName?: string;
    triggeredByUserId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
}

const storage = new AsyncLocalStorage<IMessageLogContext>();

export const MessageLogContext = {
    run<T>(ctx: IMessageLogContext, fn: () => T): T {
        return storage.run(ctx, fn);
    },

    get(): IMessageLogContext | undefined {
        return storage.getStore();
    },
};
