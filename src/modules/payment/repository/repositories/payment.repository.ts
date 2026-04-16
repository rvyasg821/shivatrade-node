import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PaymentDoc, PaymentEntity, ENUM_PAYMENT_STATUS } from '../entities/payment.entity';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class PaymentRepository extends DatabaseObjectIdRepositoryBase<PaymentEntity> {
    constructor(
        @InjectDatabaseModel(PaymentEntity)
        private readonly paymentRepository: Repository<PaymentEntity>
    ) {
        super(paymentRepository);
    }

    async findAll<T = PaymentDoc>(find?: Record<string, any>, options?: IDatabaseFindAllOptions): Promise<T[]> {
        const findQuery = { ...find, soft_delete: false };
        return super.findAll<T>(findQuery, options);
    }

    async findOne<T = PaymentDoc>(find: Record<string, any>, options?: IDatabaseFindOneOptions): Promise<T> {
        const findQuery = { ...find, soft_delete: false };
        return super.findOne<T>(findQuery, options);
    }

    async findOneById<T = PaymentDoc>(_id: string, options?: IDatabaseFindOneOptions): Promise<T> {
        const findQuery = { _id, soft_delete: false };
        return super.findOne<T>(findQuery, options);
    }

    async findOneSort(find: Record<string, any>, sortField: string = 'createdAt', sortOrder: number = -1): Promise<PaymentDoc> {
        const sortObj: Record<string, any> = {};
        sortObj[sortField] = sortOrder === -1 ? 'DESC' : 'ASC';

        return super.findOne<PaymentDoc>(
            { ...find, soft_delete: false },
            { order: sortObj }
        );
    }

    async updateById(id: string, updateData: Partial<PaymentEntity>): Promise<PaymentDoc> {
        const entity = await this._repository.findOne({ where: { _id: id } as any });
        if (!entity) return null;
        Object.assign(entity, updateData);
        return this._repository.save(entity) as any as Promise<PaymentDoc>;
    }

    async getTotal(find?: Record<string, any>): Promise<number> {
        const findQuery = { ...find, soft_delete: false };
        return super.getTotal(findQuery);
    }

    async findByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<PaymentDoc[]> {
        return super.findAll<PaymentDoc>(
            { user_id: userId, soft_delete: false },
            {
                ...options,
                order: {
                    createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                },
            }
        );
    }

    async findByRequestId(requestId: string): Promise<PaymentDoc> {
        return this.findOne({ request_id: requestId });
    }

    async findByChargeId(chargeId: string): Promise<PaymentDoc> {
        return this.findOne({ charge_id: chargeId });
    }

    async updateStatus(
        repository: PaymentDoc,
        status: ENUM_PAYMENT_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<PaymentDoc> {
        repository.status = status;

        if (status === ENUM_PAYMENT_STATUS.COMPLETED) {
            repository.paid = true;
        }

        return this.save(repository, options);
    }

    async softDeleteById(paymentId: string): Promise<PaymentDoc> {
        const entity = await this._repository.findOne({ where: { _id: paymentId } as any });
        if (!entity) return null;
        (entity as any).soft_delete = true;
        return this._repository.save(entity) as any as Promise<PaymentDoc>;
    }

    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }
}
