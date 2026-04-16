import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CompanyLookupEntity } from '@modules/company-lookup/repository/entities/company-lookup.entity';

@Injectable()
export class CompanyLookupRepository extends DatabaseObjectIdRepositoryBase<CompanyLookupEntity> {
    constructor(
        @InjectDatabaseModel(CompanyLookupEntity)
        private readonly companyLookupRepository: Repository<CompanyLookupEntity>
    ) {
        super(companyLookupRepository);
    }
}
