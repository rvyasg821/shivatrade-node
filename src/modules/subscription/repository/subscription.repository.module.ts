import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { SubscriptionEntity } from './entities/subscription.entity';
import { SubscriptionRepository } from './repositories/subscription.repository';

@Module({
    providers: [SubscriptionRepository],
    exports: [SubscriptionRepository],
    imports: [
        TypeOrmModule.forFeature(
            [SubscriptionEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class SubscriptionRepositoryModule { }
