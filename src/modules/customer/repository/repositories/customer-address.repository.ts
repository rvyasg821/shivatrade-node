import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CustomerAddressDoc,
    CustomerAddressEntity,
} from '../entities/customer-address.entity';

@Injectable()
export class CustomerAddressRepository extends DatabaseObjectIdRepositoryBase<CustomerAddressEntity> {
    constructor(
        @InjectDatabaseModel(CustomerAddressEntity)
        private readonly caRepository: Repository<CustomerAddressEntity>
    ) {
        super(caRepository);
    }

    async findByCustomerId(customerId: string): Promise<CustomerAddressDoc[]> {
        return this.findAll({ customer_id: customerId, soft_delete: false });
    }

    async findByCustomerIds(customerIds: string[]): Promise<CustomerAddressDoc[]> {
        if (customerIds.length === 0) return [];
        return this._repository.find({
            where: { customer_id: In(customerIds), soft_delete: false } as any,
        });
    }

    async softDeleteByCustomerId(customerId: string): Promise<void> {
        await this._repository.update(
            { customer_id: customerId, soft_delete: false } as any,
            { soft_delete: true } as any
        );
    }
}
