import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CityEntity } from './entities/city.entity';
import { CityRepository } from './repositories/city.repository';

@Module({
    providers: [CityRepository],
    exports: [CityRepository],
    imports: [TypeOrmModule.forFeature([CityEntity], DATABASE_CONNECTION_NAME)],
})
export class CityRepositoryModule {}
