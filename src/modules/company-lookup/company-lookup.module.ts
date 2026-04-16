import { Module } from '@nestjs/common';
import { CompanyLookupRepositoryModule } from '@modules/company-lookup/repository/company-lookup.repository.module';
import { CompanyLookupService } from '@modules/company-lookup/services/company-lookup.service';

@Module({
    controllers: [],
    providers: [CompanyLookupService],
    exports: [CompanyLookupService],
    imports: [CompanyLookupRepositoryModule],
})
export class CompanyLookupModule {}
