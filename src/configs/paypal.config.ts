import { registerAs } from '@nestjs/config';

export default registerAs(
    'paypal',
    (): Record<string, any> => ({
        mode: process.env.PAYPAL_MODE || 'sandbox',
        clientId: process.env.PAYPAL_CLIENT_ID,
        secretKey: process.env.PAYPAL_SEC_KEY,
        currency: process.env.PAYPAL_CURRENCY || 'USD',
        webhookId: process.env.PAYPAL_WEBHOOK_ID,
    })
);