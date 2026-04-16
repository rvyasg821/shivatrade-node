import { Module } from '@nestjs/common';
import { CountryRepositoryModule } from '@modules/country/repository/country.repository.module';
import { CountryService } from '@modules/country/services/country.service';

@Module({
    controllers: [],
    providers: [CountryService],
    exports: [CountryService],
    imports: [CountryRepositoryModule],
})
export class CountryModule {}
