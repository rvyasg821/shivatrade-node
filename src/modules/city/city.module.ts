import { Module } from '@nestjs/common';
import { CityRepositoryModule } from './repository/city.repository.module';
import { CityService } from './services/city.service';
import { CityImportExportService } from './services/city.import-export.service';
import { CitySeedService } from './services/city-seed.service';
import { FileModule } from '@common/file/file.module';
import { CityAdminController } from './controllers/city.admin.controller';
import { StateModule } from '@modules/state/state.module';
import { CountryRepositoryModule } from '@modules/country/repository/country.repository.module';

/**
 * Imports StateModule (for StateSeedService, so the seed chain runs in order)
 * and the country REPOSITORY module (to label rows). No cycle: StateModule
 * imports CityRepositoryModule, never CityModule.
 */
@Module({
    imports: [
        CityRepositoryModule,
        StateModule,
        CountryRepositoryModule,
        FileModule.forRoot(),
    ],
    providers: [CityService, CitySeedService, CityImportExportService],
    exports: [CityRepositoryModule, CityService, CityImportExportService],
    controllers: [CityAdminController],
})
export class CityModule {}
