import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ContractTemplateEntity } from './entities/contract-template.entity';
import { ContractSectionEntity } from './entities/contract-section.entity';
import { ContractFieldEntity } from './entities/contract-field.entity';
import { EmployeeContractEntity } from './entities/employee-contract.entity';
import { ContractFieldValueEntity } from './entities/contract-field-value.entity';
import { ContractTemplateRepository } from './repositories/contract-template.repository';
import { ContractSectionRepository } from './repositories/contract-section.repository';
import { ContractFieldRepository } from './repositories/contract-field.repository';
import { EmployeeContractRepository } from './repositories/employee-contract.repository';
import { ContractFieldValueRepository } from './repositories/contract-field-value.repository';

@Module({
    providers: [
        ContractTemplateRepository,
        ContractSectionRepository,
        ContractFieldRepository,
        EmployeeContractRepository,
        ContractFieldValueRepository,
    ],
    exports: [
        ContractTemplateRepository,
        ContractSectionRepository,
        ContractFieldRepository,
        EmployeeContractRepository,
        ContractFieldValueRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                ContractTemplateEntity,
                ContractSectionEntity,
                ContractFieldEntity,
                EmployeeContractEntity,
                ContractFieldValueEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ContractRepositoryModule {}
