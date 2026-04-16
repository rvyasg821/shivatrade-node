import { registerAs } from '@nestjs/config';

export default registerAs(
    'database',
    (): Record<string, any> => ({
        host: process.env?.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env?.DATABASE_PORT ?? '5432', 10),
        username: process.env?.DATABASE_USERNAME ?? 'postgres',
        password: process.env?.DATABASE_PASSWORD ?? 'postgres',
        name: process.env?.DATABASE_NAME ?? 'hrm',
        synchronize: process.env?.DATABASE_SYNC !== 'false',
        debug: process.env.DATABASE_DEBUG === 'true',
    })
);
