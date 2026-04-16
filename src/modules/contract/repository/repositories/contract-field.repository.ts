import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ContractFieldEntity } from '../entities/contract-field.entity';

@Injectable()
export class ContractFieldRepository extends DatabaseObjectIdRepositoryBase<ContractFieldEntity> {
    constructor(
        @InjectDatabaseModel(ContractFieldEntity)
        private readonly repo: Repository<ContractFieldEntity>
    ) {
        super(repo);
    }
}
