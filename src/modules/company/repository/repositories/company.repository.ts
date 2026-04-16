import { Injectable } from '@nestjs/common';
import { Repository, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    CompanyEntity,
    CompanyDocument,
} from '@modules/company/repository/entities/company.entity';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
} from '@common/database/interfaces/database.interface';
import { UserEntity } from '@modules/user/repository/entities/user.entity';
import { SubscriptionEntity } from '@modules/subscription/repository/entities/subscription.entity';

@Injectable()
export class CompanyRepository extends DatabaseObjectIdRepositoryBase<
    CompanyEntity
> {
    constructor(
        @InjectDatabaseModel(CompanyEntity)
        private readonly companyRepository: Repository<CompanyEntity>
    ) {
        super(companyRepository);
    }

    async findAllWithUser<T = CompanyDocument>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return super.findAll<T>(findQuery, options);
    }

    async findOneWithUser<T = CompanyDocument>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const findQuery = {
            _id,
            soft_delete: { $eq: false },
        };
        return super.findOne<T>(findQuery, options);
    }

    async getTotalWithUser(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return this.getTotal(findQuery, options);
    }

    async findAllActive<T = CompanyDocument>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return this.findAll<T>(findQuery, options);
    }

    async findOneActive<T = CompanyDocument>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const findQuery = { _id, soft_delete: { $ne: true } };
        return this.findOne<T>(findQuery, options);
    }

    async getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return this.getTotal(findQuery, options);
    }

    async existByEmail(email: string): Promise<boolean> {
        const company = await this.findOne({
            email: email.toLowerCase(),
            soft_delete: { $ne: true },
        });
        return !!company;
    }

    async existByEmailExcludingId(
        email: string,
        excludeId: string
    ): Promise<boolean> {
        const company = await this.findOne({
            email: email.toLowerCase(),
            _id: { $ne: excludeId },
            soft_delete: { $ne: true },
        });
        return !!company;
    }

    // Override base methods to include soft delete filtering
    async findAll<T = CompanyDocument>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return super.findAll<T>(findQuery, options);
    }

    async findOne<T = CompanyDocument>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return super.findOne<T>(findQuery, options);
    }

    async findOneById<T = CompanyDocument>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const findQuery = {
            _id,
            soft_delete: { $ne: true },
        };
        return super.findOne<T>(findQuery, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        const findQuery = { ...find, soft_delete: { $ne: true } };
        return super.getTotal(findQuery, options);
    }

    // Methods to explicitly include soft deleted records
    async findAllIncludingDeleted<T = CompanyDocument>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        return super.findAll<T>(find, options);
    }

    async findOneIncludingDeleted<T = CompanyDocument>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        return super.findOne<T>(find, options);
    }

    async findOneAndUpdate<T = CompanyDocument>(
        id: string,
        options?: any
    ): Promise<T> {
        const entity = await this._repository.findOne({
            where: { user_id: id } as any,
        });
        if (!entity) return null;
        Object.assign(entity, options);
        return this._repository.save(entity) as unknown as T;
    }

    async getTotalIncludingDeleted(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return super.getTotal(find, options);
    }

    async findAllWithUserByFilteringPlanIdFromSubscription<T = CompanyDocument>(
        planId: string,
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        const qb = this._repository.createQueryBuilder('company')
            .leftJoinAndSelect('company.user_id', 'user')
            .innerJoin(
                'subscriptions',
                'subscription',
                'subscription._id = company.subscription_id AND subscription.plan_id = :planId',
                { planId }
            )
            .where('company.soft_delete != true');

        // Apply additional filters
        if (find) {
            Object.entries(find).forEach(([key, value], index) => {
                qb.andWhere(`company.${key} = :param${index}`, { [`param${index}`]: value });
            });
        }

        // Apply pagination
        if (options?.paging?.limit) {
            qb.take(options.paging.limit);
        }
        if (options?.paging?.offset) {
            qb.skip(options.paging.offset);
        }

        return qb.getMany() as unknown as T[];
    }

    async getTotalWithUserByFilteringPlanIdFromSubscription(
        planId: string,
        find?: Record<string, any>
    ): Promise<number> {
        const qb = this._repository.createQueryBuilder('company')
            .innerJoin(
                'subscriptions',
                'subscription',
                'subscription._id = company.subscription_id AND subscription.plan_id = :planId',
                { planId }
            )
            .where('company.soft_delete != true');

        // Apply additional filters
        if (find) {
            Object.entries(find).forEach(([key, value], index) => {
                qb.andWhere(`company.${key} = :param${index}`, { [`param${index}`]: value });
            });
        }

        return qb.getCount();
    }

    async updateRaw(
        filter: Record<string, any>,
        update: Record<string, any>,
        options?: any
    ): Promise<any> {
        return super.updateRaw(filter, update, options);
    }

    async hardDelete(_id: string): Promise<boolean> {
        const result = await this._repository.delete({ _id } as any);
        return (result.affected || 0) > 0;
    }
}
