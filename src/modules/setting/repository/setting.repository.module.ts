import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { SettingFeatureRepository } from '@modules/setting/repository/repositories/setting-feature.repository';
import { SettingFeatureEntity } from '@modules/setting/repository/entities/setting-feature.entity';

@Module({
    providers: [SettingFeatureRepository],
    exports: [SettingFeatureRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [SettingFeatureEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class SettingRepositoryModule {}
