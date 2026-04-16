import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { LocationEntity } from './entities/location.entity';
import { LocationRepository } from './repositories/location.repository';

@Module({
    providers: [LocationRepository],
    exports: [LocationRepository],
    imports: [
        TypeOrmModule.forFeature(
            [LocationEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class LocationRepositoryModule {}
