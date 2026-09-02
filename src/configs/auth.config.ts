import { registerAs } from '@nestjs/config';
import ms from 'ms';

export default registerAs(
    'auth',
    (): Record<string, any> => ({
        jwt: {
            accessToken: {
                secret: process.env.AUTH_JWT_ACCESS_TOKEN_SECRET,
                expirationTime: ms(process.env.AUTH_JWT_ACCESS_TOKEN_EXPIRED as ms.StringValue) / 1000,
            },
            refreshToken: {
                secret: process.env.AUTH_JWT_REFRESH_TOKEN_SECRET,
                expirationTime: ms(process.env.AUTH_JWT_REFRESH_TOKEN_EXPIRED as ms.StringValue) / 1000,
            },
            algorithm: 'HS256',
            audience: process.env.AUTH_JWT_AUDIENCE,
            issuer: process.env.AUTH_JWT_ISSUER,
            header: 'Authorization',
            prefix: 'Bearer',
        },

        password: {
            attempt: true,
            maxAttempt: 5,
            // bcrypt cost factor (not a byte length) — OWASP minimum is 10-12.
            // No migration needed: bcrypt embeds its own cost in each hash,
            // so existing hashes keep verifying at their original cost; only
            // newly-created/changed passwords get the higher cost.
            saltLength: 12,
            expiredIn: ms('182d') / 1000, // 0.5 years
            expiredInTemporary: ms('3d') / 1000, // 3 days
            period: ms('90d') / 1000, // 3 months
            defaultPassword: process.env.DEFAULT_PASSWORD || 'Welcome@123',
        },

        apple: {
            header: 'Authorization',
            prefix: 'Bearer',
            clientId: process.env.AUTH_SOCIAL_APPLE_CLIENT_ID,
            signInClientId: process.env.AUTH_SOCIAL_APPLE_SIGN_IN_CLIENT_ID,
        },
        google: {
            header: 'Authorization',
            prefix: 'Bearer',
            clientId: process.env.AUTH_SOCIAL_GOOGLE_CLIENT_ID,
            clientSecret: process.env.AUTH_SOCIAL_GOOGLE_CLIENT_SECRET,
        },
    })
);
