import { Injectable, Logger } from '@nestjs/common';

export interface SmsConfig {
    sms_api_key: string;   // Twilio Account SID
    sms_api_secret: string; // Twilio Auth Token
    sms_from_number: string;
}

@Injectable()
export class TwilioSmsService {
    private readonly logger = new Logger(TwilioSmsService.name);

    async send(config: SmsConfig, to: string, body: string): Promise<any> {
        try {
            const twilio = require('twilio');
            const client = twilio(config.sms_api_key, config.sms_api_secret);

            this.logger.log(`📱 Sending SMS to: ${to}`);
            const message = await client.messages.create({
                body,
                from: config.sms_from_number,
                to,
            });
            this.logger.log(`📱 SMS sent successfully: SID=${message.sid}`);
            return message;
        } catch (error) {
            this.logger.error(`📱 Failed to send SMS to ${to}: ${error.message}`);
            throw error;
        }
    }
}
