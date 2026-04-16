import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ContractSectionEntity } from '../entities/contract-section.entity';

@Injectable()
export class ContractSectionRepository extends DatabaseObjectIdRepositoryBase<ContractSectionEntity> {
    constructor(
        @InjectDatabaseModel(ContractSectionEntity)
        private readonly repo: Repository<ContractSectionEntity>
    ) {
        super(repo);
    }
}
