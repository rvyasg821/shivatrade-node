import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageLogService } from './message-log.service';

/**
 * Daily cron that prunes message_logs entries older than the retention window
 * (90 days by default — see MESSAGE_LOG_RETENTION_DAYS).
 */
@Injectable()
export class MessageLogRetentionCron {
    private readonly logger = new Logger(MessageLogRetentionCron.name);

    constructor(private readonly messageLogService: MessageLogService) {}

    /**
     * PM2 cluster guard: only run on the first instance.
     */
    private shouldRunCron(): boolean {
        if (process.env.CRON_ENABLED === 'false') return false;
        const instance = process.env.NODE_APP_INSTANCE;
        if (instance !== undefined && instance !== '0') return false;
        return true;
    }

    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async pruneOldLogs(): Promise<void> {
        if (!this.shouldRunCron()) return;
        this.logger.log('🧹 Starting message log retention prune');
        try {
            const removed = await this.messageLogService.pruneOldLogs();
            this.logger.log(`🧹 Message log retention prune complete (${removed} removed)`);
        } catch (error) {
            this.logger.error(`Message log prune failed: ${error.message}`);
        }
    }
}
