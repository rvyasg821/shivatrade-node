import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { NotificationEventEntity } from '../entities/notification-event.entity';

@Injectable()
export class NotificationEventRepository extends DatabaseObjectIdRepositoryBase<NotificationEventEntity> {
    constructor(
        @InjectDatabaseModel(NotificationEventEntity)
        private readonly repo: Repository<NotificationEventEntity>
    ) {
        super(repo);
    }

    async findByEventKey(eventKey: string): Promise<NotificationEventEntity | null> {
        return this.findOne({ event_key: eventKey, is_active: true, deleted: false }) as Promise<NotificationEventEntity | null>;
    }

    async findByModule(module: string): Promise<NotificationEventEntity[]> {
        return this.findAll({ module, is_active: true, deleted: false }) as Promise<NotificationEventEntity[]>;
    }

    async findAllActive(): Promise<NotificationEventEntity[]> {
        return this.findAll({ is_active: true, deleted: false }) as Promise<NotificationEventEntity[]>;
    }
}
