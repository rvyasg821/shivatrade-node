import { Injectable } from '@nestjs/common';
import { Repository, LessThanOrEqual, MoreThan, Between } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    SubscriptionEntity,
    SubscriptionDoc,
} from '../entities/subscription.entity';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class SubscriptionRepository extends DatabaseObjectIdRepositoryBase<
    SubscriptionEntity
> {
    constructor(
        @InjectDatabaseModel(SubscriptionEntity)
        private readonly subscriptionRepository: Repository<SubscriptionEntity>
    ) {
        super(subscriptionRepository);
    }

    async findByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc> {
        return this.findOne(
            {
                user_id: userId,
                soft_delete: false,
            },
            options
        );
    }

    async findActiveByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc> {
        return this.findOne(
            {
                user_id: userId,
                status: true,
                soft_delete: false,
            },
            options
        );
    }

    async findAllActiveByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc[]> {
        return await this.findAll(
            {
                user_id: userId,
                status: true,
                soft_delete: false,
            },
            options as IDatabaseFindAllOptions
        );
    }

    async findAllByStatus(
        status: boolean,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                status,
                soft_delete: false,
            },
            options
        );
    }

    async findExpiringSoon(
        days: number = 7,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        return this.findAll(
            {
                status: true,
                next_date: { $lte: futureDate, $gt: new Date() },
                recurring: true,
                soft_delete: false,
            },
            options
        );
    }

    async findByPlanId(
        planId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                plan_id: planId,
                soft_delete: false,
            },
            options
        );
    }

    async countByStatus(status: boolean): Promise<number> {
        return this.getTotal({
            status,
            soft_delete: false,
        });
    }

    async countActiveSubscriptions(): Promise<number> {
        return this.countByStatus(true);
    }

    async findSubscriptionsForBilling(
        date: Date = new Date(),
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                status: true,
                next_date: { $lte: date },
                recurring: true,
                soft_delete: false,
            },
            options
        );
    }

    async findOnHold(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                hold: true,
                soft_delete: false,
            },
            options
        );
    }

    async findTrialSubscriptions(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                trial: true,
                soft_delete: false,
            },
            options
        );
    }

    async findLifetimeSubscriptions(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        return this.findAll(
            {
                is_lifetime: true,
                soft_delete: false,
            },
            options
        );
    }

    async findExpiredTrials(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]> {
        const currentDate = new Date();
        return this.findAll(
            {
                trial: true,
                status: true,
                end_date: { $lte: currentDate },
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Fetch subscriptions and manually enrich with user, plan, company data via raw SQL.
     * (user_id, plan_id, company_id are plain UUID columns, not TypeORM relations)
     */
    private async _enrichSubscriptions(subscriptions: SubscriptionEntity[]): Promise<any[]> {
        if (!subscriptions.length) return [];

        const userIds = [...new Set(subscriptions.map(s => s.user_id).filter(Boolean))];
        const planIds = [...new Set(subscriptions.map(s => s.plan_id).filter(Boolean))];
        const companyIds = [...new Set(subscriptions.map(s => s.company_id).filter(Boolean))];

        const [users, plans, companies] = await Promise.all([
            userIds.length ? this._repository.query(`SELECT _id, name, email, mobile FROM users WHERE _id = ANY($1::uuid[])`, [userIds]) : [],
            planIds.length ? this._repository.query(`SELECT _id, name, location_pricing, duration_type, features, tools FROM plans WHERE _id = ANY($1::uuid[])`, [planIds]) : [],
            companyIds.length ? this._repository.query(`SELECT _id, company_name, email FROM company WHERE _id = ANY($1::uuid[])`, [companyIds]) : [],
        ]);

        const userMap = new Map(users.map((u: any) => [u._id, u]));
        const planMap = new Map(plans.map((p: any) => [p._id, p]));
        const companyMap = new Map(companies.map((c: any) => [c._id, c]));

        return subscriptions.map(sub => ({
            ...sub,
            user: sub.user_id ? userMap.get(sub.user_id) || null : null,
            plan: sub.plan_id ? planMap.get(sub.plan_id) || null : null,
            company: sub.company_id ? companyMap.get(sub.company_id) || null : null,
        }));
    }

    async findAllWithJoins(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<any[]> {
        const subscriptions = await this.findAll(
            { ...find, soft_delete: false },
            options
        );
        return this._enrichSubscriptions(subscriptions as SubscriptionEntity[]);
    }

    async findOneWithJoins(_id: string): Promise<any> {
        const sub = await this.findOne({ _id, soft_delete: false });
        if (!sub) return null;
        const enriched = await this._enrichSubscriptions([sub as SubscriptionEntity]);
        return enriched[0] || null;
    }

    async findAllWithJoinsAndPopulatedTools(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<any[]> {
        return this.findAllWithJoins(find, options);
    }

    async findOneWithJoinsAndPopulatedTools(_id: string): Promise<any> {
        return this.findOneWithJoins(_id);
    }

    async bulkUpdateSubscriptions(
        filter: Record<string, any>,
        update: Record<string, any>
    ): Promise<{ modifiedCount: number }> {
        const result = await this.updateManyRaw(filter, update);
        return { modifiedCount: result.affected };
    }

    async DeactivateExceptIdByUserId(userId: string, subscriptionId: string): Promise<{ modifiedCount: number }> {
        const result = await this._repository.createQueryBuilder()
            .update(SubscriptionEntity)
            .set({ status: false } as any)
            .where('user_id = :userId', { userId })
            .andWhere('_id != :subscriptionId', { subscriptionId })
            .execute();
        return { modifiedCount: result.affected || 0 };
    }

    async findAllActiveTodaysNextBillingDate(): Promise<SubscriptionDoc[]> {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;

        return this.findAll(
            {
                status: true,
                soft_delete: false,
                recurring: true,
                next_date: {
                    $gte: new Date(`${currentDate}T00:00:00Z`),
                    $lt: new Date(`${currentDate}T23:59:59Z`)
                },
            }
        );
    }
}
