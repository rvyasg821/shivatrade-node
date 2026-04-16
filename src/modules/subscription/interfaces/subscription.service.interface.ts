import {
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { SubscriptionDoc } from '../repository/entities/subscription.entity';
import { SubscriptionCreateRequestDto } from '../dtos/request/subscription.create.request.dto';
import { SubscriptionUpdateRequestDto } from '../dtos/request/subscription.update.request.dto';
import { SubscriptionListResponseDto } from '../dtos/response/subscription.list.response.dto';
import { SubscriptionGetResponseDto } from '../dtos/response/subscription.get.response.dto';
import { ISubscriptionEntity } from './subscription.interface';

export interface ISubscriptionService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc>;

    findByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc>;

    findActiveByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SubscriptionDoc>;

    existByUserId(
        userId: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;

    create(
        data: SubscriptionCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<SubscriptionDoc>;

    update(
        repository: SubscriptionDoc,
        data: SubscriptionUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<SubscriptionDoc>;

    updateStatus(
        repository: SubscriptionDoc,
        status: boolean,
        options?: IDatabaseSaveOptions
    ): Promise<SubscriptionDoc>;

    softDelete(
        repository: SubscriptionDoc,
        options?: IDatabaseSaveOptions
    ): Promise<SubscriptionDoc>;

    deleteMany(
        find: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean>;

    cancelSubscription(
        userId: string,
        options?: IDatabaseSaveOptions
    ): Promise<SubscriptionDoc>;

    findByPlanId(
        planId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    findExpiringSoon(
        days?: number,
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    countActiveSubscriptions(): Promise<number>;

    countByStatus(status: boolean): Promise<number>;

    findTrialSubscriptions(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    findLifetimeSubscriptions(
        options?: IDatabaseFindAllOptions
    ): Promise<SubscriptionDoc[]>;

    mapList(subscriptions: SubscriptionDoc[] | ISubscriptionEntity[]): SubscriptionListResponseDto[];

    mapGet(subscription: SubscriptionDoc | ISubscriptionEntity): SubscriptionGetResponseDto;

    // Methods for fetching subscriptions with populated tools
    findAllWithJoinsAndPopulatedTools(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<any[]>;

    findOneWithJoinsAndPopulatedTools(_id: string): Promise<any>;
}
