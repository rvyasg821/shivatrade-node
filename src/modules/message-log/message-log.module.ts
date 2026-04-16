import { Global, Module } from '@nestjs/common';
import { MessageLogRepositoryModule } from './repository/message-log.repository.module';
import { MessageLogService } from './services/message-log.service';
import { MessageLogRetentionCron } from './services/message-log-retention.cron';

/**
 * Global so NodemailerService, TwilioSmsService, WhatsAppService, and the
 * NotificationService can all inject MessageLogService without each module
 * having to import this one explicitly.
 */
@Global()
@Module({
    imports: [MessageLogRepositoryModule],
    providers: [MessageLogService, MessageLogRetentionCron],
    exports: [MessageLogService, MessageLogRepositoryModule],
})
export class MessageLogModule {}
