import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CountryEntity } from '@modules/country/repository/entities/country.entity';

@Injectable()
export class CountryRepository extends DatabaseObjectIdRepositoryBase<
    CountryEntity
> {
    constructor(
        @InjectDatabaseModel(CountryEntity)
        private readonly countryRepository: Repository<CountryEntity>
    ) {
        super(countryRepository);
    }
}
