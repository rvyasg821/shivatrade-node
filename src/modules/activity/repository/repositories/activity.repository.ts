import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ActivityEntity,
} from '@modules/activity/repository/entities/activity.entity';

@Injectable()
export class ActivityRepository extends DatabaseObjectIdRepositoryBase<
    ActivityEntity
> {
    constructor(
        @InjectDatabaseModel(ActivityEntity)
        private readonly activityRepository: Repository<ActivityEntity>
    ) {
        super(activityRepository);
    }
}
