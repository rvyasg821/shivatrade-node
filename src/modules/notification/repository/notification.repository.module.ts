import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { NotificationEventEntity } from './entities/notification-event.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationPreferenceEntity } from './entities/notification-preference.entity';
import { NotificationEventRepository } from './repositories/notification-event.repository';
import { NotificationTemplateRepository } from './repositories/notification-template.repository';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';

@Module({
    providers: [
        NotificationEventRepository,
        NotificationTemplateRepository,
        NotificationPreferenceRepository,
    ],
    exports: [
        NotificationEventRepository,
        NotificationTemplateRepository,
        NotificationPreferenceRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                NotificationEventEntity,
                NotificationTemplateEntity,
                NotificationPreferenceEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class NotificationRepositoryModule {}
