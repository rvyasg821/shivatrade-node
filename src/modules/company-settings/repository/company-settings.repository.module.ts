import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { CompanySettingsRepository } from './repositories/company-settings.repository';

@Module({
    providers: [CompanySettingsRepository],
    exports: [CompanySettingsRepository],
    imports: [
        TypeOrmModule.forFeature(
            [CompanySettingsEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CompanySettingsRepositoryModule {}
