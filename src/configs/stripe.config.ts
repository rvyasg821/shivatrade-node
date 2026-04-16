import { registerAs } from '@nestjs/config';

export default registerAs(
    'stripe',
    (): Record<string, any> => ({
        mode: process.env.STRIPE_MODE || 'sandbox',
        publishableKey: {
            sandbox: process.env.STRIPE_PUBLISHABLE_KEY_SANDBOX,
            live: process.env.STRIPE_PUBLISHABLE_KEY_LIVE,
        },
        secretKey: {
            sandbox: process.env.STRIPE_SECRET_KEY_SANDBOX,
            live: process.env.STRIPE_SECRET_KEY_LIVE,
        },
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        currency: process.env.STRIPE_CURRENCY || 'USD',
    })
);
