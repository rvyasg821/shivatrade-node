import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionToolLoggerService } from './services/subscription-tool-logger.service';

@Module({
    imports: [ConfigModule],
    providers: [SubscriptionToolLoggerService],
    exports: [SubscriptionToolLoggerService],
})
export class SubscriptionToolLoggerModule { }