import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ContractFieldValueEntity } from '../entities/contract-field-value.entity';

@Injectable()
export class ContractFieldValueRepository extends DatabaseObjectIdRepositoryBase<ContractFieldValueEntity> {
    constructor(
        @InjectDatabaseModel(ContractFieldValueEntity)
        private readonly repo: Repository<ContractFieldValueEntity>
    ) {
        super(repo);
    }
}
