import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { EmployeeContractEntity } from '../entities/employee-contract.entity';

@Injectable()
export class EmployeeContractRepository extends DatabaseObjectIdRepositoryBase<EmployeeContractEntity> {
    constructor(
        @InjectDatabaseModel(EmployeeContractEntity)
        private readonly repo: Repository<EmployeeContractEntity>
    ) {
        super(repo);
    }
}
