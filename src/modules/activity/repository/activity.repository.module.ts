import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ActivityEntity } from '@modules/activity/repository/entities/activity.entity';
import { ActivityRepository } from '@modules/activity/repository/repositories/activity.repository';

@Module({
    providers: [ActivityRepository],
    exports: [ActivityRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [ActivityEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ActivityRepositoryModule {}
