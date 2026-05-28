import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CustomerContactDoc,
    CustomerContactEntity,
} from '../entities/customer-contact.entity';

@Injectable()
export class CustomerContactRepository extends DatabaseObjectIdRepositoryBase<CustomerContactEntity> {
    constructor(
        @InjectDatabaseModel(CustomerContactEntity)
        private readonly contactRepository: Repository<CustomerContactEntity>
    ) {
        super(contactRepository);
    }

    async findByCustomerId(customerId: string): Promise<CustomerContactDoc[]> {
        return this.findAll({ customer_id: customerId, soft_delete: false });
    }

    async isEmailExists(
        companyId: string,
        email: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            email: ILike(email.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async softDeleteByCustomerId(customerId: string): Promise<void> {
        await this._repository.update(
            { customer_id: customerId, soft_delete: false } as any,
            { soft_delete: true } as any
        );
    }

    // Returns the most-recent SOFT-DELETED contact in the company that
    // matches an email (case-insensitive). Used by the customer revive
    // flow to detect "this email belonged to a previously deleted
    // customer — restore that record instead of creating a new one".
    async findSoftDeletedByEmail(
        companyId: string,
        email: string
    ): Promise<CustomerContactDoc | null> {
        const row = await this._repository.findOne({
            where: {
                company_id: companyId,
                email: ILike(email.trim()),
                soft_delete: true,
            } as any,
            order: { createdAt: 'DESC' as any },
        });
        return row || null;
    }
}
