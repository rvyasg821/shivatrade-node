import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CompanyLookupEntity } from '@modules/company-lookup/repository/entities/company-lookup.entity';
import { CompanyLookupRepository } from '@modules/company-lookup/repository/repositories/company-lookup.repository';

@Module({
    providers: [CompanyLookupRepository],
    exports: [CompanyLookupRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [CompanyLookupEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CompanyLookupRepositoryModule {}
