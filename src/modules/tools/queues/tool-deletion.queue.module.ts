import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule,
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => {
                const config = {
                    connection: {
                        host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
                        port: configService.get<number>('REDIS_PORT', 6379),
                        username: configService.get<string>('REDIS_USERNAME'),
                        password: configService.get<string>('REDIS_PASSWORD'),
                        db: configService.get<number>('REDIS_DB', 0), // Different DB per instance
                    },
                };
                return config;
            },
            inject: [ConfigService],
        }),
        BullModule.registerQueue({
            name: process.env.TOOL_DELETION_QUEUE_NAME || 'tool-deletion',
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: 100,
                removeOnFail: 500,
            },
        }),
    ],
    exports: [BullModule],
})
export class ToolDeletionQueueModule {
    constructor() {}
}
