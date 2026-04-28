import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CustomerDoc, CustomerEntity } from '../entities/customer.entity';

@Injectable()
export class CustomerRepository extends DatabaseObjectIdRepositoryBase<CustomerEntity> {
    constructor(
        @InjectDatabaseModel(CustomerEntity)
        private readonly customerRepository: Repository<CustomerEntity>
    ) {
        super(customerRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<CustomerDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    async isCompanyNameExists(
        companyId: string,
        name: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            company_name: ILike(name.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
