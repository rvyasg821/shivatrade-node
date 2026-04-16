import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TwilioWhatsAppService {
    private readonly logger = new Logger(TwilioWhatsAppService.name);

    async send(config: any, to: string, body: string): Promise<any> {
        try {
            const twilio = require('twilio');
            const client = twilio(config.whatsapp_api_key, config.whatsapp_api_secret);

            const fromNumber = config.whatsapp_from_number.startsWith('whatsapp:')
                ? config.whatsapp_from_number
                : `whatsapp:${config.whatsapp_from_number}`;

            const toNumber = to.startsWith('whatsapp:')
                ? to
                : `whatsapp:${to}`;

            this.logger.log(`📱 Sending WhatsApp (Twilio) to: ${to}`);
            const message = await client.messages.create({
                body,
                from: fromNumber,
                to: toNumber,
            });
            this.logger.log(`📱 WhatsApp sent successfully: SID=${message.sid}`);
            return message;
        } catch (error) {
            this.logger.error(`📱 Failed to send WhatsApp (Twilio) to ${to}: ${error.message}`);
            throw error;
        }
    }
}
