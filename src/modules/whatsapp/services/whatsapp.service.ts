import { Injectable, Logger } from '@nestjs/common';
import { TwilioWhatsAppService } from './twilio-whatsapp.service';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { MessageLogService } from '@modules/message-log/services/message-log.service';
import { ENUM_MESSAGE_LOG_CHANNEL } from '@modules/message-log/enums/message-log.enum';

export interface WhatsAppConfig {
    whatsapp_enabled: boolean;
    whatsapp_provider: string; // 'twilio' | 'meta'
    whatsapp_api_key: string;
    whatsapp_api_secret?: string; // needed for Twilio
    whatsapp_from_number: string;
}

@Injectable()
export class WhatsAppService {
    private readonly logger = new Logger(WhatsAppService.name);

    constructor(
        private readonly twilioWhatsAppService: TwilioWhatsAppService,
        private readonly metaWhatsAppService: MetaWhatsAppService,
        private readonly messageLogService: MessageLogService,
    ) {}

    /**
     * Safely call a message-log method. Logging is observability and must NEVER
     * block or fail a WhatsApp send. Wrapped in try/catch + optional chaining
     * so DI failures, missing tables, or DB latency can't take down the send.
     */
    private async safeLog<T>(fn: () => Promise<T>): Promise<T | undefined> {
        if (!this.messageLogService) return undefined;
        try {
            return await fn();
        } catch (err: any) {
            this.logger.warn(`Message log call failed (non-fatal): ${err?.message}`);
            return undefined;
        }
    }

    async send(config: WhatsAppConfig, to: string, body: string): Promise<any> {
        const log = await this.safeLog(() => this.messageLogService.createPending({
            channel: ENUM_MESSAGE_LOG_CHANNEL.WHATSAPP,
            recipient_address: to,
            body,
            provider: config.whatsapp_provider || 'unknown',
        }));

        if (!config.whatsapp_enabled) {
            this.logger.log('📱 [SKIPPED] WhatsApp not enabled');
            await this.safeLog(() => this.messageLogService.markSkipped(log?._id, 'WhatsApp not enabled'));
            return null;
        }

        try {
            let result: any;
            if (config.whatsapp_provider === 'twilio') {
                result = await this.twilioWhatsAppService.send(config, to, body);
                await this.safeLog(() => this.messageLogService.markSent(log?._id, result?.sid));
            } else if (config.whatsapp_provider === 'meta') {
                result = await this.metaWhatsAppService.send(config, to, body);
                await this.safeLog(() => this.messageLogService.markSent(log?._id, result?.messages?.[0]?.id));
            } else {
                throw new Error(`Unknown WhatsApp provider: ${config.whatsapp_provider}`);
            }
            return result;
        } catch (error) {
            await this.safeLog(() => this.messageLogService.markFailed(log?._id, error.message));
            throw error;
        }
    }
}
