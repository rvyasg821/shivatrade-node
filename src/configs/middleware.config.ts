import { registerAs } from '@nestjs/config';
import bytes from 'bytes';
import ms from 'ms';

export default registerAs(
    'middleware',
    (): Record<string, any> => ({
        body: {
            json: {
                maxFileSize: bytes('100kb'), // 100kb
            },
            raw: {
                maxFileSize: bytes('100kb'), // 100kb
            },
            text: {
                maxFileSize: bytes('100kb'), // 100kb
            },
            urlencoded: {
                maxFileSize: bytes('100kb'), // 100kb
            },
        },
        timeout: ms('30s'), // 30s based on ms module
        cors: {
            allowMethod: [
                'GET',
                'DELETE',
                'PUT',
                'PATCH',
                'POST',
                'HEAD',
                'OPTIONS',
            ],
            allowOrigin: process.env.MIDDLEWARE_CORS_ORIGIN === '*' ? '*' : (process.env.MIDDLEWARE_CORS_ORIGIN?.split(',') ?? []),
            allowHeader: [
                'Accept',
                'Accept-Language',
                'Content-Language',
                'Content-Type',
                'Origin',
                'Authorization',
                'Access-Control-Request-Method',
                'Access-Control-Request-Headers',
                'Access-Control-Allow-Headers',
                'Access-Control-Allow-Origin',
                'Access-Control-Allow-Methods',
                'Access-Control-Allow-Credentials',
                'Access-Control-Expose-Headers',
                'Access-Control-Max-Age',
                'Referer',
                'Host',
                'X-Requested-With',
                'x-custom-lang',
                'x-timestamp',

                'x-timezone',
                'x-request-id',
                'x-version',
                'x-repo-version',
                'X-Response-Time',
                'user-agent',
                'x-tenant-id',
                'x-tenant',
                'tenant',
            ],
        },
        throttle: {
            ttl: ms('500'), // 0.5 secs
            limit: 10, // max request per reset time
        },
    })
);
