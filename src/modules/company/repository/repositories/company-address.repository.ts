import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CompanyAddressDoc,
    CompanyAddressEntity,
} from '../entities/company-address.entity';

@Injectable()
export class CompanyAddressRepository extends DatabaseObjectIdRepositoryBase<CompanyAddressEntity> {
    constructor(
        @InjectDatabaseModel(CompanyAddressEntity)
        private readonly caRepository: Repository<CompanyAddressEntity>
    ) {
        super(caRepository);
    }

    async findByCompanyId(companyId: string): Promise<CompanyAddressDoc[]> {
        return this.findAll({ company_id: companyId, soft_delete: false });
    }

    async findByCompanyIds(companyIds: string[]): Promise<CompanyAddressDoc[]> {
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
