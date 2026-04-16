import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { HelperDateService } from '@common/helper/services/helper.date.service';

import { SmsSendRequestDto } from '@modules/sms/dtos/request/sms.send.request.dto';
import { SmsVerificationRequestDto } from '@modules/sms/dtos/request/sms.verification.request.dto';
import { ISmsService } from '@modules/sms/interfaces/sms.service.interface';
import { TwilioSmsService, SmsConfig } from './twilio-sms.service';
import { MessageLogService } from '@modules/message-log/services/message-log.service';
import { ENUM_MESSAGE_LOG_CHANNEL } from '@modules/message-log/enums/message-log.enum';

@Injectable()
export class SmsService implements ISmsService {
    private readonly logger = new Logger(SmsService.name);
    private messageVerification: string;

    private readonly homeName: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly helperDateService: HelperDateService,
        private readonly twilioSmsService: TwilioSmsService,
        private readonly messageLogService: MessageLogService,
    ) {
        this.messageVerification = readFileSync(
            `${__dirname}/../templates/verification.template.txt`,
            'utf8'
        );

        this.homeName = this.configService.get<string>('home.name')!;
    }

    /**
     * Safely call a message-log method. Logging is observability and must NEVER
     * block or fail an SMS send. Wrapped in try/catch + optional chaining so
     * DI failures, missing tables, or DB latency can't take down the send.
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

    /**
     * General-purpose SMS send using company config
     */
    async sendSms(config: SmsConfig, to: string, body: string): Promise<any> {
        const log = await this.safeLog(() => this.messageLogService.createPending({
            channel: ENUM_MESSAGE_LOG_CHANNEL.SMS,
            recipient_address: to,
            body,
            provider: 'twilio',
        }));

        if (!config.sms_api_key || !config.sms_api_secret || !config.sms_from_number) {
            this.logger.warn('📱 SMS config incomplete, skipping send');
            await this.safeLog(() => this.messageLogService.markSkipped(log?._id, 'SMS config incomplete'));
            return null;
        }
        try {
            const result = await this.twilioSmsService.send(config, to, body);
            await this.safeLog(() => this.messageLogService.markSent(log?._id, result?.sid));
            return result;
        } catch (error) {
            await this.safeLog(() => this.messageLogService.markFailed(log?._id, error.message));
            throw error;
        }
    }

    async sendVerification(
        { name, mobileNumber }: SmsSendRequestDto,
        { expiredAt, otp }: SmsVerificationRequestDto,
        smsConfig?: SmsConfig,
    ): Promise<void> {
        const message = this.messageVerification
            .replace('{name}', name)
            .replace('{otp}', otp)
            .replace(
                '{expiredAt}',
                this.helperDateService.formatToRFC2822(expiredAt)
            )
            .replace('{homeName}', this.homeName);

        if (smsConfig && smsConfig.sms_api_key) {
            await this.sendSms(smsConfig, mobileNumber, message);
        } else {
            this.logger.log(`📱 [SKIPPED] No SMS config provided for verification to ${mobileNumber}`);
        }
    }
}
