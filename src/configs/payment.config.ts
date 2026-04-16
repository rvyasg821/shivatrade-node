import { registerAs } from '@nestjs/config';

export default registerAs(
    'payment',
    (): Record<string, any> => ({
        gateway: process.env.PAYMENT_GATEWAY || 'stripe', // Options: 'stripe' or 'paypal'
    })
);
