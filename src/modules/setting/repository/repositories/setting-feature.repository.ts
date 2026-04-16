import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    SettingFeatureEntity,
} from '@modules/setting/repository/entities/setting-feature.entity';

@Injectable()
export class SettingFeatureRepository extends DatabaseObjectIdRepositoryBase<
    SettingFeatureEntity
> {
    constructor(
        @InjectDatabaseModel(SettingFeatureEntity)
        private readonly settingFeatureRepository: Repository<SettingFeatureEntity>
    ) {
        super(settingFeatureRepository);
    }
}
