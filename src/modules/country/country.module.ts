import { Module } from '@nestjs/common';
import { CountryRepositoryModule } from '@modules/country/repository/country.repository.module';
import { CountryService } from '@modules/country/services/country.service';
import { CountrySeedService } from '@modules/country/services/country-seed.service';
import { CountryAdminController } from '@modules/country/controllers/country.admin.controller';
import { StateRepositoryModule } from '@modules/state/repository/state.repository.module';
import { CityRepositoryModule } from '@modules/city/repository/city.repository.module';

/**
 * The state/city REPOSITORY modules are imported for the delete guard — the
 * controller refuses to remove a country that still has states or cities under
 * it. Repositories only, so StateModule (which imports this module) does not
 * form a cycle.
 */
@Module({
    controllers: [CountryAdminController],
    providers: [CountryService, CountrySeedService],
    exports: [CountryService, CountrySeedService, CountryRepositoryModule],
    imports: [
        CountryRepositoryModule,
        StateRepositoryModule,
        CityRepositoryModule,
    ],
})
export class CountryModule {}
