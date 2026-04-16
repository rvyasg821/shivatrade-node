import { Injectable, Logger } from '@nestjs/common';
import { MessageLogRepository } from '../repository/repositories/message-log.repository';
import { MessageLogEntity } from '../repository/entities/message-log.entity';
import {
    ENUM_MESSAGE_LOG_CHANNEL,
    ENUM_MESSAGE_LOG_STATUS,
    ENUM_MESSAGE_LOG_RECIPIENT_TYPE,
} from '../enums/message-log.enum';
import {
    MESSAGE_LOG_BODY_PREVIEW_LENGTH,
    MESSAGE_LOG_RETENTION_DAYS,
} from '../constants/message-log.constant';
import { MessageLogContext, IMessageLogContext } from './message-log-context';

export interface ICreatePendingLog {
    channel: ENUM_MESSAGE_LOG_CHANNEL;
    recipient_address: string;
    subject?: string;
    body?: string;
    provider?: string;
    // Optional explicit context — overrides anything in MessageLogContext
    company_id?: string;
    location_id?: string;
    event_key?: string;
    recipient_type?: ENUM_MESSAGE_LOG_RECIPIENT_TYPE | string;
    recipient_user_id?: string;
    recipient_name?: string;
    triggered_by_user_id?: string;
    related_entity_type?: string;
    related_entity_id?: string;
}

export interface IListMessageLogsFilter {
    company_id?: string;
    location_id?: string;
    channel?: string;
    event_key?: string;
    status?: string;
    recipient_search?: string;
    date_from?: Date;
    date_to?: Date;
    limit?: number;
    offset?: number;
    order_dir?: 'ASC' | 'DESC';
}

@Injectable()
export class MessageLogService {
    private readonly logger = new Logger(MessageLogService.name);

    constructor(private readonly repo: MessageLogRepository) {}

    /**
     * Strip HTML tags + collapse whitespace, then truncate.
     */
    private buildPreview(body?: string): string | undefined {
        if (!body) return undefined;
        const text = body
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > MESSAGE_LOG_BODY_PREVIEW_LENGTH
            ? text.slice(0, MESSAGE_LOG_BODY_PREVIEW_LENGTH)
            : text;
    }

    /**
     * Create a "queued" log entry. Returns the row id which the caller uses
     * to call markSent / markFailed once the provider responds.
     *
     * Pulls extra context from MessageLogContext (AsyncLocalStorage) if the
     * call originates inside NotificationService.sendEventNotification.
     */
    async createPending(input: ICreatePendingLog): Promise<MessageLogEntity | null> {
        try {
            const ctx: IMessageLogContext = MessageLogContext.get() || {};
            const data: Partial<MessageLogEntity> = {
                channel: input.channel,
                recipient_address: input.recipient_address?.slice(0, 320) || 'unknown',
                subject: input.subject?.slice(0, 500),
                body_preview: this.buildPreview(input.body),
                status: ENUM_MESSAGE_LOG_STATUS.QUEUED,
                provider: input.provider,
                company_id: input.company_id || ctx.companyId,
                location_id: input.location_id || ctx.locationId,
                event_key: input.event_key || ctx.eventKey,
                recipient_type:
                    input.recipient_type ||
                    ctx.recipientType ||
                    ENUM_MESSAGE_LOG_RECIPIENT_TYPE.EXTERNAL,
                recipient_user_id: input.recipient_user_id || ctx.recipientUserId,
                recipient_name: input.recipient_name || ctx.recipientName,
                triggered_by_user_id: input.triggered_by_user_id || ctx.triggeredByUserId,
                related_entity_type: input.related_entity_type || ctx.relatedEntityType,
                related_entity_id: input.related_entity_id || ctx.relatedEntityId,
            };
            return (await this.repo.create(data as any)) as MessageLogEntity;
        } catch (error) {
            // Logging failures must NEVER break the actual send.
            this.logger.error(`Failed to create message log: ${error.message}`);
            return null;
        }
    }

    async markSent(logId: string | undefined, providerMessageId?: string): Promise<void> {
        if (!logId) return;
        try {
            const log = await this.repo.findOneById(logId);
            if (!log) return;
            await this.repo.update(log, {
                status: ENUM_MESSAGE_LOG_STATUS.SENT,
                provider_message_id: providerMessageId?.slice(0, 200),
                sent_at: new Date(),
            } as any);
        } catch (error) {
            this.logger.error(`Failed to mark log ${logId} as sent: ${error.message}`);
        }
    }

    async markFailed(logId: string | undefined, errorMessage: string): Promise<void> {
        if (!logId) return;
        try {
            const log = await this.repo.findOneById(logId);
            if (!log) return;
            await this.repo.update(log, {
                status: ENUM_MESSAGE_LOG_STATUS.FAILED,
                error_message: errorMessage?.slice(0, 2000),
                sent_at: new Date(),
            } as any);
        } catch (error) {
            this.logger.error(`Failed to mark log ${logId} as failed: ${error.message}`);
        }
    }

    async markSkipped(logId: string | undefined, reason?: string): Promise<void> {
        if (!logId) return;
        try {
            const log = await this.repo.findOneById(logId);
            if (!log) return;
            await this.repo.update(log, {
                status: ENUM_MESSAGE_LOG_STATUS.SKIPPED,
                error_message: reason?.slice(0, 2000),
                sent_at: new Date(),
            } as any);
        } catch (error) {
            this.logger.error(`Failed to mark log ${logId} as skipped: ${error.message}`);
        }
    }

    /**
     * Admin list with filters. Used by the message-log admin controller.
     */
    async list(filter: IListMessageLogsFilter): Promise<{ items: MessageLogEntity[]; total: number }> {
        const find: Record<string, any> = { deleted: false };

        if (filter.company_id) find.company_id = filter.company_id;
        if (filter.location_id) find.location_id = filter.location_id;
        if (filter.channel) find.channel = filter.channel;
        if (filter.event_key) find.event_key = filter.event_key;
        if (filter.status) find.status = filter.status;

        if (filter.date_from || filter.date_to) {
            const range: any = {};
            if (filter.date_from) range.$gte = filter.date_from;
            if (filter.date_to) range.$lte = filter.date_to;
            find.createdAt = range;
        }

        if (filter.recipient_search) {
            // ILIKE substring search via $regex translation in base repo
            find.recipient_address = { $regex: filter.recipient_search, $options: 'i' };
        }

        const [items, total] = await Promise.all([
            this.repo.findAll<MessageLogEntity>(find, {
                paging: {
                    limit: filter.limit ?? 25,
                    offset: filter.offset ?? 0,
                },
                order: { createdAt: (filter.order_dir || 'DESC') as any },
            }),
            this.repo.getTotal(find),
        ]);

        return { items, total };
    }

    async findOneById(id: string): Promise<MessageLogEntity | null> {
        return (await this.repo.findOneById(id)) as MessageLogEntity | null;
    }

    /**
     * Hard-delete logs older than retention window. Called by the daily cron.
     */
    async pruneOldLogs(): Promise<number> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MESSAGE_LOG_RETENTION_DAYS);
        const removed = await this.repo.deleteOlderThan(cutoff);
        if (removed > 0) {
            this.logger.log(`🧹 Pruned ${removed} message log(s) older than ${MESSAGE_LOG_RETENTION_DAYS} days`);
        }
        return removed;
    }
}
