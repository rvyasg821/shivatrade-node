import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import {
    ThrottlerGuard,
    ThrottlerModule,
    ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AppGeneralFilter } from '@app/filters/app.general.filter';
import { AppHttpFilter } from '@app/filters/app.http.filter';
import { AppValidationImportFilter } from '@app/filters/app.validation-import.filter';
import { AppValidationFilter } from '@app/filters/app.validation.filter';
import {
    AppJsonBodyParserMiddleware,
    AppRawBodyParserMiddleware,
    AppTextBodyParserMiddleware,
    AppUrlencodedBodyParserMiddleware,
} from '@app/middlewares/app.body-parser.middleware';
import { AppCorsMiddleware } from '@app/middlewares/app.cors.middleware';
import { AppCustomLanguageMiddleware } from '@app/middlewares/app.custom-language.middleware';
import { AppHelmetMiddleware } from '@app/middlewares/app.helmet.middleware';
import { AppResponseTimeMiddleware } from '@app/middlewares/app.response-time.middleware';
import { AppUrlVersionMiddleware } from '@app/middlewares/app.url-version.middleware';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppRequestIdMiddleware } from '@app/middlewares/app.request-id.middleware';
import { TrackingModule } from '@modules/tracking/tracking.module';
import { ApiCallLogMiddleware } from '@modules/tracking/middlewares/api-call-log.middleware';
import { RequestContextMiddleware } from '@common/request/middlewares/request-context.middleware';

@Module({
    controllers: [],
    exports: [],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        {
            provide: APP_FILTER,
            useClass: AppGeneralFilter,
        },
        {
            provide: APP_FILTER,
            useClass: AppValidationFilter,
        },
        {
            provide: APP_FILTER,
            useClass: AppValidationImportFilter,
        },
        {
            provide: APP_FILTER,
            useClass: AppHttpFilter,
        },
    ],
    
    imports: [
        SentryModule.forRoot(),
        // Provides ApiCallLogMiddleware with its dependencies. Deliberately NOT
        // an APP_INTERCEPTOR — see ApiCallLogMiddleware's class doc.
        TrackingModule,
        ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService): ThrottlerModuleOptions => ({
                throttlers: [
                    {
                        ttl: config.get<number>('middleware.throttle.ttl'),
                        limit: config.get<number>('middleware.throttle.limit'),
                    },
                ],
            }),
        }),

    ],
})
export class AppMiddlewareModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(
                AppRequestIdMiddleware,
                // Immediately after req.id exists and BEFORE the auth guard, so
                // the AsyncLocalStorage scope wraps guards, handler and every
                // repository call the audit subscriber later observes.
                RequestContextMiddleware,
                AppHelmetMiddleware,
                AppJsonBodyParserMiddleware,
                AppTextBodyParserMiddleware,
                AppRawBodyParserMiddleware,
                AppUrlencodedBodyParserMiddleware,
                AppCorsMiddleware,
                AppUrlVersionMiddleware,
                AppResponseTimeMiddleware,
                AppCustomLanguageMiddleware,
                // Last: needs req.id from AppRequestIdMiddleware. Only registers
                // an res.on('finish') listener, so it adds nothing to the
                // request path and cannot alter a response.
                ApiCallLogMiddleware
            )
            // .exclude({
            //     path: '.well-known/jwks/jwks.json',
            //     method: RequestMethod.GET,
            // })
            .forRoutes('{*wildcard}')
            
    }
}
