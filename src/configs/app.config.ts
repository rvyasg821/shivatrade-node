import { registerAs } from '@nestjs/config';
import { version } from 'package.json';

export default registerAs(
    'app',
    (): Record<string, any> => ({
        name: process.env.APP_NAME,
        // "single" = single-tenant ShivaTrade build; "saas" = multi-tenant/subscription billing
        mode: process.env.APP_MODE || 'single',
        env: process.env.APP_ENV,
        timezone: process.env.APP_TIMEZONE,
        version,
        globalPrefix: '/api',

        http: {
            host: process.env.HTTP_HOST,
            port: Number.parseInt(process.env.HTTP_PORT),
        },
        urlVersion: {
            enable: process.env.URL_VERSIONING_ENABLE === 'true',
            prefix: 'v',
            version: process.env.URL_VERSION,
        },
    })
);
