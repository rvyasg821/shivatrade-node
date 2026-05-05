import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CompanyBankAccountDoc,
    CompanyBankAccountEntity,
} from '../entities/company-bank-account.entity';

@Injectable()
export class CompanyBankAccountRepository extends DatabaseObjectIdRepositoryBase<CompanyBankAccountEntity> {
    constructor(
        @InjectDatabaseModel(CompanyBankAccountEntity)
        private readonly cbaRepository: Repository<CompanyBankAccountEntity>
    ) {
        super(cbaRepository);
    }

    async findByCompanyId(companyId: string): Promise<CompanyBankAccountDoc[]> {
        return this.findAll({ company_id: companyId, soft_delete: false });
    }

    async findByCompanyIds(companyIds: string[]): Promise<CompanyBankAccountDoc[]> {
        if (companyIds.length === 0) return [];
        return this._repository.find({
            where: { company_id: In(companyIds), soft_delete: false } as any,
        });
    }

    async softDeleteByCompanyId(companyId: string): Promise<void> {
        await this._repository.update(
            { company_id: companyId, soft_delete: false } as any,
            { soft_delete: true } as any
        );
    }
}
