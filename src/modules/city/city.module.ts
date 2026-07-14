import { Module } from '@nestjs/common';
import { CityRepositoryModule } from './repository/city.repository.module';
import { CityService } from './services/city.service';
import { CitySeedService } from './services/city-seed.service';
import { CityAdminController } from './controllers/city.admin.controller';
import { StateModule } from '@modules/state/state.module';
import { CountryRepositoryModule } from '@modules/country/repository/country.repository.module';

/**
 * Imports StateModule (for StateSeedService, so the seed chain runs in order)
 * and the country REPOSITORY module (to label rows). No cycle: StateModule
 * imports CityRepositoryModule, never CityModule.
 */
@Module({
    imports: [CityRepositoryModule, StateModule, CountryRepositoryModule],
    providers: [CityService, CitySeedService],
    exports: [CityRepositoryModule, CityService],
    controllers: [CityAdminController],
})
export class CityModule {}
