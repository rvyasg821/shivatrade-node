import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CompanySettingsEntity } from '../entities/company-settings.entity';

@Injectable()
export class CompanySettingsRepository extends DatabaseObjectIdRepositoryBase<CompanySettingsEntity> {
    constructor(
        @InjectDatabaseModel(CompanySettingsEntity)
        private readonly repo: Repository<CompanySettingsEntity>
    ) {
        super(repo);
    }
}
