import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import {
    DatabaseModule,
    DatabaseOptionModule,
} from '@common/database/database.module';
import { MessageModule } from '@common/message/message.module';
import { HelperModule } from '@common/helper/helper.module';
import { RequestModule } from '@common/request/request.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configs from '@config';
import { PaginationModule } from '@common/pagination/pagination.module';
import { FileModule } from '@common/file/file.module';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule, CacheOptions } from '@nestjs/cache-manager';
import { DatabaseOptionService } from '@common/database/services/database.options.service';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { LoggerOptionModule } from '@common/logger/logger.option.module';
import { LoggerOptionService } from '@common/logger/services/logger.option.service';
import { createKeyv, RedisClientOptions } from '@keyv/redis';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PayPalModule } from '@common/paypal/paypal.module';
import { PdfModule } from '@common/pdf/pdf.module';

@Module({
    controllers: [],
    providers: [],
    imports: [
        ConfigModule.forRoot({
            load: configs,
            isGlobal: true,
            cache: true,
            envFilePath: ['.env'],
            expandVariables: false,
        }),

        ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'jwks'),
            serveRoot: '/.well-known/jwks',
        }),

        TypeOrmModule.forRootAsync({
            name: DATABASE_CONNECTION_NAME,
            imports: [DatabaseOptionModule],
            inject: [DatabaseOptionService],
            useFactory: (databaseService: DatabaseOptionService) =>
                databaseService.createOptions(),
        }),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                connection: {
                    host: configService.get<string>('redis.queue.host'),
                    port: configService.get<number>('redis.queue.port'),
                    username: configService.get<string>('redis.queue.username'),
                    password: configService.get<string>('redis.queue.password'),
                    tls: configService.get<any>('redis.queue.tls'),
                },
                defaultJobOptions: {
                    backoff: {
                        type: 'exponential',
                        delay: 3000,
                    },
                    attempts: 3,
                },
            }),
        }),
        CacheModule.registerAsync({
            isGlobal: true,
            imports: [ConfigModule],
            useFactory: async (
                configService: ConfigService
            ): Promise<CacheOptions> => ({
                max: configService.get<number>('redis.cached.max'),
                ttl: configService.get<number>('redis.cached.ttl'),
                stores: [
                    createKeyv({
                        socket: {
                            host: configService.get<string>(
                                'redis.cached.host'
                            ),
                            port: configService.get<number>(
                                'redis.cached.port'
                            ),
                        },
                        username: configService.get<string>(
                            'redis.cached.username'
                        ),
                        password: configService.get<string>(
                            'redis.cached.password'
                        ),
                    } as RedisClientOptions).store,
                ],
            }),
            inject: [ConfigService],
        }),
        PinoLoggerModule.forRootAsync({
            imports: [LoggerOptionModule],
            inject: [LoggerOptionService],
            useFactory: async (loggerOptionService: LoggerOptionService) => {
                return loggerOptionService.createOptions();
            },
        }),
        MessageModule.forRoot(),
        HelperModule.forRoot(),
        RequestModule.forRoot(),
        AuthModule.forRoot(),
        FileModule.forRoot(),
        DatabaseModule.forRoot(),
        PaginationModule.forRoot(),
        PayPalModule,
        PdfModule,
    ],
})
export class CommonModule { }
