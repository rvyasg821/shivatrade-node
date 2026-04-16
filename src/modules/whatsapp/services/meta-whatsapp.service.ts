import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetaWhatsAppService {
    private readonly logger = new Logger(MetaWhatsAppService.name);

    async send(config: any, to: string, body: string): Promise<any> {
        try {
            const phoneNumberId = config.whatsapp_from_number;
            const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

            this.logger.log(`📱 Sending WhatsApp (Meta) to: ${to}`);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.whatsapp_api_key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to,
                    type: 'text',
                    text: { body },
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                this.logger.error(`📱 Meta WhatsApp API error: ${JSON.stringify(result)}`);
                throw new Error(`Meta WhatsApp API error: ${result?.error?.message || response.statusText}`);
            }

            this.logger.log(`📱 WhatsApp (Meta) sent successfully: ${JSON.stringify(result?.messages?.[0]?.id)}`);
            return result;
        } catch (error) {
            this.logger.error(`📱 Failed to send WhatsApp (Meta) to ${to}: ${error.message}`);
            throw error;
        }
    }
}
