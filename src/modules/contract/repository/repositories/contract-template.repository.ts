import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ContractTemplateEntity } from '../entities/contract-template.entity';

@Injectable()
export class ContractTemplateRepository extends DatabaseObjectIdRepositoryBase<ContractTemplateEntity> {
    constructor(
        @InjectDatabaseModel(ContractTemplateEntity)
        private readonly repo: Repository<ContractTemplateEntity>
    ) {
        super(repo);
    }
}
