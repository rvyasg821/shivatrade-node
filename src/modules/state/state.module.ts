import { Module } from '@nestjs/common';
import { StateRepositoryModule } from './repository/state.repository.module';
import { StateService } from './services/state.service';
import { StateImportExportService } from './services/state.import-export.service';
import { StateSeedService } from './services/state-seed.service';
import { FileModule } from '@common/file/file.module';
import { StateAdminController } from './controllers/state.admin.controller';
import { CountryModule } from '@modules/country/country.module';
import { CityRepositoryModule } from '@modules/city/repository/city.repository.module';

/**
 * `CityRepositoryModule` is imported for the delete guard only — the controller
 * counts a state's cities before it will remove it. It pulls in the repository,
 * not CityModule, so there is no cycle with CityModule (which imports this one).
 */
@Module({
    imports: [
        StateRepositoryModule,
        CountryModule,
        CityRepositoryModule,
        FileModule.forRoot(),
    ],
    providers: [StateService, StateSeedService, StateImportExportService],
    // StateSeedService is exported so CitySeedService can drive the
    // country → state → city seed chain in order instead of relying on Nest's
    // bootstrap-hook ordering.
    exports: [
        StateRepositoryModule,
        StateService,
        StateSeedService,
        StateImportExportService,
    ],
    controllers: [StateAdminController],
})
export class StateModule {}
