import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CountryEntity } from '@modules/country/repository/entities/country.entity';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';

@Module({
    providers: [CountryRepository],
    exports: [CountryRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [CountryEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CountryRepositoryModule {}
